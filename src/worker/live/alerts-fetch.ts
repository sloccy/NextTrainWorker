import { decodeAlertFeed, type ParsedAlert } from "./alerts-decode.js";

const ALERTS_URL = "https://www.rtd-denver.com/files/gtfs-rt/Alerts.pb";

let cachedEtag: string | null = null;
let cachedLastModified: string | null = null;
let cachedAlerts: ParsedAlert[] = [];

export async function fetchAlerts(): Promise<{ alerts: ParsedAlert[]; fresh: boolean }> {
  const headers: Record<string, string> = { "Accept-Encoding": "gzip" };
  if (cachedEtag) headers["If-None-Match"] = cachedEtag;
  if (cachedLastModified) headers["If-Modified-Since"] = cachedLastModified;

  const resp = await fetch(ALERTS_URL, { headers });

  if (resp.status === 304) return { alerts: cachedAlerts, fresh: false };
  if (!resp.ok) throw new Error(`Alerts fetch failed: ${resp.status} ${resp.statusText}`);

  const buffer = await resp.arrayBuffer();
  cachedAlerts = decodeAlertFeed(new Uint8Array(buffer));
  cachedEtag = resp.headers.get("etag");
  cachedLastModified = resp.headers.get("last-modified");

  return { alerts: cachedAlerts, fresh: true };
}
