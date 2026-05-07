/**
 * GTFS-RT FeedMessage decoder using protobufjs/light (static codegen).
 * No eval/codegen — safe for Cloudflare Workers.
 */

import { transit_realtime } from "./gtfs-rt.js";

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

  const msg = transit_realtime.FeedMessage.decode(buf);

  for (const entity of msg.entity) {
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
        if (event.delay != null && event.delay !== 0) { delaySec = event.delay; hasData = true; }
        else if (event.time != null) { delaySec = 0; hasData = true; }
        else if (event.delay === 0) { delaySec = 0; hasData = true; }
      }

      if (hasData || stu.scheduleRelationship === 1) {
        stopOverrides.set(tripId + ":" + stu.stopId, bucketDelay(delaySec, stu.scheduleRelationship || 0));
      }
    }
  }

  return { tripStatus, stopOverrides };
}
