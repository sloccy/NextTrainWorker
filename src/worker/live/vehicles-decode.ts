/**
 * pbf-based GTFS-RT decoder for VehiclePosition feed.
 * Mirrors the pattern in decode.ts — module-scope state, readFields/readMessage.
 *
 * VehiclePosition field numbers:
 *   FeedEntity.vehicle           = 4
 *   VehiclePosition.trip         = 1  (TripDescriptor)
 *   VehiclePosition.current_status = 4
 *   VehiclePosition.timestamp    = 5
 *   VehiclePosition.stop_id      = 7
 *   TripDescriptor.trip_id       = 1
 */

import Pbf from "pbf";

export interface VehicleEvent {
  tripId: string;
  stopId: string;
  /** 0=INCOMING_AT, 1=STOPPED_AT, 2=IN_TRANSIT_TO */
  status: number;
  timestamp: number;
}

const _td = new TextDecoder();

let _tripId = "";
let _stopId = "";
let _status = 2;
let _timestamp = 0;
let _out: VehicleEvent[];

function readString(pbf: Pbf): string {
  const len = pbf.readVarint();
  const s = pbf.pos;
  pbf.pos = s + len;
  return _td.decode((pbf.buf as Uint8Array).subarray(s, s + len));
}

function readTD(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1) _tripId = readString(pbf); // trip_id
}

function readVP(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1)      pbf.readMessage(readTD, null);   // trip
  else if (tag === 4) _status    = pbf.readVarint();   // current_status
  else if (tag === 5) _timestamp = pbf.readVarint();   // timestamp
  else if (tag === 7) _stopId    = readString(pbf);    // stop_id
}

function readEntity(tag: number, _: null, pbf: Pbf): void {
  if (tag !== 4) return; // vehicle
  _tripId = ""; _stopId = ""; _status = 2; _timestamp = 0;
  pbf.readMessage(readVP, null);
  if (_tripId && _stopId) _out.push({ tripId: _tripId, stopId: _stopId, status: _status, timestamp: _timestamp });
}

function readFeed(tag: number, _: null, pbf: Pbf): void {
  if (tag === 2) pbf.readMessage(readEntity, null); // entity
}

export function decodeVehiclePositions(buf: Uint8Array): VehicleEvent[] {
  _out = [];
  const pbf = new Pbf(buf);
  pbf.readFields(readFeed, null);
  return _out;
}
