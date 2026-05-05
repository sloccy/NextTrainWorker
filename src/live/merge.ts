import type { TripPrediction } from "./tripupdate.js";
import {
  type BinArrival,
  buildArrivalsBin,
  hashTripId,
} from "../binary.js";

const CUTOFF_SECONDS = 5 * 60;
const HORIZON_SECONDS = 3 * 60 * 60; // 3 hours

/**
 * Build arrivals/current.bin by patching the binary baseline with live overrides.
 */
export function applyLive(
  baselineBin: Uint8Array,
  liveByTripId: Map<string, TripPrediction>,
  nowOverride?: number,
): Uint8Array {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);

  let pos = 0;
  // Header: [u32 genAt][u32 baseMidnightUTC]
  // pos 0..3: genAt (skip)
  // pos 4..7: baseMidnightUTC
  const baseMidnightUTC = ((baselineBin[4] << 24) | (baselineBin[5] << 16) | (baselineBin[6] << 8) | baselineBin[7]) >>> 0;
  pos = 8;

  const currentMonoMins = Math.floor((now - baseMidnightUTC) / 60);
  const cutoffMonoMins = currentMonoMins - (CUTOFF_SECONDS / 60);
  const horizonMonoMins = currentMonoMins + (HORIZON_SECONDS / 60);

  // Read dictionary
  const dictCount = (baselineBin[pos++] << 8) | baselineBin[pos++];
  const dict: string[] = [];
  for (let i = 0; i < dictCount; i++) {
    const len = baselineBin[pos++];
    let s = "";
    for (let j = 0; j < len; j++) s += String.fromCharCode(baselineBin[pos + j]);
    dict.push(s);
    pos += len;
  }

  const numStations = (baselineBin[pos++] << 8) | baselineBin[pos++];
  const indexStart = pos;

  // Pre-calculate live patches by tripIdHash
  const livePatches = new Map<number, TripPrediction>();
  for (const [tripId, pred] of liveByTripId) {
    livePatches.set(hashTripId(tripId), pred);
  }

  const stationArrivals = new Map<string, BinArrival[]>();

  // Binary search helper for the 8-byte entries in a station's data block
  function findStartIndex(buf: Uint8Array, startPos: number, count: number, targetMonoMins: number): number {
    let low = 0;
    let high = count - 1;
    let result = count; // Default to 'no match'
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const entryPos = startPos + (mid * 8);
      const monoMins = (buf[entryPos + 2] << 8) | buf[entryPos + 3];
      if (monoMins >= targetMonoMins) {
        result = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return result;
  }

  // Iterate through stations in baseline
  pos = indexStart;
  for (let i = 0; i < numStations; i++) {
    const slen = baselineBin[pos++];
    let slug = "";
    for (let j = 0; j < slen; j++) slug += String.fromCharCode(baselineBin[pos + j]);
    pos += slen;
    const dataOffset = ((baselineBin[pos++] << 24) | (baselineBin[pos++] << 16) | (baselineBin[pos++] << 8) | baselineBin[pos++]) >>> 0;
    
    // Jump to data block for this station
    let dpos = dataOffset;
    const totalCount = (baselineBin[dpos++] << 8) | baselineBin[dpos++];
    const dataStart = dpos;

    // Use binary search to find start of 3-hour window
    const startIndex = findStartIndex(baselineBin, dataStart, totalCount, cutoffMonoMins);
    const arrivals: BinArrival[] = [];

    // Scan forward from binary search result
    for (let j = startIndex; j < totalCount; j++) {
      const entryPos = dataStart + (j * 8);
      const routeIdx = baselineBin[entryPos];
      const dirCode = baselineBin[entryPos + 1];
      const monoMins = (baselineBin[entryPos + 2] << 8) | baselineBin[entryPos + 3];
      const tripIdHash = ((baselineBin[entryPos + 4] << 24) | (baselineBin[entryPos + 5] << 16) | (baselineBin[entryPos + 6] << 8) | baselineBin[entryPos + 7]) >>> 0;

      // Stop if we exit the 3-hour horizon
      if (monoMins > horizonMonoMins) break;

      const live = livePatches.get(tripIdHash);
      let label = "";
      if (live && live.tripRelationship === 3) label = "Canceled";

      arrivals.push({
        route: dict[routeIdx],
        dir: String.fromCharCode(dirCode),
        timeMins: monoMins % 1440, // standard display time (minutes since midnight)
        label
      });
    }

    if (arrivals.length > 0) {
      stationArrivals.set(slug, arrivals);
    }
  }

  return buildArrivalsBin(stationArrivals, now);
}
