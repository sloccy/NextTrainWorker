export interface StationWire {
  k: string;
  r: Array<{ r: string; c: string | null; d: string; h: string }>;
}

export function w8(buf: number[], v: number): void { buf.push(v & 0xFF); }
export function w16(buf: number[], v: number): void { buf.push(v & 0xFF, (v >>> 8) & 0xFF); }
export function w32(buf: number[], v: number): void {
  buf.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
}
export function wLpStr(buf: number[], s: string, maxLen: number): void {
  const t = s.slice(0, maxLen);
  buf.push(Math.min(t.length, 255));
  for (let i = 0; i < t.length; i++) buf.push(t.charCodeAt(i) & 0xFF);
}

export function hexToRgb(c: string | null): { r: number; g: number; b: number } {
  if (!c) return { r: 0x88, g: 0x88, b: 0x88 };
  const v = Number.parseInt(c.replace("#", ""), 16);
  if (Number.isNaN(v)) return { r: 0x88, g: 0x88, b: 0x88 };
  return { r: (v >>> 16) & 0xFF, g: (v >>> 8) & 0xFF, b: v & 0xFF };
}

export class Dictionary {
  map = new Map<string, number>();
  list: string[] = [];

  get(s: string): number {
    let idx = this.map.get(s);
    if (idx === undefined) {
      idx = this.list.length;
      if (idx > 255) return 0;
      this.map.set(s, idx);
      this.list.push(s);
    }
    return idx;
  }

  write(buf: number[]): void {
    w16(buf, this.list.length);
    for (const s of this.list) wLpStr(buf, s, 64);
  }
}

export function buildStationsBin(stations: StationWire[], generatedAt: number): Uint8Array {
  const buf: number[] = [];
  w32(buf, generatedAt);
  w16(buf, stations.length);
  for (const st of stations) {
    wLpStr(buf, st.k, 39);
    w8(buf, st.r.length);
    for (const rm of st.r) {
      const { r, g, b } = hexToRgb(rm.c);
      w8(buf, r); w8(buf, g); w8(buf, b);
      wLpStr(buf, rm.r, 3);
      w8(buf, rm.d.charCodeAt(0));
      wLpStr(buf, rm.h, 24);
    }
  }
  return new Uint8Array(buf);
}
