import { decodeFeedMessage, type LiveData } from "./proto-decode.js";

const TRIPUPDATE_URL = "https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb";

let cachedEtag: string | null = null;
let cachedLastModified: string | null = null;
let cachedLive: LiveData = { tripStatus: new Map(), stopOverrides: new Map() };

export async function fetchTripUpdates(): Promise<LiveData & { fresh: boolean }> {
  const headers: Record<string, string> = { "Accept-Encoding": "gzip" };
  if (cachedEtag) headers["If-None-Match"] = cachedEtag;
  if (cachedLastModified) headers["If-Modified-Since"] = cachedLastModified;

  const resp = await fetch(TRIPUPDATE_URL, { headers });

  if (resp.status === 304) return { ...cachedLive, fresh: false };

  if (!resp.ok) {
    throw new Error(`TripUpdate fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = await resp.arrayBuffer();
  cachedLive = decodeFeedMessage(new Uint8Array(buffer));
  cachedEtag = resp.headers.get("etag");
  cachedLastModified = resp.headers.get("last-modified");

  return { ...cachedLive, fresh: true };
}
