import { decodeFeedMessage } from "./proto-decode.js";

const TRIPUPDATE_URL = "https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb";

export interface TripPrediction {
  tripId: string;
  routeId: string;
  /** SCHEDULED=0, ADDED=1, UNSCHEDULED=2, CANCELED=3 */
  tripRelationship: number;
  stops: Map<string, StopPrediction>;
}

export interface StopPrediction {
  /** Unix seconds, or null if no time in feed */
  time: number | null;
  /** SCHEDULED=0, SKIPPED=1, NO_DATA=2 */
  stopRelationship: number;
}

export async function fetchTripUpdates(): Promise<Map<number, TripPrediction>> {
  const resp = await fetch(TRIPUPDATE_URL, {
    headers: { "Accept-Encoding": "gzip" },
  });

  if (!resp.ok) {
    throw new Error(`TripUpdate fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = await resp.arrayBuffer();
  const byTripIdHash = decodeFeedMessage(new Uint8Array(buffer));

  console.log(`[tripupdate] parsed ${byTripIdHash.size} trip updates`);
  return byTripIdHash;
}
