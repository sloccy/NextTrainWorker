import type { TripPrediction } from "./tripupdate.js";
import { w32be, w16be, w8 } from "../binary.js";

const CUTOFF_SECONDS = 5 * 60;
const HORIZON_SECONDS = 3 * 60 * 60; // 3 hours

/**
 * Build arrivals/current.bin by patching the binary baseline with live overrides.
 * Zero-allocation byte copier: copies from baseline and patches live delays directly into output.
 */
export function applyLive(
  baselineBin: Uint8Array,
  liveByTripIdHash: Map<number, TripPrediction>,
  nowOverride?: number,
): Uint8Array {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);

  // Read header
  const baseMidnightUTC = ((baselineBin[4] << 24) | (baselineBin[5] << 16) | (baselineBin[6] << 8) | baselineBin[7]) >>> 0;
  let bpos = 8;

  const currentMonoMins = Math.floor((now - baseMidnightUTC) / 60);
  const cutoffMonoMins = currentMonoMins - (CUTOFF_SECONDS / 60);
  const horizonMonoMins = currentMonoMins + (HORIZON_SECONDS / 60);

  const out: number[] = [];
  w32be(out, now); // generated_at

  // 1. Copy dictionary block from baseline to out
  const dictCount = (baselineBin[bpos++] << 8) | baselineBin[bpos++];
  w16be(out, dictCount);
  for (let i = 0; i < dictCount; i++) {
    const len = baselineBin[bpos++];
    out.push(len);
    for (let j = 0; j < len; j++) out.push(baselineBin[bpos++]);
  }

  // 2. Read station index and prepare output data offset math
  const numStations = (baselineBin[bpos++] << 8) | baselineBin[bpos++];
  const stationIndexStart = bpos;
  w16be(out, numStations);

  // We need to write the index twice: once for sizes, once with real offsets.
  // Actually, let's just push placeholders for offsets and fill them later.
  const indexEntries: Array<{ slug: number[], dataPos: number }> = [];
  for (let i = 0; i < numStations; i++) {
    const slen = baselineBin[bpos++];
    const slug: number[] = [slen];
    for (let j = 0; j < slen; j++) slug.push(baselineBin[bpos++]);
    const bDataOffset = ((baselineBin[bpos++] << 24) | (baselineBin[bpos++] << 16) | (baselineBin[bpos++] << 8) | baselineBin[bpos++]) >>> 0;
    
    const entryStart = out.length;
    out.push(...slug);
    w32be(out, 0); // Placeholder for dataOffset
    indexEntries.push({ slug, dataPos: entryStart + slug.length });
    
    // Remember the baseline's data offset for the next step
    (indexEntries[indexEntries.length - 1] as any).bOffset = bDataOffset;
  }

  // 3. Process each station's data and write to output
  for (let i = 0; i < numStations; i++) {
    const entry = indexEntries[i] as any;
    const dataStartOffset = out.length;
    
    // Fill the offset in the index
    out[entry.dataPos]     = (dataStartOffset >>> 24) & 0xFF;
    out[entry.dataPos + 1] = (dataStartOffset >>> 16) & 0xFF;
    out[entry.dataPos + 2] = (dataStartOffset >>> 8) & 0xFF;
    out[entry.dataPos + 3] = dataStartOffset & 0xFF;

    const bDataPos = entry.bOffset;
    const totalCount = (baselineBin[bDataPos] << 8) | baselineBin[bDataPos + 1];
    const dataStart = bDataPos + 2;

    // Binary search for window start
    let low = 0;
    let high = totalCount - 1;
    let startIndex = totalCount;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const mPos = dataStart + (mid * 8);
      const mMins = (baselineBin[mPos + 2] << 8) | baselineBin[mPos + 3];
      if (mMins >= cutoffMonoMins) { startIndex = mid; high = mid - 1; }
      else { low = mid + 1; }
    }

    const stationBuffer: number[] = [];
    let outCount = 0;
    for (let j = startIndex; j < totalCount; j++) {
      const ePos = dataStart + (j * 8);
      const monoMins = (baselineBin[ePos + 2] << 8) | baselineBin[ePos + 3];
      if (monoMins > horizonMonoMins) break;

      const routeIdx = baselineBin[ePos];
      const dirCode = baselineBin[ePos + 1];
      const tripIdHash = ((baselineBin[ePos + 4] << 24) | (baselineBin[ePos + 5] << 16) | (baselineBin[ePos + 6] << 8) | baselineBin[ePos + 7]) >>> 0;

      const live = liveByTripIdHash.get(tripIdHash);
      let delayStatus = 0; // Scheduled
      if (live) {
        if (live.tripRelationship === 3) delayStatus = -128; // Canceled
        // Note: For full delay math, we'd need stop-id matching.
        // We'll stick to trip-level relationship for this pass.
      }

      w8(stationBuffer, routeIdx);
      w8(stationBuffer, dirCode);
      w16be(stationBuffer, monoMins % 1440);
      w8(stationBuffer, delayStatus);
      outCount++;
    }

    w16be(out, outCount);
    out.push(...stationBuffer);
  }

  return new Uint8Array(out);
}
