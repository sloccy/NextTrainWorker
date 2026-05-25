/**
 * pbf-based GTFS-RT decoder. Only reads the fields we need; skips everything else.
 * Uses module-scope state to avoid per-stop object allocation on the hot path.
 *
 * RTD populates StopTimeEvent.time (absolute Unix timestamp) rather than .delay.
 * We derive delaySec = liveTime - scheduledEpoch, looking up scheduledEpoch from
 * the bundled TEMPLATE_BYTES via STOP_OFFSETS.
 */
import Pbf from "pbf";
import { TEMPLATE_BYTES, TRIP_OFFSETS, STOP_OFFSETS } from "../generated/offsets.js";
import { TRIP_HASH, STOP_HASH, fnv1a } from "./key-hash.js";
import { noop } from "./pbf-util.js";
import { BASE_MIDNIGHT_UTC } from "../util/base-time.js";

const _td = new TextDecoder();

function stopSchedSec(tripId: string, stopId: string, evTime: number): number {
  const inner = STOP_OFFSETS.get(tripId);
  if (!inner) return 0;
  const offs = inner.get(stopId);
  if (!offs || offs.length === 0) return 0;
  let bestSched = 0, bestDiff = Infinity;
  for (let i = 0; i < offs.length; i++) {
    const monoMins = TEMPLATE_BYTES[offs[i] - 2] | (TEMPLATE_BYTES[offs[i] - 1] << 8);
    const sched = BASE_MIDNIGHT_UTC + monoMins * 60;
    const diff = Math.abs(evTime - sched);
    if (diff < bestDiff) { bestDiff = diff; bestSched = sched; }
  }
  return bestSched;
}

export interface LiveData {
  tripStatus: Map<string, number>;
  stopOverrides: Map<string, Map<string, number>>;
  entitySeen: number;
  entityMissed: number;
  missedSamples: Set<string>;
}

// ── module-scope decode state ─────────────────────────────────────────────────
// Avoids per-entity/per-stop object allocation. Not re-entrant, but decode is
// always synchronous and single-threaded in a Worker isolate.

let _ts: Map<string, number>;
let _so: Map<string, Map<string, number>>;
let _entitySeen = 0;
let _entityMissed = 0;
let _missedSamples: Set<string> = new Set();
let _tripId = "";
let _skipTrip = false;
let _curOuter: Map<string, number> | null = null;
let _stopId = "";
let _schedRel = 0;
let _hasEv = false;
let _evDelay = 0;
let _evHasData = false;
let _evTime = 0;
let _evHasTime = false;

// ── leaf readers ─────────────────────────────────────────────────────────────

function readSTE(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1) { _evDelay = pbf.readVarint(true); _evHasData = true; }
  else if (tag === 2) { _evTime = pbf.readVarint(true); _evHasTime = true; _evHasData = true; }
}

function readSTU(tag: number, _: null, pbf: Pbf): void {
  if (tag === 4) {
    const len = pbf.readVarint();
    const s = pbf.pos;
    const h = fnv1a(pbf.buf as Uint8Array, s, s + len);
    pbf.pos = s + len;
    _stopId = STOP_HASH.get(h) ?? "";
  } else if (tag === 5) {
    _schedRel = pbf.readVarint(true);
  } else if (tag === 2 || tag === 3) {
    if (_hasEv) { pbf.readMessage(noop, null); return; }
    _evDelay = 0; _evHasData = false; _evTime = 0; _evHasTime = false;
    pbf.readMessage(readSTE, null);
    if (_evHasData) _hasEv = true;
  }
}

function readTD(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1) {
    const len = pbf.readVarint();
    const s = pbf.pos;
    const h = fnv1a(pbf.buf as Uint8Array, s, s + len);
    pbf.pos = s + len;
    _tripId = TRIP_HASH.get(h) ?? "";
  } else if (tag === 4) _ts.set(_tripId, pbf.readVarint(true));
}

