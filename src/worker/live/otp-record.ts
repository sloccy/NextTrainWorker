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
import { hashStr } from "./key-hash.js";
import { BASE_MIDNIGHT_UTC } from "../util/base-time.js";
import { denverFmt } from "../util/denver-date.js";

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

export async function recordOtpObservations(env: Env, events: VehicleEvent[]): Promise<{ inserted: number; batches: number }> {
  const stoppedAt = events.filter(e => e.status === 1); // STOPPED_AT only
  if (stoppedAt.length === 0) return { inserted: 0, batches: 0 };

  // Compute date once — all events in a tick share the same Denver date.
  const date = denverFmt.format(new Date());

  type Row = [string, number, number, number, number, number, string, string];
  const rows: Row[] = [];

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

    rows.push([date, hashStr(ev.tripId), hashStr(ev.stopId), ev.timestamp, scheduledAt, delaySec, route, dir]);
  }

  if (rows.length === 0) return { inserted: 0, batches: 0 };

  // Multi-row INSERT chunks — D1 caps bound params at 100 per statement.
  // 10 rows × 8 cols = 80 params, safely under the limit.
  // Wrap all chunks in a single batch() call for one HTTP round trip.
  const CHUNK = 10;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "(?,?,?,?,?,?,?,?)").join(",");
    stmts.push(
      env.OTP_DB.prepare(
        `INSERT OR IGNORE INTO otp_observations
         (date, trip_hash, stop_id_hash, observed_at, scheduled_at, delay_seconds, route, direction)
         VALUES ${placeholders}`,
      ).bind(...chunk.flat()),
    );
  }
  await env.OTP_DB.batch(stmts);
  return { inserted: rows.length, batches: stmts.length };
}

export async function rollupOtpDaily(env: Env): Promise<{ inserted: number; deleted: number }> {
  const yesterday = denverFmt.format(new Date(Date.now() - 86_400_000));
  const cutoff    = denverFmt.format(new Date(Date.now() - 30 * 86_400_000));

  const results = await env.OTP_DB.batch([
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
    `).bind(cutoff),
  ]);

  return {
    inserted: results[0].meta.rows_written ?? 0,
    deleted: results[1].meta.rows_written ?? 0,
  };
}
