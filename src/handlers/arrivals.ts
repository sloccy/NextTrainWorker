import type { Env, Direction } from "../types.js";
import { getArrivalsBin } from "../r2.js";
import { scanArrivalsBin } from "../binary.js";

const VALID_DIRS = new Set<Direction>(["N", "S", "E", "W"]);

export async function handleArrivals(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const station = url.searchParams.get("s");
  const routesParam = url.searchParams.get("r");

  if (!station || !routesParam) {
    return new Response("Missing required params: s and r", { status: 400 });
  }

  const routePairs: { route: string; dir: string }[] = [];
  const dirMap: Record<string, Direction> = {
    "0": "N",
    "1": "S",
    "2": "E",
    "3": "W",
  };

  for (let i = 0; i < routesParam.length; i += 2) {
    const route = routesParam[i];
    const dirNum = routesParam[i + 1];
    const dir = dirMap[dirNum];

    if (!route || !dir) {
      return new Response(`Invalid route.dir chunk at index ${i}: ${route}${dirNum}`, { status: 400 });
    }
    routePairs.push({ route, dir });
  }

  const bin = await getArrivalsBin(env);
  if (!bin) {
    return new Response("Arrivals not yet available", { status: 503 });
  }

  const now = Math.floor(Date.now() / 1000);
  const result = scanArrivalsBin(bin, station, routePairs);

  if (!result) {
    return new Response(`Station "${station}" not found`, { status: 404 });
  }

  // scanArrivalsBin returns [count, ...data] in result.buf.
  // result.buf[0] is the number of arrivals.
  if (result.buf[0] === 0) {
    return new Response("No matching arrivals", { status: 404 });
  }

  const n = Math.max(result.generatedAt + 65, now + 30);
  return new Response(result.buf, {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Next-Refresh": String(n),
      "Cache-Control": "public, max-age=20",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
