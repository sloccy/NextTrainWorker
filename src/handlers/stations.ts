import type { Env } from "../types.js";
import { getStationsBin } from "../r2.js";

export async function handleStations(env: Env): Promise<Response> {
  const bin = await getStationsBin(env);
  if (!bin) {
    return new Response("Stations not yet available", { status: 503 });
  }

  return new Response(bin, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
