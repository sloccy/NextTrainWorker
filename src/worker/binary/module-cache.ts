const _cache = new Map<string, Uint8Array>();

export function getCachedBin(name: string): Uint8Array | null {
  return _cache.get(name) ?? null;
}

export function setCachedBin(name: string, buf: Uint8Array): void {
  _cache.set(name, buf);
}

// Thin wrappers preserving the existing arrivals API
export const getCachedOutput = (): Uint8Array | null => getCachedBin("arrivals");
export const setCachedOutput = (buf: Uint8Array): void => setCachedBin("arrivals", buf);
