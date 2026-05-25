// XOR of all u32 words after the timestamp header (first 4 bytes).
export function fingerprint(buf: Uint8Array): number {
  let h = 0;
  const u32 = new Uint32Array(buf.buffer, buf.byteOffset + 4, (buf.byteLength - 4) >>> 2);
  for (let i = 0; i < u32.length; i++) h = (h ^ u32[i]) >>> 0;
  return h;
}
