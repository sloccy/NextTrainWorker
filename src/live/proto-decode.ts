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

// Module-level singleton; reset buf+pos on each call to avoid per-tick allocation.
const r = {
  buf: new Uint8Array(0) as Uint8Array,
  pos: 0,

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
    // Values >= 2^35 never appear in RTD's feed; just drain remaining bytes.
    while (this.buf[this.pos++] & 0x80);
    return res;
  },

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
  },
};

/** Returns Map<tripIdHash, tripRelationship>. */
export function decodeFeedMessage(buf: Uint8Array): Map<number, number> {
  r.buf = buf;
  r.pos = 0;
  const out = new Map<number, number>();
  const len = buf.length;

  // Outer loop: FeedMessage fields. Field 2 (wire 2) = entity.
  while (r.pos < len) {
    const t = buf[r.pos++];
    if (t === 0x12) {
      // field=2, wire=2 — FeedEntity
      const entityEnd = r.pos + r.varint();

      // Entity fields. Field 3 (wire 2) = trip_update.
      while (r.pos < entityEnd) {
        const te = buf[r.pos++];
        if (te === 0x1a) {
          // field=3, wire=2 — TripUpdate
          const tuEnd = r.pos + r.varint();
          let tripIdHash = 0;
          let tripRelationship = 0;

          // TripUpdate fields. Field 1 (wire 2) = trip (TripDescriptor).
          while (r.pos < tuEnd) {
            const tt = buf[r.pos++];
            if (tt === 0x0a) {
              // field=1, wire=2 — TripDescriptor
              const tdEnd = r.pos + r.varint();
              while (r.pos < tdEnd) {
                const td = buf[r.pos++];
                if (td === 0x0a) {
                  // field=1, wire=2 — trip_id string
                  const vlen = r.varint();
                  tripIdHash = hashTripIdBytes(buf, r.pos, vlen);
                  r.pos += vlen;
                } else if (td === 0x20) {
                  // field=4, wire=0 — schedule_relationship
                  tripRelationship = r.varint();
                } else {
                  r.skip(td & 7);
                }
              }
              r.pos = tdEnd;
              break; // trip descriptor is only field we need in TripUpdate
            } else {
              r.skip(tt & 7);
            }
          }

          if (tripIdHash) out.set(tripIdHash, tripRelationship);
          r.pos = tuEnd;
        } else {
          r.skip(te & 7);
        }
      }
      r.pos = entityEnd;
    } else {
      r.skip(t & 7);
    }
  }

  return out;
}
