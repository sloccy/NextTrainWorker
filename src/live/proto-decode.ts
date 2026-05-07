/**
 * Minimal GTFS-RT FeedMessage decoder.
 *
 * Reads from each TripUpdate:
 *   trip.{trip_id, schedule_relationship}
 *   stop_time_update[].{stop_id, arrival.delay, schedule_relationship}
 */

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
    while (this.buf[this.pos++] & 0x80);
    return res;
  },

  // Signed int32 varint (negative values use 10-byte wire encoding).
  varintI32(): number {
    let b = this.buf[this.pos++];
    let res = b & 0x7f;
    if (!(b & 0x80)) return res;
    b = this.buf[this.pos++]; res |= (b & 0x7f) << 7;
    if (!(b & 0x80)) return res;
    b = this.buf[this.pos++]; res |= (b & 0x7f) << 14;
    if (!(b & 0x80)) return res;
    b = this.buf[this.pos++]; res |= (b & 0x7f) << 21;
    if (!(b & 0x80)) return res | 0;
    b = this.buf[this.pos++]; res |= (b & 0x0f) << 28;
    if (b & 0x80) { while (this.buf[this.pos++] & 0x80); } // drain high bytes
    return res | 0;
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

export interface LiveData {
  tripStatus: Map<string, number>;    // tripId → trip-level relationship (0=SCHEDULED, 3=CANCELED, 4=SKIPPED)
  stopOverrides: Map<string, number>; // "tripId:stopId" → bucketed u8 status byte
}

/** Bucket a signed delay in seconds into the wire-format s8 status byte (stored as u8). */
function bucketDelay(delaySec: number, stopRel: number): number {
  if (stopRel === 1) return 129;                          // -127 = SKIPPED at stop
  if (delaySec > -60 && delaySec < 60) return 130;       // -126 = on time
  let m = Math.round(delaySec / 60);
  if (m < -125) m = -125;
  if (m > 127) m = 127;
  return m & 0xff;
}

export function decodeFeedMessage(buf: Uint8Array): LiveData {
  r.buf = buf;
  r.pos = 0;
  const tripStatus = new Map<string, number>();
  const stopOverrides = new Map<string, number>();
  const len = buf.length;

  while (r.pos < len) {
    const t = buf[r.pos++];
    if (t === 0x12) {
      // field=2, wire=2 — FeedEntity
      const entityEnd = r.pos + r.varint();

      while (r.pos < entityEnd) {
        const te = buf[r.pos++];
        if (te === 0x1a) {
          // field=3, wire=2 — TripUpdate
          const tuEnd = r.pos + r.varint();
          let tripId = "";
          let tripRelationship = 0;

          while (r.pos < tuEnd) {
            const tt = buf[r.pos++];
            if (tt === 0x0a) {
              // field=1, wire=2 — TripDescriptor
              const tdEnd = r.pos + r.varint();
              while (r.pos < tdEnd) {
                const td = buf[r.pos++];
                if (td === 0x0a) {
                  const vlen = r.varint();
                  tripId = "";
                  for (let j = r.pos; j < r.pos + vlen; j++) tripId += String.fromCharCode(buf[j]);
                  r.pos += vlen;
                } else if (td === 0x20) {
                  tripRelationship = r.varint();
                } else {
                  r.skip(td & 7);
                }
              }
              r.pos = tdEnd;
            } else if (tt === 0x12) {
              // field=2, wire=2 — StopTimeUpdate (repeated)
              const stuEnd = r.pos + r.varint();
              let stopIdStart = -1, stopIdLen = 0;
              let delaySec = 0, delayPresent = false;
              let stopRel = 0;

              while (r.pos < stuEnd) {
                const ts = buf[r.pos++];
                if (ts === 0x12 || ts === 0x1a) {
                  // field=2 arrival or field=3 departure — StopTimeEvent
                  const steEnd = r.pos + r.varint();
                  if (!delayPresent) {
                    while (r.pos < steEnd) {
                      const tse = buf[r.pos++];
                      if (tse === 0x08) {
                        delaySec = r.varintI32();
                        delayPresent = true;
                      } else if (tse === 0x10) {
                        // time field — realtime data exists but no explicit delay
                        r.varint(); // consume the time value
                        if (!delayPresent) { delaySec = 0; delayPresent = true; }
                      } else {
                        r.skip(tse & 7);
                      }
                    }
                  }
                  r.pos = steEnd;
                } else if (ts === 0x22) {
                  // field=4, wire=2 — stop_id string
                  stopIdLen = r.varint();
                  stopIdStart = r.pos;
                  r.pos += stopIdLen;
                } else if (ts === 0x28) {
                  // field=5, wire=0 — schedule_relationship
                  stopRel = r.varint();
                } else {
                  r.skip(ts & 7);
                }
              }
              r.pos = stuEnd;

              if (stopIdStart >= 0 && tripId && (delayPresent || stopRel === 1)) {
                let stopId = "";
                for (let j = stopIdStart; j < stopIdStart + stopIdLen; j++) stopId += String.fromCharCode(buf[j]);
                const compKey = tripId + ":" + stopId;
                const statusByte = bucketDelay(delaySec, stopRel);
                stopOverrides.set(compKey, statusByte);
              }
            } else {
              r.skip(tt & 7);
            }
          }

          if (tripId) tripStatus.set(tripId, tripRelationship);
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

  return { tripStatus, stopOverrides };
}
