import { transit_realtime } from "gtfs-realtime-bindings";

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

export async function fetchTripUpdates(): Promise<Map<string, TripPrediction>> {
  const resp = await fetch(TRIPUPDATE_URL, {
    headers: { "Accept-Encoding": "gzip" },
  });

  if (!resp.ok) {
    throw new Error(`TripUpdate fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = await resp.arrayBuffer();
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const byTripId = new Map<string, TripPrediction>();

  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu?.trip?.tripId) continue;

    const tripId = tu.trip.tripId;
    const stops = new Map<string, StopPrediction>();

    for (const stu of tu.stopTimeUpdate ?? []) {
      if (!stu.stopId) continue;
      const time = stu.arrival?.time ?? stu.departure?.time ?? null;
      stops.set(stu.stopId, {
        time: typeof time === "number" ? time : (time != null ? Number(time) : null),
        stopRelationship: stu.scheduleRelationship ?? 0,
      });
    }

    byTripId.set(tripId, {
      tripId,
      routeId: tu.trip.routeId ?? "",
      tripRelationship: tu.trip.scheduleRelationship ?? 0,
      stops,
    });
  }

  console.log(`[tripupdate] parsed ${byTripId.size} trip updates`);
  return byTripId;
}
