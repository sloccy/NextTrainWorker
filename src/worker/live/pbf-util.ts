import type { PbfReader } from "pbf";

const _td = new TextDecoder();

export function readString(pbf: PbfReader): string {
  const len = pbf.readVarint();
  const s = pbf.pos;
  pbf.pos = s + len;
  return _td.decode((pbf.buf as Uint8Array).subarray(s, s + len));
}

export function noop(_tag: number, _result: null, _pbf: PbfReader): void {}