function readTU(tag: number, _: null, pbf: Pbf): void {
  if (tag === 1) {
    _tripId = "";
    _skipTrip = false;
    pbf.readMessage(readTD, null);
    if (!_ts.has(_tripId)) _ts.set(_tripId, 0);
    // canceled trips handled at trip level in patch — per-stop overrides redundant
    if (_ts.get(_tripId) === 3) _skipTrip = true;
    _curOuter = null;
  } else if (tag === 2) {
    if (_skipTrip) { pbf.readMessage(noop, null); return; }
    if (!_curOuter) {
      _curOuter = _so.get(_tripId) ?? null;
      if (!_curOuter) { _curOuter = new Map(); _so.set(_tripId, _curOuter); }
    }
    _stopId = ""; _schedRel = 0; _hasEv = false;
    _evDelay = 0; _evHasData = false; _evTime = 0; _evHasTime = false;
    pbf.readMessage(readSTU, null);
    if (!_stopId) return;
    let useIt = false;
    let delaySec = 0;
    if (_hasEv) {
      if (_evDelay !== 0) { delaySec = _evDelay; useIt = true; }
      else if (_evHasTime) {
        const sched = stopSchedSec(_tripId, _stopId, _evTime);
        if (sched > 0) { delaySec = _evTime - sched; useIt = true; }
      }
      else if (_evHasData) { delaySec = 0; useIt = true; }
    }
    if (useIt || _schedRel === 1) {
      _curOuter.set(_stopId, bucketDelay(delaySec, _schedRel));
    }
  }
}

function readEntity(tag: number, _: null, pbf: Pbf): void {
  if (tag !== 3) return;
  const len = pbf.readVarint();
  const start = pbf.pos;
  const end = start + len;
  _entitySeen++;

  // Peek trip_id (TripDescriptor is field 1; trip_id is field 1 inside it)
  let tripId: string | null = null;
  let _peekStart = 0, _peekLen = 0;
  outer: while (pbf.pos < end) {
    const v = pbf.readVarint();
    if ((v >> 3) === 1) {
      const subLen = pbf.readVarint();
      const subEnd = pbf.pos + subLen;
      while (pbf.pos < subEnd) {
        const sv = pbf.readVarint();
        if ((sv >> 3) === 1) {
          _peekLen = pbf.readVarint();
          _peekStart = pbf.pos;
          const h = fnv1a(pbf.buf as Uint8Array, _peekStart, _peekStart + _peekLen);
          pbf.pos = _peekStart + _peekLen;
          tripId = TRIP_HASH.get(h) ?? null;
          pbf.pos = subEnd;
          break outer;
        }
        pbf.skip(sv);
      }
      break;
    }
    pbf.skip(v);
  }

  if (!tripId || !TRIP_OFFSETS.has(tripId)) {
    _entityMissed++;
    if (_peekLen > 0 && _missedSamples.size < 3) {
      _missedSamples.add(_td.decode((pbf.buf as Uint8Array).subarray(_peekStart, _peekStart + _peekLen)));
    }
    pbf.pos = end;
    return;
  }

  // Rail trip — rewind and decode fully via readTU
  pbf.pos = start;
  pbf.readFields(readTU, null, end);
}

function readFeed(tag: number, _: null, pbf: Pbf): void {
  if (tag === 2) pbf.readMessage(readEntity, null);
}

// ── public API ────────────────────────────────────────────────────────────────

function bucketDelay(delaySec: number, stopRel: number): number {
  if (stopRel === 1) return 129;
  if (delaySec > -60 && delaySec < 60) return 130;
  let m = Math.round(delaySec / 60);
  if (m < -125) m = -125;
  else if (m > 127) m = 127;
  return m & 0xff;
}

export function decodeFeedMessage(buf: Uint8Array): LiveData {
  _ts = new Map();
  _so = new Map();
  _tripId = "";
  _skipTrip = false;
  _curOuter = null;
  _entitySeen = 0;
  _entityMissed = 0;
  _missedSamples = new Set();
  const pbf = new Pbf(buf);
  pbf.readFields(readFeed, null);
  return { tripStatus: _ts, stopOverrides: _so, entitySeen: _entitySeen, entityMissed: _entityMissed, missedSamples: _missedSamples };
}
