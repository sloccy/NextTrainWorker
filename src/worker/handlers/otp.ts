import type { Env } from "../types.js";

export async function handleOtp(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = url.searchParams.get("r");
  const days  = Math.min(Math.max(Number.parseInt(url.searchParams.get("days") ?? "7"), 1), 30);

  const cutoff = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" })
    .format(new Date(Date.now() - days * 86_400_000));

  let query: D1PreparedStatement;
  if (route) {
    query = env.OTP_DB.prepare(
      `SELECT date, route, direction, observations, on_time, late, very_late
       FROM otp_daily WHERE route = ? AND date >= ? ORDER BY date DESC, direction`,
    ).bind(route, cutoff);
  } else {
    query = env.OTP_DB.prepare(
      `SELECT date, route, direction, observations, on_time, late, very_late
       FROM otp_daily WHERE date >= ? ORDER BY date DESC, route, direction`,
    ).bind(cutoff);
  }

  const { results } = await query.all();
  return new Response(JSON.stringify(results), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
