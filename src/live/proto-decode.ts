/**
 * Minimal GTFS-RT FeedMessage decoder.
 *
 * Only reads the fields the merge actually uses:
 *   entity[].trip_update.trip.{trip_id, schedule_relationship}
 *
 * Per-stop arrival/departure times are intentionally skipped — merge.ts only
 * inspects tripRelationship to mark canceled trips.
 */

import { hashTripIdBytes } from "../binary.js";

const td = new TextDecoder();

class Reader {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}

  tag(): number {
    return this.varint();
  }

  varint(): number {
    let b = this.buf[this.pos++];
    if (!(b & 0x80)) return b;
    let res = b & 0x7f;
    b = this.buf[this.pos++];
    res |= (b & 0x7f) << 7;
    if (!(b & 0x80)) return res;
    b = this.buf[this.pos++];
    res |= (b & 0x7f) << 14;
    if (!(b & 0x80)) return res;
    b = this.buf[this.pos++];
    res |= (b & 0x7f) << 21;
    if (!(b & 0x80)) return res;
    b = this.buf[this.pos++];
    res += (b & 0x7f) * 268435456; // 2^28
    if (!(b & 0x80)) return res;
    
    let shift = 35;
    while (shift < 64) {
      b = this.buf[this.pos++];
      res += (b & 0x7f) * Math.pow(2, shift);
      if (!(b & 0x80)) return res;
      shift += 7;
    }
    return res;
  }

  skip(wtype: number): void {
    if (wtype === 0) {
      while (this.buf[this.pos++] & 0x80);
    } else if (wtype === 2) {
      this.pos += this.varint();
    } else if (wtype === 1) {
      this.pos += 8;
    } else if (wtype === 5) {
      this.pos += 4;
    }
  }
}

/** Returns Map<tripIdHash, tripRelationship>. */
export function decodeFeedMessage(buf: Uint8Array): Map<number, number> {
  const out = new Map<number, number>();
  const r = new Reader(buf);
  let entityCount = 0;
  while (r.pos < buf.length) {
    const t = r.tag();
    const f = t >>> 3;
    const w = t & 7;
    if (f === 2 && w === 2) {
      const len = r.varint();
      const end = r.pos + len;
      parseEntity(r, end, out);
      r.pos = end;
      entityCount++;
    } else r.skip(w);
  }
  console.log(`[proto] Decoded ${entityCount} entities, found ${out.size} updates`);
  return out;
}

function parseEntity(r: Reader, end: number, out: Map<number, number>): void {
  while (r.pos < end) {
    const t = r.tag();
    const f = t >>> 3;
    const w = t & 7;
    if (f === 3 && w === 2) {
      const len = r.varint();
      const innerEnd = r.pos + len;
      parseTripUpdate(r, innerEnd, out);
      r.pos = innerEnd;
    } else r.skip(w);
  }
}

function parseTripUpdate(r: Reader, end: number, out: Map<number, number>): void {
  let tripIdHash = 0;
  let tripRelationship = 0;

  while (r.pos < end) {
    const t = r.tag();
    const f = t >>> 3;
    const w = t & 7;
    if (f === 1 && w === 2) {
      const len = r.varint();
      const innerEnd = r.pos + len;
      
      // Inline parseTripDescriptor to avoid array allocation
      while (r.pos < innerEnd) {
        const t2 = r.tag();
        const f2 = t2 >>> 3;
        const w2 = t2 & 7;
        if (f2 === 1 && w2 === 2) {
          const vlen = r.varint();
          tripIdHash = hashTripIdBytes(r.buf, r.pos, vlen);
          r.pos += vlen;
        } else if (f2 === 4 && w2 === 0) {
          tripRelationship = r.varint();
        } else {
          r.skip(w2);
        }
      }
      r.pos = innerEnd;
      break;
    } else {
      r.skip(w);
    }
  }

  if (tripIdHash) out.set(tripIdHash, tripRelationship);
}
