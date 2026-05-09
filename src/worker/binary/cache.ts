const CACHE_URL = "https://nt-internal.local/arrivals/current.bin";
const CACHE_TTL_SECONDS = 60;

function cacheKey(): Request {
  return new Request(CACHE_URL, { method: "GET" });
}

export function readGeneratedAt(buf: Uint8Array): number {
  return (buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24)) >>> 0;
}

export function currentTickBoundary(): number {
  return Math.floor(Date.now() / 60000) * 60;
}

export async function getArrivalsBinFromCache(): Promise<Uint8Array | null> {
  const hit = await caches.default.match(cacheKey());
  if (!hit) return null;
  return new Uint8Array(await hit.arrayBuffer());
}

export function putArrivalsBinInCache(ctx: ExecutionContext, buf: Uint8Array): void {
  const res = new Response(buf.slice().buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey(), res));
}
