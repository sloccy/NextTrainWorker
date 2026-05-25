import type { Env } from "../types.js";
import { getAlertsBinTiered } from "../binary/r2.js";
import { scanAlertsSummaryBytes, scanAlertsByRouteBytes } from "../binary/alerts.js";
import { binResponse } from "./_response.js";

export async function handleAlerts(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const route = new URL(request.url).searchParams.get("r");

  const t0 = Date.now();
  const bin = await getAlertsBinTiered(env, ctx);
  if (!bin) return new Response("Alerts not yet available", { status: 503 });
  const r2Ms = Date.now() - t0;

  const ts = Date.now();
  const out = route ? scanAlertsByRouteBytes(bin, route) : scanAlertsSummaryBytes(bin);
  const scanMs = Date.now() - ts;

  if (!out) {
    return new Response(route ? `No alerts for route "${route}"` : "Alerts data malformed", {
      status: route ? 404 : 500,
    });
  }

  console.log(`[/al] route=${route ?? "(all)"} r2Ms=${r2Ms} scanMs=${scanMs} bytes=${out.length}`);
  return binResponse(out, 60);
}
