import type { Env } from "../types.js";
import { getArrivalsBin, writeArrivalsBin } from "../binary/r2.js";
import { putArrivalsBinInCache } from "../binary/cache.js";
import { getCachedOutput, setCachedOutput } from "../binary/module-cache.js";
import { fetchTripUpdates } from "../live/fetch.js";
import { fetchVehiclePositions } from "../live/vehicles-fetch.js";
import type { VehicleEvent } from "../live/vehicles-decode.js";
import { patchLive } from "../live/patch.js";
import { fingerprint } from "../binary/fingerprint.js";
import { TEMPLATE_BYTES, STOP_OFFSETS, STOP_ID_TO_SLUG } from "../generated/offsets.js";

const TEMPLATE_LEN = TEMPLATE_BYTES.length;
const _te = new TextEncoder();

let lastFingerprint = -1;

function buildVpSection(events: VehicleEvent[]): Uint8Array {
  // For each vehicle event, look up (route_idx, dir, sched_mins) at the current stop.
  // VP entry: [u8 route_idx][u8 dir][u16 sched_mins][u8 stop_id_len][stop_id_bytes]
  type VpEntry = { routeIdx: number; dir: number; schedMins: number; stopIdBytes: Uint8Array };
  const entries: VpEntry[] = [];
  const seenTrips = new Set<string>();

  for (const ev of events) {
    if (seenTrips.has(ev.tripId)) continue;
    const stopMap = STOP_OFFSETS.get(ev.tripId);
    if (!stopMap) continue; // non-rail trip
    const offs = stopMap.get(ev.stopId);
    if (!offs || offs.length === 0) continue; // stop not in schedule
    const off = offs[0];
    const routeIdx  = TEMPLATE_BYTES[off - 4];
    const dir       = TEMPLATE_BYTES[off - 3];
    const schedMins = TEMPLATE_BYTES[off - 2] | (TEMPLATE_BYTES[off - 1] << 8);
    const slug = STOP_ID_TO_SLUG.get(ev.stopId);
    if (!slug) continue;
    const stopIdBytes = _te.encode(slug);
    entries.push({ routeIdx, dir, schedMins, stopIdBytes });
    seenTrips.add(ev.tripId);
  }

  // Allocate conservatively: 2 (count) + per entry up to 5 + 255 bytes
  const buf = new Uint8Array(2 + entries.length * 30);
  let pos = 0;
  buf[pos++] = entries.length & 0xFF;
  buf[pos++] = (entries.length >>> 8) & 0xFF;
  for (const e of entries) {
    const slen = Math.min(e.stopIdBytes.length, 255);
    buf[pos++] = e.routeIdx;
    buf[pos++] = e.dir;
    buf[pos++] = e.schedMins & 0xFF;
    buf[pos++] = (e.schedMins >>> 8) & 0xFF;
    buf[pos++] = slen;
    buf.set(e.stopIdBytes.subarray(0, slen), pos);
    pos += slen;
  }
  return buf.subarray(0, pos);
}

function assembleFullBin(templateOut: Uint8Array, vpSection: Uint8Array): Uint8Array {
  // Layout: [template bytes][VP section][u32LE VP offset]
  // The u32LE footer lets scan.ts find the VP section without knowing TEMPLATE_LEN.
  const full = new Uint8Array(templateOut.length + vpSection.length + 4);
  full.set(templateOut);
  full.set(vpSection, templateOut.length);
  const vpOff = templateOut.length;
  full[vpOff + vpSection.length]     = vpOff & 0xFF;
  full[vpOff + vpSection.length + 1] = (vpOff >>> 8) & 0xFF;
  full[vpOff + vpSection.length + 2] = (vpOff >>> 16) & 0xFF;
  full[vpOff + vpSection.length + 3] = (vpOff >>> 24) & 0xFF;
  return full;
}

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  const tStart = Date.now();
  const storedFull = getCachedOutput();

  const [tripResult, vpResult, fromR2] = await Promise.all([
    fetchTripUpdates(),
    fetchVehiclePositions(),
    storedFull
      ? Promise.resolve(null)
      : getArrivalsBin(env).catch((err: unknown) => {
          console.error("[refresh] R2 read failed:", err);
          return null;
        }),
  ]);
  const tFetched = Date.now();

  if (!tripResult.fresh) {
    console.log("[refresh] 304 or stale, skipped");
    return;
  }

  // Slice stored binary to template-only so patchLive's set() call doesn't overflow.
  const previousFull = storedFull ?? fromR2;
  const previous = previousFull ? previousFull.subarray(0, TEMPLATE_LEN) : null;

  const { tripStatus, stopOverrides } = tripResult.data;
  const templateOut = patchLive(tripStatus, stopOverrides, previous);
  const vpSection   = buildVpSection(vpResult.value);
  const out         = assembleFullBin(templateOut, vpSection);
  setCachedOutput(out);
  const tPatched = Date.now();

  let stopsCount = 0;
  for (const m of stopOverrides.values()) stopsCount += m.size;

  const fp = fingerprint(out);
  const changed = fp !== lastFingerprint;
  lastFingerprint = fp;

  console.log(
    `[refresh] trips=${tripStatus.size} stops=${stopsCount} vps=${vpResult.value.length} fetch=${tFetched - tStart}ms decode=${tripResult.decodeMs}ms patch=${tPatched - tFetched}ms changed=${changed}`,
  );

  if (changed) {
    ctx.waitUntil(writeArrivalsBin(env, out));
    putArrivalsBinInCache(ctx, out);
  }
}
