/**
 * pbf-based GTFS-RT decoder for VehiclePosition feed.
 * Mirrors the pattern in decode.ts — module-scope state, readFields/readMessage.
 *
 * VehiclePosition field numbers (RTD-specific proto, non-standard):
 *   FeedEntity.vehicle             = 4
 *   VehiclePosition.trip           = 1  (TripDescriptor)
 *   VehiclePosition.vehicle        = 2  (VehicleDescriptor)
 *   VehiclePosition.current_status = 4  (RTD uses 4; standard proto uses 6)
 *   VehiclePosition.timestamp      = 5  (RTD uses 5; standard proto uses 7)
 *   VehiclePosition.stop_id        = 7  (RTD uses 7; standard proto uses 5)
 *   TripDescriptor.trip_id         = 1
 */

import Pbf from "pbf";
import { readString } from "./pbf-util.js";

export interface VehicleEvent {
  tripId: string;
  stopId: string;
  /** 0=INCOMING_AT, 1=STOPPED_AT, 2=IN_TRANSIT_TO */
  status: number;
  timestamp: number;
}

let _tripId = "";
let _stopId = "";
let _status = 0;
let _timestamp = 0;
let _out: VehicleEvent[];

function readTD(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1) _tripId = readString(pbf); // trip_id
}

function readVP(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1)      pbf.readMessage(readTD, null);   // trip
  else if (tag === 4) _status    = pbf.readVarint();   // current_status (RTD field 4)
  else if (tag === 5) _timestamp = pbf.readVarint();   // timestamp (RTD field 5)
  else if (tag === 7) _stopId    = readString(pbf);    // stop_id (RTD field 7)
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
