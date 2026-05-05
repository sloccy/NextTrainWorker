import type { TripPrediction } from "./tripupdate.js";

const CUTOFF_SECONDS = 5 * 60;
const HORIZON_SECONDS = 3 * 60 * 60; // 3 hours

/**
 * Build arrivals/current.bin by patching the binary baseline with live overrides.
 * Highly optimized for < 10ms CPU time using TypedArrays and direct memory copying.
 */
export function applyLive(
  baselineBin: Uint8Array,
  liveByTripIdHash: Map<number, TripPrediction>,
  nowOverride?: number,
): Uint8Array {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);

  // Read header from baseline
  // Header: [u32 genAt][u32 baseMidnightUTC]
  const viewB = new DataView(baselineBin.buffer, baselineBin.byteOffset, baselineBin.byteLength);
  const baseMidnightUTC = viewB.getUint32(4);
  let bpos = 8;

  const currentMonoMins = Math.floor((now - baseMidnightUTC) / 60);
  const cutoffMonoMins = currentMonoMins - (CUTOFF_SECONDS / 60);
  const horizonMonoMins = currentMonoMins + (HORIZON_SECONDS / 60);

  // Pre-allocate output buffer (64KB)
  const out = new Uint8Array(65536);
  const viewO = new DataView(out.buffer);
  let opos = 0;

  viewO.setUint32(opos, now); opos += 4; // generated_at

  // 1. Copy dictionary block from baseline to out
  const dictCount = viewB.getUint16(bpos); bpos += 2;
  viewO.setUint16(opos, dictCount); opos += 2;

  for (let i = 0; i < dictCount; i++) {
    const len = baselineBin[bpos++];
    out[opos++] = len;
    out.set(baselineBin.subarray(bpos, bpos + len), opos);
    opos += len;
    bpos += len;
  }

  // 2. Read station index and prepare output data offset math
  const numStations = viewB.getUint16(bpos); bpos += 2;
  viewO.setUint16(opos, numStations); opos += 2;

  // Track the offsets we need to patch later
  const patchOffsets: Array<{ opos: number, bDataOffset: number }> = [];

  for (let i = 0; i < numStations; i++) {
    const slen = baselineBin[bpos++];
    out[opos++] = slen;
    out.set(baselineBin.subarray(bpos, bpos + slen), opos);
    opos += slen;
    bpos += slen;
    
    const bDataOffset = viewB.getUint32(bpos); bpos += 4;
    patchOffsets.push({ opos: opos, bDataOffset });
    opos += 4; // Skip the offset field for now, will patch in Step 3
  }

  // 3. Process each station's data and write to output
  for (let i = 0; i < numStations; i++) {
    const patch = patchOffsets[i];
    const dataStartOffset = opos;
    
    // Patch the index offset
    viewO.setUint32(patch.opos, dataStartOffset);

    const bDataPos = patch.bDataOffset;
    const totalCount = viewB.getUint16(bDataPos);
    const dataStart = bDataPos + 2;

    // Binary search for window start
    let low = 0;
    let high = totalCount - 1;
    let startIndex = totalCount;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const mPos = dataStart + (mid * 8);
      const mMins = viewB.getUint16(mPos + 2);
      if (mMins >= cutoffMonoMins) { startIndex = mid; high = mid - 1; }
      else { low = mid + 1; }
    }

    const countPos = opos;
    opos += 2; // Skip count field, will fill after loop
    let outCount = 0;

    for (let j = startIndex; j < totalCount; j++) {
      const ePos = dataStart + (j * 8);
      const monoMins = viewB.getUint16(ePos + 2);
      if (monoMins > horizonMonoMins) break;

      const routeIdx = baselineBin[ePos];
      const dirCode = baselineBin[ePos + 1];
      const tripIdHash = viewB.getUint32(ePos + 4);

      const live = liveByTripIdHash.get(tripIdHash);
      let delayStatus = 0; // Scheduled
      if (live && live.tripRelationship === 3) delayStatus = -128; // Canceled

      out[opos++] = routeIdx;
      out[opos++] = dirCode;
      viewO.setUint16(opos, monoMins % 1440); opos += 2;
      out[opos++] = delayStatus;
      outCount++;
    }

    viewO.setUint16(countPos, outCount);
  }

  return out.slice(0, opos);
}
