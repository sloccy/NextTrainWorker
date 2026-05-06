import { describe, it, expect } from "vitest";
import { patchLiveWith } from "../live/merge.js";

// Minimal template builder for tests:
// header: [u32 genAt=0][u32 baseMidnight][u16 dictCount][u8 len][chars...][u16 numStations]
// index:  [u8 slugLen][slug][u32 dataOffset]
// data:   [u16 count] × [u8 routeIdx][u8 dir][u16 monoMins][u8 status=0]

function buildTestTemplate(
  baseMidnight: number,
  stations: Array<{
    slug: string;
    arrivals: Array<{ route: string; dir: string; monoMins: number; tripIdHash: number }>;
  }>,
): { template: Uint8Array; offsets: Map<number, number[]> } {
  const dict: string[] = [];
  const dictIdx = new Map<string, number>();
  const getIdx = (r: string) => {
    let i = dictIdx.get(r);
    if (i === undefined) { i = dict.length; dict.push(r); dictIdx.set(r, i); }
    return i;
  };

  // Pre-populate dict
  for (const st of stations) for (const a of st.arrivals) getIdx(a.route);

  const hdr: number[] = [];
  // generated_at = 0
  hdr.push(0, 0, 0, 0);
  // base_midnight_utc (LE)
  hdr.push(baseMidnight & 0xFF, (baseMidnight >>> 8) & 0xFF, (baseMidnight >>> 16) & 0xFF, (baseMidnight >>> 24) & 0xFF);
  // dict
  hdr.push(dict.length & 0xFF, (dict.length >>> 8) & 0xFF);
  for (const s of dict) { hdr.push(s.length); for (let i = 0; i < s.length; i++) hdr.push(s.charCodeAt(i)); }
  // num_stations
  hdr.push(stations.length & 0xFF, (stations.length >>> 8) & 0xFF);

  // Compute index entries
  const indexEntries: number[][] = [];
  let indexSize = 0;
  for (const st of stations) {
    const e: number[] = [st.slug.length, ...st.slug.split('').map(c => c.charCodeAt(0)), 0, 0, 0, 0];
    indexSize += e.length;
    indexEntries.push(e);
  }

  // Compute data offsets
  const dataStart = hdr.length + indexSize;
  const dataOffsets: number[] = [];
  let off = dataStart;
  for (const st of stations) {
    dataOffsets.push(off);
    off += 2 + st.arrivals.length * 5;
  }

  // Write index with real offsets
  const idx: number[] = [];
  for (let i = 0; i < stations.length; i++) {
    const e = indexEntries[i];
    const do_ = dataOffsets[i];
    idx.push(...e.slice(0, e.length - 4), do_ & 0xFF, (do_ >>> 8) & 0xFF, (do_ >>> 16) & 0xFF, (do_ >>> 24) & 0xFF);
  }

  // Write data + build offset map
  const data: number[] = [];
  const offsetMap = new Map<number, number[]>();
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    data.push(st.arrivals.length & 0xFF, (st.arrivals.length >>> 8) & 0xFF);
    for (let j = 0; j < st.arrivals.length; j++) {
      const a = st.arrivals[j];
      const statusByteAbsoluteOffset = dataOffsets[i] + 2 + j * 5 + 4;
      data.push(getIdx(a.route), a.dir.charCodeAt(0), a.monoMins & 0xFF, (a.monoMins >>> 8) & 0xFF, 0);
      let arr = offsetMap.get(a.tripIdHash);
      if (!arr) { arr = []; offsetMap.set(a.tripIdHash, arr); }
      arr.push(statusByteAbsoluteOffset);
    }
  }

  const template = new Uint8Array([...hdr, ...idx, ...data]);
  return { template, offsets: offsetMap };
}

const BASE_MIDNIGHT = 1700000000; // arbitrary fixed epoch for tests

describe("patchLiveWith", () => {
  it("zero live map — only generated_at changes", () => {
    const { template, offsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "a",
      arrivals: [{ route: "A", dir: "N", monoMins: 100, tripIdHash: 0xDEADBEEF }],
    }]);
    const out = new Uint8Array(template.length);
    const before = Date.now();
    const result = patchLiveWith(out, template, offsets, new Map());
    const after = Date.now();

    const genAt = (result[0] | (result[1] << 8) | (result[2] << 16) | (result[3] << 24)) >>> 0;
    const nowSec = Math.floor(Date.now() / 1000);
    expect(genAt).toBeGreaterThanOrEqual(Math.floor(before / 1000));
    expect(genAt).toBeLessThanOrEqual(Math.floor(after / 1000) + 1);

    // All status bytes remain 0
    for (let i = 8; i < result.length; i++) {
      if (i >= 8 && result[i] !== template[i]) {
        // Only generated_at (0-3) should differ
        expect(i).toBeLessThan(4);
      }
    }
  });

  it("cancelled trip (rel=3) → status byte = 128", () => {
    const hash = 0xCAFEBABE;
    const { template, offsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "b",
      arrivals: [{ route: "B", dir: "S", monoMins: 200, tripIdHash: hash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, new Map([[hash, 3]]));
    const statusOff = offsets.get(hash)![0];
    expect(result[statusOff]).toBe(128); // -128 as u8
  });

  it("skipped trip (rel=4) → status byte = 129", () => {
    const hash = 0x11223344;
    const { template, offsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "c",
      arrivals: [{ route: "L", dir: "N", monoMins: 300, tripIdHash: hash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, new Map([[hash, 4]]));
    expect(result[offsets.get(hash)![0]]).toBe(129);
  });

  it("live/on-time trip (rel=0) → status byte = 130", () => {
    const hash = 0xAABBCCDD;
    const { template, offsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "d",
      arrivals: [{ route: "R", dir: "W", monoMins: 400, tripIdHash: hash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, new Map([[hash, 0]]));
    expect(result[offsets.get(hash)![0]]).toBe(130);
  });

  it("hash not in offsets → no-op", () => {
    const { template, offsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "e",
      arrivals: [{ route: "A", dir: "N", monoMins: 100, tripIdHash: 0x12345678 }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, new Map([[0x99999999, 3]]));
    // No status byte changed (only generated_at differs)
    for (let i = 4; i < result.length; i++) {
      expect(result[i]).toBe(template[i]);
    }
  });

  it("multi-stop trip patches all occurrences", () => {
    const hash = 0xFEEDFACE;
    const { template, offsets } = buildTestTemplate(BASE_MIDNIGHT, [
      { slug: "s1", arrivals: [{ route: "W", dir: "N", monoMins: 100, tripIdHash: hash }] },
      { slug: "s2", arrivals: [{ route: "W", dir: "N", monoMins: 110, tripIdHash: hash }] },
    ]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, new Map([[hash, 3]]));
    const offs = offsets.get(hash)!;
    expect(offs.length).toBe(2);
    expect(result[offs[0]]).toBe(128);
    expect(result[offs[1]]).toBe(128);
  });
});
