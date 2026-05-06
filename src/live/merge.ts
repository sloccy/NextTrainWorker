import { TEMPLATE_BYTES, HASH_OFFSETS, STOP_HASH_OFFSETS } from "../template.generated.js";

const REUSABLE_OUT = new Uint8Array(TEMPLATE_BYTES.length || 65536);

export function patchLive(
  tripStatus: Map<number, number>,
  stopOverrides: Map<number, number>,
): Uint8Array {
  return patchLiveWith(REUSABLE_OUT, TEMPLATE_BYTES, HASH_OFFSETS, STOP_HASH_OFFSETS, tripStatus, stopOverrides);
}

export function patchLiveWith(
  out: Uint8Array,
  template: Uint8Array,
  tripOffsets: Map<number, number[]>,
  stopOffsets: Map<number, number[]>,
  tripStatus: Map<number, number>,
  stopOverrides: Map<number, number>,
): Uint8Array {
  out.set(template);
  const now = Math.floor(Date.now() / 1000);
  out[0] = now & 0xFF;
  out[1] = (now >>> 8) & 0xFF;
  out[2] = (now >>> 16) & 0xFF;
  out[3] = (now >>> 24) & 0xFF;

  // Pass 1 — trip-level: mark all stops on a trip with its coarse status.
  // Fallback "on time" (130 / -126) for any trip present in the feed.
  for (const [hash, rel] of tripStatus) {
    const offs = tripOffsets.get(hash);
    if (offs === undefined) continue;
    const status = rel === 3 ? 128 : rel === 4 ? 129 : 130;
    for (const o of offs) out[o] = status;
  }

  // Pass 2 — per-stop override: refine with actual delay buckets where available.
  for (const [compHash, statusByte] of stopOverrides) {
    const offs = stopOffsets.get(compHash);
    if (offs === undefined) continue;
    for (const o of offs) out[o] = statusByte;
  }

  return out.subarray(0, template.length);
}
