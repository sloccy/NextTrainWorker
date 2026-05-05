/**
 * Binary encoding/decoding for the arrivals wire format.
 *
 * arrivals/current.bin layout:
 *   [u32 generated_at][u16 num_stations]
 *   [u16 dict_count]
 *   dictionary: dict_count × ([u8 len][chars])
 *   index: num_stations × ([u8 slug_len][slug][u32 data_offset])
 *   data:  per station: [u8 count] × ([u8 r,g,b][u8 route_idx][u8 dir][u8 hs_idx][u16 time_mins][u8 label_idx])
 *
 * arrivals/stations.bin: exact binary the phone's stations.js:pack() used to produce.
 *   [u32 generated_at][u16 station_count]
 *   per station: [lpStr slug][u8 route_count] × ([u8 r,g,b][lpStr route][u8 dir][lpStr headsign])
 */

export interface BinArrival {
  r: number; g: number; b: number;
  route: string; dir: string;
  headsign: string;
  /** Minutes since midnight, or -1 if using the string fallback */
  timeMins: number;
  timeStr: string;
  label: string;
}

export interface StationWire {
  k: string;
  r: Array<{ r: string; c: string | null; d: string; h: string }>;
}

// ─── Low-level writers ────────────────────────────────────────────────────────

function w8(buf: number[], v: number): void { buf.push(v & 0xFF); }
function w16be(buf: number[], v: number): void { buf.push((v >>> 8) & 0xFF, v & 0xFF); }
function w32be(buf: number[], v: number): void {
  buf.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF);
}
function wLpStr(buf: number[], s: string, maxLen: number): void {
  const t = s.slice(0, maxLen);
  buf.push(Math.min(t.length, 255));
  for (let i = 0; i < t.length; i++) buf.push(t.charCodeAt(i) & 0xFF);
}

export function hexToRgb(c: string | null): { r: number; g: number; b: number } {
  if (!c) return { r: 0x88, g: 0x88, b: 0x88 };
  const v = parseInt(c.replace("#", ""), 16);
  if (isNaN(v)) return { r: 0x88, g: 0x88, b: 0x88 };
  return { r: (v >>> 16) & 0xFF, g: (v >>> 8) & 0xFF, b: v & 0xFF };
}

// ─── Dictionary Encoding ──────────────────────────────────────────────────────

class Dictionary {
  map = new Map<string, number>();
  list: string[] = [];

  get(s: string): number {
    let idx = this.map.get(s);
    if (idx === undefined) {
      idx = this.list.length;
      if (idx > 255) return 0; // Cap at 256 strings for now
      this.map.set(s, idx);
      this.list.push(s);
    }
    return idx;
  }

  write(buf: number[]): void {
    w16be(buf, this.list.length);
    for (const s of this.list) wLpStr(buf, s, 64);
  }
}

// ─── arrivals/current.bin ─────────────────────────────────────────────────────

export function buildArrivalsBin(
  stationArrivals: Map<string, BinArrival[]>,
  generatedAt: number,
): Uint8Array {
  const slugs = [...stationArrivals.keys()].sort();
  const dict = new Dictionary();

  // Encode each station's data block first so we know byte offsets.
  // We'll also collect all strings into the dictionary during this pass.
  const dataBlocks: number[][] = [];
  for (const slug of slugs) {
    const arrivals = stationArrivals.get(slug)!;
    const block: number[] = [];
    const count = Math.min(arrivals.length, 255);
    w8(block, count);
    for (let i = 0; i < count; i++) {
      const a = arrivals[i];
      w8(block, a.r); w8(block, a.g); w8(block, a.b);
      w8(block, dict.get(a.route));
      w8(block, a.dir.charCodeAt(0));
      w8(block, dict.get(a.headsign));
      w16be(block, a.timeMins);
      w8(block, dict.get(a.label));
    }
    dataBlocks.push(block);
  }

  const result: number[] = [];
  w32be(result, generatedAt);
  w16be(result, slugs.length);
  dict.write(result);

  // Compute index byte size: each entry = 1 + slug_len + 4
  let indexSize = 0;
  const indexEntries: number[][] = [];
  for (const slug of slugs) {
    const e: number[] = [];
    wLpStr(e, slug, 64);
    indexSize += e.length + 4;
    indexEntries.push(e);
  }

  // data starts after header(6) + dict + index
  let offset = result.length + indexSize;
  for (let i = 0; i < slugs.length; i++) {
    result.push(...indexEntries[i]);
    w32be(result, offset);
    offset += dataBlocks[i].length;
  }
  for (const block of dataBlocks) result.push(...block);

  return new Uint8Array(result);
}

