export interface FetchedResult<T> {
  value: T;
  fresh: boolean;
  bytes: number;
  decodeMs: number;
}

interface Options<T> {
  url: string;
  decode: (buf: Uint8Array) => T;
  label: string;
}

export function makeConditionalFetcher<T>(
  opts: Options<T>,
  emptyValue: T,
): () => Promise<FetchedResult<T>> {
  let cachedEtag: string | null = null;
  let cachedLastModified: string | null = null;
  let cachedValue: T = emptyValue;

  return async function fetchFresh(): Promise<FetchedResult<T>> {
    try {
      const headers: Record<string, string> = { "Accept-Encoding": "gzip" };
      if (cachedEtag) headers["If-None-Match"] = cachedEtag;
      if (cachedLastModified) headers["If-Modified-Since"] = cachedLastModified;

      const resp = await fetch(opts.url, { headers });

      if (resp.status === 304) {
        return { value: cachedValue, fresh: false, bytes: 0, decodeMs: 0 };
      }
      if (!resp.ok) throw new Error(`[${opts.label}] fetch failed: ${resp.status} ${resp.statusText}`);

      const buf = new Uint8Array(await resp.arrayBuffer());
      const t0 = Date.now();
      cachedValue = opts.decode(buf);
      const decodeMs = Date.now() - t0;

      cachedEtag = resp.headers.get("etag");
      cachedLastModified = resp.headers.get("last-modified");

      return { value: cachedValue, fresh: true, bytes: buf.length, decodeMs };
    } catch (err) {
      console.warn(`[${opts.label}] fetch failed, using cached:`, err);
      return { value: cachedValue, fresh: false, bytes: 0, decodeMs: 0 };
    }
  };
}
