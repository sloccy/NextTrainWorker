import type { Env } from "../types.js";
import { getArrivalsBinTiered } from "../binary/r2.js";
import { scanArrivalsBin } from "../binary/scan.js";

const DIR_MAP: Record<string, string> = { "0": "N", "1": "S", "2": "E", "3": "W" };

export async function handleArrivals(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const station = url.searchParams.get("s");
  const routesParam = url.searchParams.get("r");

  if (!station || !routesParam) {
    return new Response("Missing required params: s and r", { status: 400 });
  }

  const routePairs: { route: string; dir: string }[] = [];
  for (let i = 0; i < routesParam.length; i += 2) {
    const route = routesParam[i];
    const dirNum = routesParam[i + 1];
    const dir = DIR_MAP[dirNum];
    if (!route || !dir) {
      return new Response(`Invalid route.dir chunk at index ${i}: ${route}${dirNum}`, { status: 400 });
    }
    routePairs.push({ route, dir });
  }

  const bin = await getArrivalsBinTiered(env, ctx);
  if (!bin) return new Response("Arrivals not yet available", { status: 503 });

  const result = scanArrivalsBin(bin, station, routePairs);
  if (!result) return new Response(`Station "${station}" not found`, { status: 404 });

  const now = Math.floor(Date.now() / 1000);
  const nextRefresh = Math.max(result.generatedAt + 65, now + 30);
  return new Response(result.buf, {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Next-Refresh": String(nextRefresh),
      "Cache-Control": "private, max-age=20",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
