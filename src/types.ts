export type Direction = "N" | "S" | "E" | "W";

// Shape of each arrival in the HTTP /arrivals response
// l is absent for scheduled (default); present for live/canceled/skipped/added
export interface ArrivalEntry {
  r: string;   // route short name
  t: string;   // display time ("3:44 PM")
  l?: string;  // absent="Scheduled", "On time"/"Delayed N min"=live, "Canceled", "Skipped", "Added"
}

export interface StationInfo {
  stop_ids: string[];
}

export interface RouteWire {
  c: string | null;           // route color hex
  h: Record<string, string>;  // direction → headsign
}

export interface ArrivalsBlob {
  generated_at: number;
  stations: Record<string, StationInfo>;
  routes: Record<string, RouteWire>;
  data: Record<string, ArrivalsKeyEntry>;
}

export interface ArrivalsKeyEntry {
  a: StoredArrivalEntry[];
}

// Per-arrival shape stored in R2 blob.
// r is omitted (derivable from the data key prefix).
// e is absolute unix time — filter/sort only, not in HTTP response.
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
