/**
 * GTFS-RT FeedMessage decoder using protobufjs.
 */

import protobuf from "protobufjs";

const root = protobuf.Root.fromJSON({
  nested: {
    FeedMessage: { fields: { header: { type: "FeedHeader", id: 1 }, entity: { rule: "repeated", type: "FeedEntity", id: 2 } } },
    FeedHeader: { fields: { gtfsRealtimeVersion: { type: "string", id: 1 }, timestamp: { type: "uint64", id: 3 } } },
    FeedEntity: { fields: { id: { type: "string", id: 1 }, tripUpdate: { type: "TripUpdate", id: 3 } } },
    TripUpdate: { fields: { trip: { type: "TripDescriptor", id: 1 }, stopTimeUpdate: { rule: "repeated", type: "StopTimeUpdate", id: 2 } } },
    TripDescriptor: { fields: { tripId: { type: "string", id: 1 }, scheduleRelationship: { type: "int32", id: 4 } } },
    StopTimeUpdate: { fields: { arrival: { type: "StopTimeEvent", id: 2 }, departure: { type: "StopTimeEvent", id: 3 }, stopId: { type: "string", id: 4 }, scheduleRelationship: { type: "int32", id: 5 } } },
    StopTimeEvent: { fields: { delay: { type: "int32", id: 1 }, time: { type: "int64", id: 2 } } },
  }
});

const FeedMessage = root.lookupType("FeedMessage");

export interface LiveData {
  tripStatus: Map<string, number>;
  stopOverrides: Map<string, number>;
}

function bucketDelay(delaySec: number, stopRel: number): number {
  if (stopRel === 1) return 129;
  if (delaySec > -60 && delaySec < 60) return 130;
  let m = Math.round(delaySec / 60);
  if (m < -125) m = -125;
  if (m > 127) m = 127;
  return m & 0xff;
}

export function decodeFeedMessage(buf: Uint8Array): LiveData {
  const tripStatus = new Map<string, number>();
  const stopOverrides = new Map<string, number>();

  const msg = FeedMessage.decode(buf) as any;

  for (const entity of msg.entity || []) {
    const tu = entity.tripUpdate;
    if (!tu?.trip?.tripId) continue;

    const tripId = tu.trip.tripId;
    const tripRel = tu.trip.scheduleRelationship || 0;
    tripStatus.set(tripId, tripRel);

    for (const stu of tu.stopTimeUpdate || []) {
      if (!stu.stopId) continue;

      const event = stu.arrival || stu.departure;
      if (!event && stu.scheduleRelationship !== 1) continue;

      let delaySec = 0;
      let hasData = false;

      if (event) {
        if (event.delay != null) { delaySec = event.delay; hasData = true; }
        else if (event.time != null) { delaySec = 0; hasData = true; }
      }

      if (hasData || stu.scheduleRelationship === 1) {
        stopOverrides.set(tripId + ":" + stu.stopId, bucketDelay(delaySec, stu.scheduleRelationship || 0));
      }
    }
  }

  return { tripStatus, stopOverrides };
}