/**
 * Scan the arrivals binary for a station slug, filter by route:dir pairs,
 * and return a watch-format binary (no dir byte) + generatedAt.
 * Returns null if the station slug is not found in the index.
 */
export function scanArrivalsBin(
  bin: Uint8Array,
  slug: string,
  pairs: Array<{ route: string; dir: string }>,
): { buf: Uint8Array; generatedAt: number } | null {
  if (bin.length < 8) return null;

  let pos = 0;
  const generatedAt = ((bin[pos++] << 24) | (bin[pos++] << 16) | (bin[pos++] << 8) | bin[pos++]) >>> 0;
  const numStations = (bin[pos++] << 8) | bin[pos++];

  // Read dictionary
  const dictCount = (bin[pos++] << 8) | bin[pos++];
  const dict: string[] = [];
  for (let i = 0; i < dictCount; i++) {
    const len = bin[pos++];
    let s = "";
    for (let j = 0; j < len; j++) s += String.fromCharCode(bin[pos + j]);
    dict.push(s);
    pos += len;
  }

  // Prepare filter: map target route names to dict IDs for O(1) matching in loop.
  const pairSet = new Set<string>();
  const routeToId = new Map<string, number>();
  for (let i = 0; i < dict.length; i++) routeToId.set(dict[i], i);
  for (const p of pairs) {
    const rid = routeToId.get(p.route);
    if (rid !== undefined) pairSet.add(`${rid}:${p.dir}`);
  }

  // Binary search for station slug in index.
  const indexStart = pos;
  const slugBytes = new TextEncoder().encode(slug);
  
  let low = 0;
  let high = numStations - 1;
  let dataOffset = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    // Find start of mid-th index entry.
    // Index entries are variable length ([u8 len][chars][u32 offset]), so we must
    // either have a fixed-size index or a pre-scanned lookup table.
    // Given the constraints, let's just use the fact that it's sorted and scan
    // to find the mid-th entry. For 50-100 stations, this is still fine.
    // Optimization: we could store a fixed-size table of offsets to index entries.
    // But let's see if linear scan of index is really that bad. 
    // Wait, the index is small (~3KB). Linear scan IS binary search if we do it right.
    // Let's stick to linear scan for now but with byte-wise comparison to avoid allocations.
    break;
  }

  // Linear scan of index (micro-optimized)
  pos = indexStart;
  for (let i = 0; i < numStations; i++) {
    const slen = bin[pos++];
    let match = slen === slugBytes.length;
    if (match) {
      for (let j = 0; j < slen; j++) {
        if (bin[pos + j] !== slugBytes[j]) { match = false; break; }
      }
    }
    pos += slen;
    const off = ((bin[pos] << 24) | (bin[pos + 1] << 16) | (bin[pos + 2] << 8) | bin[pos + 3]) >>> 0;
    pos += 4;
    if (match) { dataOffset = off; break; }
  }

  if (dataOffset < 0 || dataOffset >= bin.length) return null;

  // Scan arrivals block.
  pos = dataOffset;
  const numArrivals = bin[pos++];
  const out: number[] = [];
  let outCount = 0;

  for (let i = 0; i < numArrivals && outCount < 10; i++) {
    const r = bin[pos++];
    const g = bin[pos++];
    const b = bin[pos++];
    const routeIdx = bin[pos++];
    const dir = String.fromCharCode(bin[pos++]);
    const hsIdx = bin[pos++];
    const timeMins = (bin[pos++] << 8) | bin[pos++];
    const labelIdx = bin[pos++];

    if (!pairSet.has(`${routeIdx}:${dir}`)) continue;

    const routeStr = dict[routeIdx] || "";
    const hsStr = dict[hsIdx] || "";
    const labelStr = dict[labelIdx] || "";
    const timeStr = formatTime(timeMins);

    // Emit watch-format entry: [r,g,b][route lpStr][hs lpStr][time lpStr][label lpStr]
    out.push(r, g, b);
    wLpStr(out, routeStr, 8);
    wLpStr(out, hsStr, 24);
    wLpStr(out, timeStr, 12);
    wLpStr(out, labelStr, 32);
    outCount++;
  }

  return { buf: new Uint8Array([outCount, ...out]), generatedAt };
}

function formatTime(mins: number): string {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const p = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m < 10 ? '0' : ''}${m} ${p}`;
}

// ─── arrivals/stations.bin ────────────────────────────────────────────────────

export function buildStationsBin(stations: StationWire[], generatedAt: number): Uint8Array {
  const buf: number[] = [];
  w32be(buf, generatedAt);
  w16be(buf, stations.length);
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
