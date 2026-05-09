let _cachedOutput: Uint8Array | null = null;

export function getCachedOutput(): Uint8Array | null {
  return _cachedOutput;
}

export function setCachedOutput(buf: Uint8Array): void {
  _cachedOutput = buf;
}
