import type { Env } from "../types.js";
import { denverFmt } from "../util/denver-date.js";
import { jsonResponse } from "./_response.js";

const COLS = "date, route, direction, observations, on_time, late, very_late";

export async function handleOtp(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = url.searchParams.get("r");
  const days  = Math.min(Math.max(Number.parseInt(url.searchParams.get("days") ?? "7", 10), 1), 30);
  const cutoff = denverFmt.format(new Date(Date.now() - days * 86_400_000));

  const t0 = Date.now();
  let results: unknown[];
  if (route) {
    ({ results } = await env.OTP_DB.prepare(
      `SELECT ${COLS} FROM otp_daily WHERE route = ? AND date >= ? ORDER BY date DESC, direction`,
    ).bind(route, cutoff).all());
  } else {
    ({ results } = await env.OTP_DB.prepare(
      `SELECT ${COLS} FROM otp_daily WHERE date >= ? ORDER BY date DESC, route, direction`,
    ).bind(cutoff).all());
  }
  const d1Ms = Date.now() - t0;

  console.log(`[/otp] route=${route ?? "(all)"} days=${days} d1Ms=${d1Ms} rows=${results.length}`);
  return jsonResponse(results, 3600);
}
