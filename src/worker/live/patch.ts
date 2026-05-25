import { TEMPLATE_BYTES, TRIP_OFFSETS, STOP_OFFSETS } from "../generated/offsets.js";

const REUSABLE_OUT = new Uint8Array(TEMPLATE_BYTES.length || 65536);

function sameTemplateVersion(previous: Uint8Array, template: Uint8Array): boolean {
  return previous.length === template.length &&
    previous[4] === template[4] &&
    previous[5] === template[5] &&
    previous[6] === template[6] &&
    previous[7] === template[7];
}

export function patchLive(
  tripStatus: Map<string, number>,
  stopOverrides: Map<string, Map<string, number>>,
  previous?: Uint8Array | null,
): Uint8Array {
  return patchLiveWith(
    REUSABLE_OUT,
    TEMPLATE_BYTES,
    TRIP_OFFSETS,
    STOP_OFFSETS,
    tripStatus,
    stopOverrides,
    previous,
  );
}

export function patchLiveWith(
  out: Uint8Array,
  template: Uint8Array,
  tripOffsets: ReadonlyMap<string, Uint32Array>,
  stopOffsets: ReadonlyMap<string, ReadonlyMap<string, Uint32Array>>,
  tripStatus: ReadonlyMap<string, number>,
  stopOverrides: ReadonlyMap<string, ReadonlyMap<string, number>>,
  previous?: Uint8Array | null,
): Uint8Array {
  if (previous && previous.buffer === out.buffer && previous.byteOffset === out.byteOffset) {
    // previous IS out (module-scope cache) — already in place, no copy needed
  } else if (previous && sameTemplateVersion(previous, template)) {
    out.set(previous);
  } else {
    out.set(template);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  out[0] = nowSec & 0xFF;
  out[1] = (nowSec >>> 8) & 0xFF;
  out[2] = (nowSec >>> 16) & 0xFF;
  out[3] = (nowSec >>> 24) & 0xFF;
  const baseMidnight = (template[4] | (template[5] << 8) | (template[6] << 16) | (template[7] << 24)) >>> 0;

  for (const [tripId, rel] of tripStatus) {
    if (rel !== 3) continue;
    const offs = tripOffsets.get(tripId);
    if (!offs) continue;
    const status = rel === 3 ? 128 : 129;
    for (let i = 0; i < offs.length; i++) out[offs[i]] = status;
  }

  for (const [tripId, byStop] of stopOverrides) {
    const outer = stopOffsets.get(tripId);
    if (!outer) continue;
    for (const [stopId, statusByte] of byStop) {
      const offs = outer.get(stopId);
      if (!offs) continue;
      for (let i = 0; i < offs.length; i++) {
        if (offs.length > 1) {
          const monoMins = template[offs[i] - 2] | (template[offs[i] - 1] << 8);
          if (Math.abs(baseMidnight + monoMins * 60 - nowSec) > 12 * 3600) continue;
        }
        out[offs[i]] = statusByte;
      }
    }
  }

  return out.subarray(0, template.length);
}
