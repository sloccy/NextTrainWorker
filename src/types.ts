export type Direction = "N" | "S" | "E" | "W";

export type ArrivalStatus = "live" | "scheduled" | "canceled" | "skipped" | "added";

// Shape of each arrival in the HTTP /arrivals response
export interface ArrivalEntry {
  r: string;        // route short name
  t: string;        // display time ("3:44 PM")
  s: ArrivalStatus; // status enum
  l: string;        // status label ("On time", "Delayed 3 min")
}

export interface StationInfo {
  name: string;
  stop_ids: string[];
}

// Shape stored in ARRIVALS_KV under "arrivals:current"
export interface ArrivalsBlob {
  generated_at: number;
  stations: Record<string, StationInfo>;
  data: Record<string, ArrivalsKeyEntry>;
}

export interface ArrivalsKeyEntry {
  route_color: string | null; // used by /stations handler
  headsign: string;           // representative headsign for /stations handler
  arrivals: StoredArrivalEntry[];
}

// Per-arrival shape stored in the KV blob
export interface StoredArrivalEntry {
  r: string;        // route short name
  eff: number;      // effective unix time (predicted ?? scheduled) — filter/sort only, not in HTTP response
  t: string;        // pre-formatted display time
  s: ArrivalStatus;
  l: string;        // pre-formatted status label
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
  ARRIVALS_KV: KVNamespace;
}
