const BASE_URL = "https://nt-internal.local/";

function cacheRequest(name: string): Request {
  return new Request(`${BASE_URL}${name}`, { method: "GET" });
}

export function readGeneratedAt(buf: Uint8Array): number {
  return (buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24)) >>> 0;
}

export function currentTickBoundary(): number {
  return Math.floor(Date.now() / 60000) * 60;
}

export async function getBinFromCache(name: string): Promise<Uint8Array | null> {
  const hit = await caches.default.match(cacheRequest(name));
  if (!hit) return null;
  return new Uint8Array(await hit.arrayBuffer());
}

export function putBinInCache(ctx: ExecutionContext, name: string, buf: Uint8Array, ttlSec: number): void {
  const res = new Response(buf.slice().buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": `public, max-age=${ttlSec}`,
    },
  });
  ctx.waitUntil(caches.default.put(cacheRequest(name), res));
}

// Thin wrappers preserving the existing arrivals API
export const getArrivalsBinFromCache = (): Promise<Uint8Array | null> =>
  getBinFromCache("arrivals/current.bin");
export const putArrivalsBinInCache = (ctx: ExecutionContext, buf: Uint8Array): void =>
  putBinInCache(ctx, "arrivals/current.bin", buf, 60);

export const getAlertsBinFromCache = (): Promise<Uint8Array | null> =>
  getBinFromCache("alerts/current.bin");
export const putAlertsBinInCache = (ctx: ExecutionContext, buf: Uint8Array): void =>
  putBinInCache(ctx, "alerts/current.bin", buf, 60);
