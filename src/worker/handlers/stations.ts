import { STATIONS_BYTES } from "../generated/stations.js";

export function handleStations(request: Request, ctx: ExecutionContext): Response {
  const res = new Response(STATIONS_BYTES, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
  ctx.waitUntil(caches.default.put(request, res.clone()));
  return res;
}
