import { TRIP_OFFSETS, STOP_OFFSETS } from "../generated/offsets.js";

const enc = new TextEncoder();

export function fnv1a(bytes: Uint8Array, start: number, end: number): number {
  let h = 2166136261;
  for (let i = start; i < end; i++) {
    h = (h ^ bytes[i]) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function buildHash(keys: Iterable<string>): Map<number, string> {
  const map = new Map<number, string>();
  for (const k of keys) {
    const b = enc.encode(k);
    const h = fnv1a(b, 0, b.length);
    if (map.has(h) && map.get(h) !== k) throw new Error(`FNV collision: "${map.get(h)}" vs "${k}"`);
    map.set(h, k);
  }
  return map;
}

export const TRIP_HASH: Map<number, string> = buildHash(TRIP_OFFSETS.keys());

const stopKeys = (function* () {
  for (const outer of STOP_OFFSETS.values()) yield* outer.keys();
})();
export const STOP_HASH: Map<number, string> = buildHash(stopKeys);
