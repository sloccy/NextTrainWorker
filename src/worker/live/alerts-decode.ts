/**
 * Minimal GTFS-RT FeedMessage decoder for the Alerts feed.
 *
 * Relevant field tags (field << 3 | wire_type):
 *   FeedMessage.entity              field 2 wire 2 → 0x12
 *   FeedEntity.alert                field 5 wire 2 → 0x2a
 *   Alert.active_period             field 1 wire 2 → 0x0a
 *   Alert.informed_entity           field 5 wire 2 → 0x2a
 *   Alert.cause                     field 6 wire 0 → 0x30
 *   Alert.effect                    field 7 wire 0 → 0x38
 *   Alert.header_text               field 10 wire 2 → 0x52
 *   Alert.description_text          field 11 wire 2 → 0x5a
 *   TimeRange.start                 field 1 wire 0 → 0x08
 *   TimeRange.end                   field 2 wire 0 → 0x10
 *   EntitySelector.route_id         field 2 wire 2 → 0x12
 *   EntitySelector.route_type       field 3 wire 0 → 0x18
 *   TranslatedString.translation    field 1 wire 2 → 0x0a
 *   Translation.text                field 1 wire 2 → 0x0a
 *   Translation.language            field 2 wire 2 → 0x12
 */

export interface ParsedAlert {
  routeIds: string[];
  routeTypes: number[];
  cause: number;
  effect: number;
  activeFrom: number;  // unix seconds, 0 if unspecified
  activeUntil: number; // unix seconds, 0 if unspecified
  header: string;
  description: string;
}

const MAX_HEADER = 200;
const MAX_DESC = 512;
const MAX_ALERTS = 200;

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
    res += (b & 0x7f) * 268435456;
    if (!(b & 0x80)) return res;
    while (this.buf[this.pos++] & 0x80);
    return res;
  },

  skip(wtype: number): void {
    if (wtype === 0) { while (this.buf[this.pos++] & 0x80); }
    else if (wtype === 2) { const n = this.varint(); this.pos += n; }
    else if (wtype === 1) { this.pos += 8; }
    else if (wtype === 5) { this.pos += 4; }
  },

  readString(): string {
    const len = this.varint();
    const bytes = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(bytes);
  },
};

function readTranslatedString(end: number, maxLen: number): string {
  let best = "";
  while (r.pos < end) {
    const t = r.buf[r.pos++];
    if (t === 0x0a) {
      const trLen = r.varint(); const trEnd = r.pos + trLen;
      let text = "";
      let lang = "";
      while (r.pos < trEnd) {
        const tt = r.buf[r.pos++];
        if (tt === 0x0a) { text = r.readString(); }
        else if (tt === 0x12) { lang = r.readString(); }
        else { r.skip(tt & 7); }
      }
      r.pos = trEnd;
      if (lang === "en" || best === "") best = text;
    } else {
      r.skip(t & 7);
    }
  }
  return best.slice(0, maxLen);
}

export function decodeAlertFeed(buf: Uint8Array): ParsedAlert[] {
  r.buf = buf;
  r.pos = 0;
  const out: ParsedAlert[] = [];
  const len = buf.length;

  while (r.pos < len && out.length < MAX_ALERTS) {
    const t = buf[r.pos++];
    if (t === 0x12) {
      const entityLen = r.varint(); const entityEnd = r.pos + entityLen;
      while (r.pos < entityEnd) {
        const te = buf[r.pos++];
        if (te === 0x2a) {
          const alertLen = r.varint(); const alertEnd = r.pos + alertLen;
          const alert: ParsedAlert = {
            routeIds: [], routeTypes: [], cause: 0, effect: 0,
            activeFrom: 0, activeUntil: 0, header: "", description: "",
          };

          while (r.pos < alertEnd) {
            const ta = buf[r.pos++];
            if (ta === 0x0a) {
              const trLen = r.varint(); const trEnd = r.pos + trLen;
              while (r.pos < trEnd) {
                const tp = buf[r.pos++];
                if (tp === 0x08) { alert.activeFrom = r.varint(); }
                else if (tp === 0x10) { alert.activeUntil = r.varint(); }
                else { r.skip(tp & 7); }
              }
              r.pos = trEnd;
            } else if (ta === 0x2a) {
              const esLen = r.varint(); const esEnd = r.pos + esLen;
              while (r.pos < esEnd) {
                const te2 = buf[r.pos++];
                if (te2 === 0x12) { alert.routeIds.push(r.readString()); }
                else if (te2 === 0x18) { alert.routeTypes.push(r.varint()); }
                else { r.skip(te2 & 7); }
              }
              r.pos = esEnd;
            } else if (ta === 0x30) {
              alert.cause = r.varint();
            } else if (ta === 0x38) {
              alert.effect = r.varint();
            } else if (ta === 0x52) {
              const tsLen = r.varint(); const tsEnd = r.pos + tsLen;
              alert.header = readTranslatedString(tsEnd, MAX_HEADER);
              r.pos = tsEnd;
            } else if (ta === 0x5a) {
              const tsLen2 = r.varint(); const tsEnd = r.pos + tsLen2;
              alert.description = readTranslatedString(tsEnd, MAX_DESC);
              r.pos = tsEnd;
            } else {
              r.skip(ta & 7);
            }
          }

          if (alert.header || alert.description || alert.routeIds.length > 0) out.push(alert);
          r.pos = alertEnd;
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
