/**
 * Scan current.bin for a station slug, filter by route:dir pairs, return filtered bytes.
 *
 * current.bin layout:
 *   [u32 generated_at][u32 base_midnight_utc]
 *   [u16 dict_count] dictionary: dict_count × ([u8 len][chars])
 *   [u16 num_stations]
 *   index: num_stations × ([u8 slug_len][slug][u32 data_offset])
 *   data: per station: [u16 count] × ([u8 route_idx][u8 dir][u16 mono_mins][s8 delay_status])
 *
 * Response wire format for /a:
 *   [u8 count] × ([u8 route_len][route_chars][u8 dir][u8 time_hi][u8 time_lo][s8 delay_status])
 */
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

  type Entry = { dOff: number; dLen: number; dirCode: number; predictedMins: number; delayStatus: number };
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

    entries.push({ dOff, dLen, dirCode, predictedMins: monoMins + delayMins, delayStatus });
  }

  entries.sort((a, b) => a.predictedMins - b.predictedMins);

  const outCount = Math.min(entries.length, 10);
  let outBytes = 1;
  for (let i = 0; i < outCount; i++) outBytes += 5 + entries[i].dLen;
  const res = new Uint8Array(outBytes);
  let wp = 0;
  res[wp++] = outCount;
  for (let i = 0; i < outCount; i++) {
    const { dOff, dLen, dirCode, predictedMins, delayStatus } = entries[i];
    const timeMins = predictedMins % 1440;
    res[wp++] = dLen;
    for (let k = 0; k < dLen; k++) res[wp++] = bin[dOff + k];
    res[wp++] = dirCode;
    res[wp++] = (timeMins >>> 8) & 0xFF;
    res[wp++] = timeMins & 0xFF;
    res[wp++] = delayStatus;
  }
  if (wp !== outBytes) throw new Error(`scan: wrote ${wp}, allocated ${outBytes}`);
  return { buf: res, generatedAt };
}
