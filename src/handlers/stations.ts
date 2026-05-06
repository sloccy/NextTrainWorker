import { STATIONS_BYTES } from "../stations.generated.js";

export function handleStations(): Response {
  return new Response(STATIONS_BYTES, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
