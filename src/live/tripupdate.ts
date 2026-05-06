import { decodeFeedMessage, type LiveData } from "./proto-decode.js";

const TRIPUPDATE_URL = "https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb";

export async function fetchTripUpdates(): Promise<LiveData> {
  const resp = await fetch(TRIPUPDATE_URL, {
    headers: { "Accept-Encoding": "gzip" }
  });

  if (!resp.ok) {
    throw new Error(`TripUpdate fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = await resp.arrayBuffer();
  return decodeFeedMessage(new Uint8Array(buffer));
}
