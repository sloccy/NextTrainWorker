/**
 * Scan current.bin for a station slug, filter by route:dir pairs, return filtered bytes.
 *
 * current.bin layout:
 *   [u32 generated_at][u32 base_midnight_utc]
 *   [u16 dict_count] dictionary: dict_count × ([u8 len][chars])
 *   [u16 num_stations]
 *   index: num_stations × ([u8 slug_len][slug][u32 data_offset])
 *   data: per station: [u16 count] × ([u8 route_idx][u8 dir][u16 mono_mins][s8 delay_status])
 *   [VP section: u16 count × ([u8 route_idx][u8 dir][u16 sched_mins][u8 stop_id_len][stop_id_bytes])]
 *   [u32LE VP section offset]   ← last 4 bytes
 *
 * Response wire format for /a:
 *   [u8 count] × ([u8 route_len][route_chars][u8 dir][u8 time_hi][u8 time_lo][s8 delay_status]
 *                  [u8 at_stop_len][at_stop_bytes])
 *
 * at_stop_len = 0 means no vehicle position data for this trip.
 */

const _td = new TextDecoder();

/** Parse the trailing VP section into a map for O(1) lookup per entry. */
function parseVpMap(bin: Uint8Array): Map<number, { schedMins: number; stopId: string }[]> {
  // map key = (routeIdx << 8) | dir
  const map = new Map<number, { schedMins: number; stopId: string }[]>();
  if (bin.length < 6) return map; // too small to have footer + VP

  const footerOff = bin.length - 4;
  const vpStart = (bin[footerOff] | (bin[footerOff + 1] << 8) | (bin[footerOff + 2] << 16) | (bin[footerOff + 3] << 24)) >>> 0;
  if (vpStart >= footerOff) return map; // no VP section or malformed footer

  let pos = vpStart;
  const count = bin[pos++] | (bin[pos++] << 8);
  for (let i = 0; i < count && pos < footerOff; i++) {
    const routeIdx = bin[pos++];
    const dir      = bin[pos++];
    const schedMins = bin[pos++] | (bin[pos++] << 8);
    const slen     = bin[pos++];
    const stopId   = _td.decode(bin.subarray(pos, pos + slen));
    pos += slen;
    const key = (routeIdx << 8) | dir;
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push({ schedMins, stopId });
  }
  return map;
}

/** Find the current stop for the train approaching this station entry.
 *  Consumes the matched VP entry so the same vehicle can't bleed to a later
 *  train on the same route+direction. Returns empty string if no VP available. */
