/**
 * Minimal GTFS-RT FeedMessage decoder.
 *
 * Reads only the fields used by this worker:
 *   entity[].trip_update.trip.{trip_id, schedule_relationship}
 *   entity[].trip_update.stop_time_update[].{stop_id, arrival.time, departure.time, schedule_relationship}
 *
 * All other fields (vehicle positions, alerts, shapes, congestion, etc.) are
 * skipped in O(1) — advance pos by field length, no allocation.
 *
 * Field number reference (from gtfs-realtime.proto):
 *   FeedMessage:       entity=2
 *   FeedEntity:        trip_update=3
 *   TripUpdate:        trip=1, stop_time_update=2
 *   TripDescriptor:    trip_id=1, schedule_relationship=4
 *   StopTimeUpdate:    arrival=2, departure=3, stop_id=4, schedule_relationship=5
 *   StopTimeEvent:     time=2
 */

import type { TripPrediction, StopPrediction } from "./tripupdate.js";

const td = new TextDecoder();

class Reader {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}

  tag(): [field: number, wtype: number] {
    const v = this.varint();
    return [v >>> 3, v & 7];
  }

  varint(): number {
    let lo = 0, hi = 0;
    for (let s = 0; s < 64; s += 7) {
      const b = this.buf[this.pos++];
      if (s < 28) {
        lo |= (b & 0x7f) << s;
      } else if (s === 28) {
        lo |= (b & 0xf) << 28;
        hi = (b >>> 4) & 0x7;
      } else {
        hi |= (b & 0x7f) << (s - 32);
      }
      if (!(b & 0x80)) break;
    }
    return hi === 0 ? lo >>> 0 : hi * 0x100000000 + (lo >>> 0);
  }

  bytes(): Uint8Array {
    const len = this.varint();
    return this.buf.subarray(this.pos, (this.pos += len));
  }

  str(): string {
    return td.decode(this.bytes());
  }

  skip(wtype: number): void {
    switch (wtype) {
      case 0: while (this.buf[this.pos++] & 0x80); break;
      case 1: this.pos += 8; break;
      case 2: this.pos += this.varint(); break;
      case 5: this.pos += 4; break;
    }
  }
}

export function decodeFeedMessage(buf: Uint8Array, allowed?: Set<string>): Map<string, TripPrediction> {
  const out = new Map<string, TripPrediction>();
  const r = new Reader(buf);
  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 2 && w === 2) parseEntity(r.bytes(), out, allowed);
    else r.skip(w);
  }
  return out;
}

function parseEntity(buf: Uint8Array, out: Map<string, TripPrediction>, allowed?: Set<string>): void {
  const r = new Reader(buf);
  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 3 && w === 2) parseTripUpdate(r.bytes(), out, allowed);
    else r.skip(w);
  }
}

function parseTripUpdate(buf: Uint8Array, out: Map<string, TripPrediction>, allowed?: Set<string>): void {
  const r = new Reader(buf);
  let tripId = "";
  let tripRelationship = 0;
  const stops = new Map<string, StopPrediction>();

  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 1 && w === 2) {
      [tripId, tripRelationship] = parseTripDescriptor(r.bytes());
      // RTD encodes trip descriptor first; early-exit if not a tracked trip
      if (allowed && tripId && !allowed.has(tripId)) return;
    } else if (f === 2 && w === 2) {
      const [stopId, time, rel] = parseStopTimeUpdate(r.bytes());
      if (stopId) stops.set(stopId, { time, stopRelationship: rel });
    } else {
      r.skip(w);
    }
  }

  if (tripId) out.set(tripId, { tripId, routeId: "", tripRelationship, stops });
}

function parseTripDescriptor(buf: Uint8Array): [tripId: string, schedRel: number] {
  const r = new Reader(buf);
  let tripId = "";
  let schedRel = 0;
  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 1 && w === 2) tripId = r.str();
    else if (f === 4 && w === 0) schedRel = r.varint();
    else r.skip(w);
  }
  return [tripId, schedRel];
}

function parseStopTimeUpdate(buf: Uint8Array): [stopId: string, time: number | null, schedRel: number] {
  const r = new Reader(buf);
  let stopId = "";
  let arrivalTime: number | null = null;
  let departureTime: number | null = null;
  let schedRel = 0;

  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 4 && w === 2) {
      stopId = r.str();
    } else if (f === 2 && w === 2) {
      arrivalTime = parseTimeField(r.bytes());
    } else if (f === 3 && w === 2) {
      departureTime = parseTimeField(r.bytes());
    } else if (f === 5 && w === 0) {
      schedRel = r.varint();
    } else {
      r.skip(w);
    }
  }

  return [stopId, arrivalTime ?? departureTime, schedRel];
}

function parseTimeField(buf: Uint8Array): number | null {
  const r = new Reader(buf);
  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 2 && w === 0) return r.varint();
    r.skip(w);
  }
  return null;
}
