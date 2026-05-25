import type { Env } from "../types.js";
import { getAlertsBin } from "../binary/r2.js";
import { scanAlertsSummary, scanAlertsByRoute } from "../binary/alerts.js";

export async function handleAlerts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = url.searchParams.get("r");

  const bin = await getAlertsBin(env);
  if (!bin) return new Response("Alerts not yet available", { status: 503 });

  if (!route) {
    const result = scanAlertsSummary(bin);
    if (!result) return new Response("Alerts data malformed", { status: 500 });
    const out: number[] = [result.routes.length & 0xFF];
    for (const { route: r, count } of result.routes) {
      out.push(r.length & 0xFF);
      for (let i = 0; i < r.length; i++) out.push(r.charCodeAt(i) & 0xFF);
      out.push(count & 0xFF);
    }
    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const result = scanAlertsByRoute(bin, route);
  if (!result) return new Response(`No alerts for route "${route}"`, { status: 404 });

  const td = new TextEncoder();
  const out: number[] = [result.alerts.length & 0xFF];
  for (const a of result.alerts) {
    out.push(
      a.activeFrom & 0xFF, (a.activeFrom >>> 8) & 0xFF,
      (a.activeFrom >>> 16) & 0xFF, (a.activeFrom >>> 24) & 0xFF,
      a.activeUntil & 0xFF, (a.activeUntil >>> 8) & 0xFF,
      (a.activeUntil >>> 16) & 0xFF, (a.activeUntil >>> 24) & 0xFF,
      a.cause & 0xFF,
      a.effect & 0xFF,
    );
    const hb = td.encode(a.header);
    out.push(Math.min(hb.length, 255));
    for (const b of hb.subarray(0, 255)) out.push(b);
    const db = td.encode(a.description);
    const dlen = Math.min(db.length, 65535);
    out.push(dlen & 0xFF, (dlen >>> 8) & 0xFF);
    for (const b of db.subarray(0, dlen)) out.push(b);
  }
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
