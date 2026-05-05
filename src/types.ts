export type Direction = "N" | "S" | "E" | "W";

export interface StationInfo {
  stop_ids: string[];
}

// Per-arrival shape stored in memory within BaselineKeyEntry.
// r is omitted (derivable from the data key prefix).
// e is absolute unix time — filter/sort only.
export interface StoredArrivalEntry {
  e: number;
  t: string;
  l?: string;
}

// Shape stored in SCHEDULE_KV under "schedule:current"
export interface ScheduleBlob {
  generated_at: number;
  routes: Record<string, RouteInfo>;
  stations: Record<string, StationInfo>;
  by_key: Record<string, ScheduleKeyEntry>;
}

export interface RouteInfo {
  color: string;
  short_name: string;
  long_name: string;
}

export interface ScheduleKeyEntry {
  stop_name: string;
  entries: ScheduleEntry[];
}

export interface ScheduleEntry {
  trip_id: string;
  service_id: string;
  scheduled_time: number;
  headsign: string;
}

export interface Env {
  SCHEDULE_KV: KVNamespace;
  ARRIVALS_R2: R2Bucket;
}
