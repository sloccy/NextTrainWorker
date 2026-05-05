/**
 * Binary encoding/decoding for the arrivals wire format.
 *
 * arrivals/current.bin layout:
 *   [u32 generated_at][u16 num_stations]
 *   index: num_stations × ([u8 slug_len][slug][u32 data_offset])
 *   data:  per station: [u8 count] × ([u8 r,g,b][lpStr route][u8 dir][lpStr hs][lpStr time][lpStr label])
 *
 * arrivals/stations.bin: exact binary the phone's stations.js:pack() used to produce.
 *   [u32 generated_at][u16 station_count]
 *   per station: [lpStr slug][u8 route_count] × ([u8 r,g,b][lpStr route][u8 dir][lpStr headsign])
 */

export interface BinArrival {
  r: number; g: number; b: number;
  route: string; dir: string;
  headsign: string; time: string; label: string;
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
  buf.push(t.length);
  for (let i = 0; i < t.length; i++) buf.push(t.charCodeAt(i));
}

export function hexToRgb(c: string | null): { r: number; g: number; b: number } {
  if (!c) return { r: 0x88, g: 0x88, b: 0x88 };
  const v = parseInt(c.replace("#", ""), 16);
  if (isNaN(v)) return { r: 0x88, g: 0x88, b: 0x88 };
  return { r: (v >>> 16) & 0xFF, g: (v >>> 8) & 0xFF, b: v & 0xFF };
}

// ─── arrivals/current.bin ─────────────────────────────────────────────────────

export function buildArrivalsBin(
  stationArrivals: Map<string, BinArrival[]>,
  generatedAt: number,
): Uint8Array {
  const slugs = [...stationArrivals.keys()].sort();

  // Encode each station's data block first so we know byte offsets.
  const dataBlocks: number[][] = [];
  for (const slug of slugs) {
    const arrivals = stationArrivals.get(slug)!;
    const block: number[] = [];
    const count = Math.min(arrivals.length, 255);
    w8(block, count);
    for (let i = 0; i < count; i++) {
      const a = arrivals[i];
      w8(block, a.r); w8(block, a.g); w8(block, a.b);
      wLpStr(block, a.route,    8);
      w8(block, a.dir.charCodeAt(0));
      wLpStr(block, a.headsign, 24);
      wLpStr(block, a.time,     12);
      wLpStr(block, a.label,    32);
    }
    dataBlocks.push(block);
  }

  // Compute index byte size: each entry = lpStr(slug) + u32 offset
  const indexEntries: number[][] = [];
  let indexSize = 0;
  for (const slug of slugs) {
    const e: number[] = [];
    wLpStr(e, slug, 39);
    indexSize += e.length + 4;
    indexEntries.push(e);
  }

  // Header is 6 bytes; data starts right after header + index.
  const dataStart = 6 + indexSize;
  const result: number[] = [];
  w32be(result, generatedAt);
  w16be(result, slugs.length);

  let offset = dataStart;
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
  if (bin.length < 6) return null;

  const generatedAt = ((bin[0] << 24) | (bin[1] << 16) | (bin[2] << 8) | bin[3]) >>> 0;
  const numStations = (bin[4] << 8) | bin[5];

  const pairSet = new Set(pairs.map(p => `${p.route}:${p.dir}`));

  // Linear scan of index for matching slug.
  let pos = 6;
  let dataOffset = -1;
  for (let i = 0; i < numStations; i++) {
    if (pos >= bin.length) break;
    const slen = bin[pos++];
    let sslug = "";
    for (let j = 0; j < slen; j++) sslug += String.fromCharCode(bin[pos + j]);
    pos += slen;
    const off = ((bin[pos] << 24) | (bin[pos + 1] << 16) | (bin[pos + 2] << 8) | bin[pos + 3]) >>> 0;
    pos += 4;
    if (sslug === slug) { dataOffset = off; break; }
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

    // route lpStr — read chars for filter check, remember raw byte range for copy.
    const routeStart = pos;
    const routeLen = bin[pos++];
    let route = "";
    for (let j = 0; j < routeLen; j++) route += String.fromCharCode(bin[pos + j]);
    pos += routeLen;
    const routeEnd = pos;  // raw bytes [routeStart, routeEnd) = [len, chars...]

    // dir byte — filter only, not in output.
    const dir = String.fromCharCode(bin[pos++]);

    // tail: headsign lpStr + time lpStr + label lpStr — copy raw.
    const tailStart = pos;
    const hsLen = bin[pos++]; pos += hsLen;
    const timeLen = bin[pos++]; pos += timeLen;
    const labelLen = bin[pos++]; pos += labelLen;

    if (!pairSet.has(`${route}:${dir}`)) continue;

    // Emit watch-format entry: [r,g,b][route lpStr][hs lpStr][time lpStr][label lpStr]
    out.push(r, g, b);
    for (let j = routeStart; j < routeEnd; j++) out.push(bin[j]);
    for (let j = tailStart;  j < pos;      j++) out.push(bin[j]);
    outCount++;
  }

  return { buf: new Uint8Array([outCount, ...out]), generatedAt };
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
