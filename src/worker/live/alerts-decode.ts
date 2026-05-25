/**
 * pbf-based GTFS-RT decoder for the Alerts feed.
 * Mirrors the pattern in decode.ts — module-scope state, readFields/readMessage.
 *
 * Alert field numbers:
 *   FeedEntity.alert             = 5
 *   Alert.active_period          = 1  (TimeRange)
 *   Alert.informed_entity        = 5  (EntitySelector)
 *   Alert.cause                  = 6
 *   Alert.effect                 = 7
 *   Alert.header_text            = 10 (TranslatedString)
 *   Alert.description_text       = 11 (TranslatedString)
 *   TimeRange.start              = 1
 *   TimeRange.end                = 2
 *   EntitySelector.route_id      = 2
 *   EntitySelector.route_type    = 3
 *   TranslatedString.translation = 1  (Translation)
 *   Translation.text             = 1
 *   Translation.language         = 2
 */

import Pbf from "pbf";

export interface ParsedAlert {
  routeIds: string[];
  routeTypes: number[];
  cause: number;
  effect: number;
  activeFrom: number;
  activeUntil: number;
  header: string;
  description: string;
}

const _td = new TextDecoder();
const MAX_ALERTS = 200;

let _out: ParsedAlert[];
let _alert: ParsedAlert;
let _tsText = "";
let _tsLang = "";
let _tsBest = "";

function readString(pbf: Pbf): string {
  const len = pbf.readVarint();
  const s = pbf.pos;
  pbf.pos = s + len;
  return _td.decode((pbf.buf as Uint8Array).subarray(s, s + len));
}

function readTranslation(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1)      _tsText = readString(pbf); // text
  else if (tag === 2) _tsLang = readString(pbf); // language
}

function readTranslatedString(tag: number, _: null, pbf: Pbf): void {
  if (tag !== 1) return; // translation
  _tsText = ""; _tsLang = "";
  pbf.readMessage(readTranslation, null);
  if (_tsLang === "en" || _tsBest === "") _tsBest = _tsText;
}

// Only the first active_period is used (matches reference library behaviour).
let _hadPeriod = false;

function readTimeRange(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1)      _alert.activeFrom  = pbf.readVarint(); // start
  else if (tag === 2) _alert.activeUntil = pbf.readVarint(); // end
}

function noop(_tag: number, _result: null, _pbf: Pbf): void {}

function readEntitySelector(tag: number, _: null, pbf: Pbf): void {
  if (tag === 2) {
    const id = readString(pbf);
    if (id) _alert.routeIds.push(id); // skip empty route_id (entity has only route_type or stop)
  } else if (tag === 3) {
    _alert.routeTypes.push(pbf.readVarint());
  }
}

function readAlert(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1) {        // active_period — only first
    if (!_hadPeriod) { _hadPeriod = true; pbf.readMessage(readTimeRange, null); }
    else pbf.readMessage(noop, null);
  } else if (tag === 5) { // informed_entity
    pbf.readMessage(readEntitySelector, null);
  } else if (tag === 6) { // cause
    _alert.cause = pbf.readVarint();
  } else if (tag === 7) { // effect
    _alert.effect = pbf.readVarint();
  } else if (tag === 10) { // header_text
    _tsBest = "";
    pbf.readMessage(readTranslatedString, null);
    _alert.header = _tsBest.slice(0, 200);
  } else if (tag === 11) { // description_text
    _tsBest = "";
    pbf.readMessage(readTranslatedString, null);
    _alert.description = _tsBest.slice(0, 512);
  }
}

function readEntity(tag: number, _: null, pbf: Pbf): void {
  if (tag !== 5) return; // alert
  _alert = { routeIds: [], routeTypes: [], cause: 0, effect: 0, activeFrom: 0, activeUntil: 0, header: "", description: "" };
  _hadPeriod = false;
  pbf.readMessage(readAlert, null);
  if (_alert.header || _alert.description || _alert.routeIds.length > 0) _out.push(_alert);
}

function readFeed(tag: number, _: null, pbf: Pbf): void {
  if (tag === 2 && _out.length < MAX_ALERTS) pbf.readMessage(readEntity, null); // entity
}

export function decodeAlertFeed(buf: Uint8Array): ParsedAlert[] {
  _out = [];
  const pbf = new Pbf(buf);
  pbf.readFields(readFeed, null);
  return _out;
}
