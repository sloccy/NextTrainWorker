import { TEMPLATE_BYTES, HASH_OFFSETS } from "../template.generated.js";
import type { LiveByTripIdHash } from "./tripupdate.js";

const REUSABLE_OUT = new Uint8Array(TEMPLATE_BYTES.length || 65536);

export function patchLive(live: LiveByTripIdHash): Uint8Array {
  return patchLiveWith(REUSABLE_OUT, TEMPLATE_BYTES, HASH_OFFSETS, live);
}

export function patchLiveWith(
  out: Uint8Array,
  template: Uint8Array,
  offsets: Map<number, number[]>,
  live: LiveByTripIdHash,
): Uint8Array {
  out.set(template);
  const now = Math.floor(Date.now() / 1000);
  out[0] = now & 0xFF;
  out[1] = (now >>> 8) & 0xFF;
  out[2] = (now >>> 16) & 0xFF;
  out[3] = (now >>> 24) & 0xFF;

  for (const [hash, rel] of live) {
    const offs = offsets.get(hash);
    if (offs === undefined) continue;
    const status = rel === 3 ? 128 : rel === 4 ? 129 : 130;
    for (const o of offs) out[o] = status;
  }
  return out.subarray(0, template.length);
}