function findCurrentStop(
  vpMap: Map<number, { schedMins: number; stopId: string }[]>,
  routeIdx: number,
  dirCode: number,
  stationMonoMins: number,
): string {
  const vps = vpMap.get((routeIdx << 8) | dirCode);
  if (!vps) return "";
  let bestIdx = -1, bestMins = -1;
  for (let i = 0; i < vps.length; i++) {
    if (vps[i].schedMins <= stationMonoMins && vps[i].schedMins > bestMins) {
      bestMins = vps[i].schedMins;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return "";
  const stopId = vps[bestIdx].stopId;
  vps.splice(bestIdx, 1);
  return stopId;
}

export function scanArrivalsBin(
  bin: Uint8Array,
  slug: string,
  pairs: Array<{ route: string; dir: string }>,
): { buf: Uint8Array; generatedAt: number } | null {
  if (bin.length < 10) return null;

  let pos = 0;
  const generatedAt = (bin[pos++] | (bin[pos++] << 8) | (bin[pos++] << 16) | (bin[pos++] << 24)) >>> 0;
  const baseMidnightUTC = (bin[pos++] | (bin[pos++] << 8) | (bin[pos++] << 16) | (bin[pos++] << 24)) >>> 0;
  const cutoffMonoMins = Math.floor((Date.now() / 1000 - baseMidnightUTC) / 60) - 2;

  const dictCount = bin[pos++] | (bin[pos++] << 8);
  const dictOffsets: number[] = [];
  for (let i = 0; i < dictCount; i++) {
    const len = bin[pos++];
    dictOffsets.push(pos);
    pos += len;
  }

  const numStations = bin[pos++] | (bin[pos++] << 8);

  let dataOffset = -1;
  for (let i = 0; i < numStations; i++) {
    const slen = bin[pos++];
    let match = slen === slug.length;
    if (match) {
      for (let j = 0; j < slen; j++) {
        if (bin[pos + j] !== slug.charCodeAt(j)) { match = false; break; }
      }
    }
    pos += slen;
    const off = (bin[pos] | (bin[pos + 1] << 8) | (bin[pos + 2] << 16) | (bin[pos + 3] << 24)) >>> 0;
    pos += 4;
    if (match) { dataOffset = off; break; }
  }

  if (dataOffset < 0) return null;

  pos = dataOffset;
  const count = bin[pos++] | (bin[pos++] << 8);

  const vpMap = parseVpMap(bin);

  type Entry = {
    dOff: number; dLen: number; dirCode: number;
    predictedMins: number; delayStatus: number;
    routeIdx: number; monoMins: number;
  };
  const entries: Entry[] = [];

  for (let i = 0; i < count; i++) {
    const routeIdx = bin[pos++];
    const dirCode = bin[pos++];
    const monoMins = bin[pos++] | (bin[pos++] << 8);
    const delayStatus = bin[pos++];

    let delayMins = 0;
    if (delayStatus > 0 && delayStatus <= 127) {
      delayMins = delayStatus;
    } else if (delayStatus >= 131) {
      delayMins = delayStatus - 256;
    }

    if (monoMins + delayMins < cutoffMonoMins) continue;

    const dOff = dictOffsets[routeIdx];
    const dLen = bin[dOff - 1];
    let pairMatch = false;
    for (let j = 0; j < pairs.length; j++) {
      const p = pairs[j];
      if (p.dir.charCodeAt(0) !== dirCode) continue;
      if (dLen !== p.route.length) continue;
      let match = true;
      for (let k = 0; k < dLen; k++) {
        if (bin[dOff + k] !== p.route.charCodeAt(k)) { match = false; break; }
      }
      if (match) { pairMatch = true; break; }
    }
    if (!pairMatch) continue;

    entries.push({ dOff, dLen, dirCode, predictedMins: monoMins + delayMins, delayStatus, routeIdx, monoMins });
  }

  entries.sort((a, b) => a.predictedMins - b.predictedMins);

  const outCount = Math.min(entries.length, 10);
  const _te = new TextEncoder();

  // Two-pass VP assignment: live trips (have TripUpdate data) claim VPs before
  // pure SCHED trips, since TripUpdate confirms the vehicle's trip identity.
  // Only the 2 soonest arrivals per route:dir get location data — later trains
  // are too far away for current vehicle position to be meaningful.
  const topEntries = entries.slice(0, outCount);
  const vpEligible = new Set<Entry>();
  const routeDirCount = new Map<number, number>();
  for (const e of topEntries) {
    const key = (e.routeIdx << 8) | e.dirCode;
    const cnt = routeDirCount.get(key) ?? 0;
    if (cnt < 2) { vpEligible.add(e); routeDirCount.set(key, cnt + 1); }
  }
  const vpResult = new Map<Entry, string>();
  for (const e of topEntries) {
    if (e.delayStatus === 0 || !vpEligible.has(e)) continue;
    const s = findCurrentStop(vpMap, e.routeIdx, e.dirCode, e.monoMins);
    if (s) vpResult.set(e, s);
  }
  for (const e of topEntries) {
    if (e.delayStatus !== 0 || !vpEligible.has(e)) continue;
    const s = findCurrentStop(vpMap, e.routeIdx, e.dirCode, e.monoMins);
    if (s) vpResult.set(e, s);
  }
  const atStops: Uint8Array[] = topEntries.map(e => {
    const s = vpResult.get(e) || '';
    return s ? _te.encode(s) : new Uint8Array(0);
  });

  let outBytes = 1; // count byte
  for (let i = 0; i < outCount; i++) outBytes += 5 + entries[i].dLen + 1 + atStops[i].length;
  const res = new Uint8Array(outBytes);
  let wp = 0;
  res[wp++] = outCount;
  for (let i = 0; i < outCount; i++) {
    const { dOff, dLen, dirCode, predictedMins, delayStatus } = entries[i];
    const timeMins = ((predictedMins % 1440) + 1440) % 1440;
    res[wp++] = dLen;
    for (let k = 0; k < dLen; k++) res[wp++] = bin[dOff + k];
    res[wp++] = dirCode;
    res[wp++] = (timeMins >>> 8) & 0xFF;
    res[wp++] = timeMins & 0xFF;
    res[wp++] = delayStatus;
    res[wp++] = atStops[i].length;
    res.set(atStops[i], wp);
    wp += atStops[i].length;
  }
  if (wp !== outBytes) throw new Error(`scan: wrote ${wp}, allocated ${outBytes}`);
  return { buf: res, generatedAt };
}
