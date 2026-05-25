/**
 * Records STOPPED_AT vehicle events as OTP observations in D1.
 *
 * Route name and direction are derived from TEMPLATE_BYTES at the stop's offset:
 *   template entry layout: [u8 route_idx][u8 dir][u16 mono_mins][u8 delay_status]
 *   status offset (from STOP_OFFSETS) points to delay_status byte, so:
 *     route_idx at off-4, dir at off-3, mono_mins lo at off-2, mono_mins hi at off-1
 *
 * Scheduled time = BASE_MIDNIGHT_UTC + mono_mins * 60.
 * INSERT OR IGNORE on (date, trip_hash, stop_id_hash) is idempotent across ticks.
 */

import type { Env } from "../types.js";
import { TEMPLATE_BYTES, STOP_OFFSETS } from "../generated/offsets.js";
import type { VehicleEvent } from "./vehicles-decode.js";
import { fnv1a } from "./key-hash.js";

const BASE_MIDNIGHT_UTC =
  (TEMPLATE_BYTES[4] | (TEMPLATE_BYTES[5] << 8) |
   (TEMPLATE_BYTES[6] << 16) | (TEMPLATE_BYTES[7] << 24)) >>> 0;

// Decode route name dictionary from TEMPLATE_BYTES once at module load.
// Layout at offset 8: [u16 dict_count] × ([u8 len][chars])
const ROUTE_DICT: string[] = (() => {
  let pos = 8;
  const count = TEMPLATE_BYTES[pos++] | (TEMPLATE_BYTES[pos++] << 8);
  const dict: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = TEMPLATE_BYTES[pos++];
    let s = "";
    for (let j = 0; j < len; j++) s += String.fromCharCode(TEMPLATE_BYTES[pos++]);
    dict.push(s);
  }
  return dict;
})();

const enc = new TextEncoder();

function hashStr(s: string): number {
  const b = enc.encode(s);
  return fnv1a(b, 0, b.length);
}

const denverFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" });

export async function recordOtpObservations(env: Env, events: VehicleEvent[]): Promise<void> {
  const stoppedAt = events.filter(e => e.status === 1); // STOPPED_AT only
  if (stoppedAt.length === 0) return;

  const stmts: D1PreparedStatement[] = [];

  for (const ev of stoppedAt) {
    const stopMap = STOP_OFFSETS.get(ev.tripId);
    if (!stopMap) continue; // non-rail trip

    const offs = stopMap.get(ev.stopId);
    if (!offs || offs.length === 0) continue; // stop not in schedule

    const off = offs[0];
    const routeIdx = TEMPLATE_BYTES[off - 4];
    const dirCode  = TEMPLATE_BYTES[off - 3];
    const monoMins = TEMPLATE_BYTES[off - 2] | (TEMPLATE_BYTES[off - 1] << 8);

    const route = ROUTE_DICT[routeIdx] ?? "?";
    const dir   = String.fromCharCode(dirCode);
    const scheduledAt = BASE_MIDNIGHT_UTC + monoMins * 60;
    const delaySec    = ev.timestamp - scheduledAt;

    // Sanity check: ignore if more than 1 hour late or more than 15 min early
    if (delaySec > 3600 || delaySec < -900) continue;

    const date = denverFmt.format(new Date(ev.timestamp * 1000));
    const tripHash   = hashStr(ev.tripId);
    const stopIdHash = hashStr(ev.stopId);

    stmts.push(
      env.OTP_DB.prepare(
        `INSERT OR IGNORE INTO otp_observations
         (date, trip_hash, stop_id_hash, observed_at, scheduled_at, delay_seconds, route, direction)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(date, tripHash, stopIdHash, ev.timestamp, scheduledAt, delaySec, route, dir),
    );
  }

  if (stmts.length === 0) return;

  // D1 batch — up to 100 statements per call
  for (let i = 0; i < stmts.length; i += 100) {
    await env.OTP_DB.batch(stmts.slice(i, i + 100));
  }
}

export async function rollupOtpDaily(env: Env): Promise<void> {
  // yesterday in Denver (cron fires at 10 UTC = 4am Denver)
  const yesterday = denverFmt.format(new Date(Date.now() - 86_400_000));

  await env.OTP_DB.batch([
    env.OTP_DB.prepare(`
      INSERT OR IGNORE INTO otp_daily (date, route, direction, observations, on_time, late, very_late)
      SELECT date, route, direction,
        COUNT(*),
        SUM(CASE WHEN ABS(delay_seconds) <= 60 THEN 1 ELSE 0 END),
        SUM(CASE WHEN delay_seconds > 60 AND delay_seconds <= 300 THEN 1 ELSE 0 END),
        SUM(CASE WHEN delay_seconds > 300 THEN 1 ELSE 0 END)
      FROM otp_observations
      WHERE date = ?
      GROUP BY date, route, direction
    `).bind(yesterday),
    env.OTP_DB.prepare(`
      DELETE FROM otp_observations
      WHERE date < ?
    `).bind(denverFmt.format(new Date(Date.now() - 30 * 86_400_000))),
  ]);
}
