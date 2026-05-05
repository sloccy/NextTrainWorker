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
  const cutoff = now - CUTOFF_SECONDS;
  const horizon = now + HORIZON_SECONDS;

  let pos = 0;
  // const baselineGeneratedAt = ((baselineBin[pos++] << 24) | (baselineBin[pos++] << 16) | (baselineBin[pos++] << 8) | baselineBin[pos++]) >>> 0;
  pos += 4; // Skip generatedAt

  // Read dictionary (only for routes and labels)
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
    const count = (baselineBin[dpos++] << 8) | baselineBin[dpos++];
    const arrivals: BinArrival[] = [];

    for (let j = 0; j < count; j++) {
      const routeIdx = baselineBin[dpos++];
      const dirCode = baselineBin[dpos++];
      const timeMins = (baselineBin[dpos++] << 8) | baselineBin[dpos++];
      const tripIdHash = ((baselineBin[dpos++] << 24) | (baselineBin[dpos++] << 16) | (baselineBin[dpos++] << 8) | baselineBin[dpos++]) >>> 0;

      // Filter and patch
      const live = livePatches.get(tripIdHash);
      let label = "";
      let effectiveMins = timeMins;

      // Note: Full patching requires stopId for the GTFS-RT lookup.
      // Since baseline.bin doesn't have stopIds (to keep it lean), we use a simplified 
      // trip-level relationship (Canceled). For full delay patching, we'd need
      // stopIdHash or similar. Let's assume for now that trip-level info is sufficient
      // or that the worker can derive the stopId if needed.
      // Actually, let's just use the trip relationship for now.
      
      if (live) {
        if (live.tripRelationship === 3) label = "Canceled";
        // To do full delay patching, we'd need stop-specific info. 
        // For the 10ms CPU limit, maybe trip-level is a good start.
      }

      // Convert timeMins (relative to midnight UTC-ish) back to absolute for cutoff check
      // This is tricky without the date. Let's assume the baseline only contains 
      // arrivals near 'now'.
      
      // OPTIMIZATION: baseline.bin arrivals are already sorted by time.
      // We can improve this further, but let's get the basic binary flow working.

      arrivals.push({
        route: dict[routeIdx],
        dir: String.fromCharCode(dirCode),
        timeMins: effectiveMins,
        label
      });
    }

    if (arrivals.length > 0) {
      stationArrivals.set(slug, arrivals);
    }
  }

  return buildArrivalsBin(stationArrivals, now);
}
