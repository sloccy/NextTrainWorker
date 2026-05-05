/**
 * Minimal GTFS-RT FeedMessage decoder.
 *
 * Only reads the fields the merge actually uses:
 *   entity[].trip_update.trip.{trip_id, schedule_relationship}
 *
 * Per-stop arrival/departure times are intentionally skipped — merge.ts only
 * inspects tripRelationship to mark canceled trips.
 */

import { hashTripId } from "../binary.js";

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

/** Returns Map<tripIdHash, tripRelationship>. */
export function decodeFeedMessage(buf: Uint8Array): Map<number, number> {
  const out = new Map<number, number>();
  const r = new Reader(buf);
  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 2 && w === 2) parseEntity(r.bytes(), out);
    else r.skip(w);
  }
  return out;
}

function parseEntity(buf: Uint8Array, out: Map<number, number>): void {
  const r = new Reader(buf);
  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 3 && w === 2) parseTripUpdate(r.bytes(), out);
    else r.skip(w);
  }
}

function parseTripUpdate(buf: Uint8Array, out: Map<number, number>): void {
  const r = new Reader(buf);
  let tripIdHash = 0;
  let tripRelationship = 0;

  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 1 && w === 2) {
      const [hash, rel] = parseTripDescriptor(r.bytes());
      tripIdHash = hash;
      tripRelationship = rel;
    } else {
      r.skip(w);
    }
  }

  if (tripIdHash) out.set(tripIdHash, tripRelationship);
}

function parseTripDescriptor(buf: Uint8Array): [tripIdHash: number, schedRel: number] {
  const r = new Reader(buf);
  let tripIdHash = 0;
  let schedRel = 0;
  while (r.pos < buf.length) {
    const [f, w] = r.tag();
    if (f === 1 && w === 2) tripIdHash = hashTripId(r.str());
    else if (f === 4 && w === 0) schedRel = r.varint();
    else r.skip(w);
  }
  return [tripIdHash, schedRel];
}
