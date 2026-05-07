import { describe, it, expect } from "vitest";
import { patchLiveWith } from "../live/merge.js";
import { hashTripIdStopId } from "../binary.js";

// Minimal template builder for tests:
// header: [u32 genAt=0][u32 baseMidnight][u16 dictCount][u8 len][chars...][u16 numStations]
// index:  [u8 slugLen][slug][u32 dataOffset]
// data:   [u16 count] × [u8 routeIdx][u8 dir][u16 monoMins][u8 status=0]

interface Arrival {
  route: string;
  dir: string;
  monoMins: number;
  tripIdHash: number;
  /** If provided, entry is also registered in stopOffsets keyed by this hash. */
  stopHash?: number;
}

function buildTestTemplate(
  baseMidnight: number,
  stations: Array<{ slug: string; arrivals: Arrival[] }>,
): {
  template: Uint8Array;
  offsets: Map<number, number[]>;
  stopOffsets: Map<number, number[]>;
} {
  const dict: string[] = [];
  const dictIdx = new Map<string, number>();
  const getIdx = (r: string) => {
    let i = dictIdx.get(r);
    if (i === undefined) { i = dict.length; dict.push(r); dictIdx.set(r, i); }
    return i;
  };

  for (const st of stations) for (const a of st.arrivals) getIdx(a.route);

  const hdr: number[] = [];
  hdr.push(0, 0, 0, 0);
  hdr.push(baseMidnight & 0xFF, (baseMidnight >>> 8) & 0xFF, (baseMidnight >>> 16) & 0xFF, (baseMidnight >>> 24) & 0xFF);
  hdr.push(dict.length & 0xFF, (dict.length >>> 8) & 0xFF);
  for (const s of dict) { hdr.push(s.length); for (let i = 0; i < s.length; i++) hdr.push(s.charCodeAt(i)); }
  hdr.push(stations.length & 0xFF, (stations.length >>> 8) & 0xFF);

  const indexEntries: number[][] = [];
  let indexSize = 0;
  for (const st of stations) {
    const e: number[] = [st.slug.length, ...st.slug.split('').map(c => c.charCodeAt(0)), 0, 0, 0, 0];
    indexSize += e.length;
    indexEntries.push(e);
  }

  const dataStart = hdr.length + indexSize;
  const dataOffsets: number[] = [];
  let off = dataStart;
  for (const st of stations) {
    dataOffsets.push(off);
    off += 2 + st.arrivals.length * 5;
  }

  const idx: number[] = [];
  for (let i = 0; i < stations.length; i++) {
    const e = indexEntries[i];
    const do_ = dataOffsets[i];
    idx.push(...e.slice(0, e.length - 4), do_ & 0xFF, (do_ >>> 8) & 0xFF, (do_ >>> 16) & 0xFF, (do_ >>> 24) & 0xFF);
  }

  const data: number[] = [];
  const offsetMap = new Map<number, number[]>();
  const stopOffsetMap = new Map<number, number[]>();
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    data.push(st.arrivals.length & 0xFF, (st.arrivals.length >>> 8) & 0xFF);
    for (let j = 0; j < st.arrivals.length; j++) {
      const a = st.arrivals[j];
      const statusByteOffset = dataOffsets[i] + 2 + j * 5 + 4;
      data.push(getIdx(a.route), a.dir.charCodeAt(0), a.monoMins & 0xFF, (a.monoMins >>> 8) & 0xFF, 0);
      let arr = offsetMap.get(a.tripIdHash);
      if (!arr) { arr = []; offsetMap.set(a.tripIdHash, arr); }
      arr.push(statusByteOffset);
      if (a.stopHash !== undefined) {
        let sarr = stopOffsetMap.get(a.stopHash);
        if (!sarr) { sarr = []; stopOffsetMap.set(a.stopHash, sarr); }
        sarr.push(statusByteOffset);
      }
    }
  }

  const template = new Uint8Array([...hdr, ...idx, ...data]);
  return { template, offsets: offsetMap, stopOffsets: stopOffsetMap };
}

const BASE_MIDNIGHT = 1700000000;

describe("patchLiveWith", () => {
  it("zero live map — only generated_at changes", () => {
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "a",
      arrivals: [{ route: "A", dir: "N", monoMins: 100, tripIdHash: 0xDEADBEEF }],
    }]);
    const out = new Uint8Array(template.length);
    const before = Date.now();
    const result = patchLiveWith(out, template, offsets, stopOffsets, new Map(), new Map());
    const after = Date.now();

    const genAt = (result[0] | (result[1] << 8) | (result[2] << 16) | (result[3] << 24)) >>> 0;
    expect(genAt).toBeGreaterThanOrEqual(Math.floor(before / 1000));
    expect(genAt).toBeLessThanOrEqual(Math.floor(after / 1000) + 1);

    for (let i = 8; i < result.length; i++) {
      if (result[i] !== template[i]) expect(i).toBeLessThan(4);
    }
  });

  it("cancelled trip (rel=3) → status byte = 128", () => {
    const hash = 0xCAFEBABE;
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "b",
      arrivals: [{ route: "B", dir: "S", monoMins: 200, tripIdHash: hash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, stopOffsets, new Map([[hash, 3]]), new Map());
    const statusOff = offsets.get(hash)![0];
    expect(result[statusOff]).toBe(128);
  });

  it("skipped trip (rel=4) → status byte = 129", () => {
    const hash = 0x11223344;
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "c",
      arrivals: [{ route: "L", dir: "N", monoMins: 300, tripIdHash: hash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, stopOffsets, new Map([[hash, 4]]), new Map());
    expect(result[offsets.get(hash)![0]]).toBe(129);
  });

  it("live trip (rel=0) → status byte unchanged (0)", () => {
    const hash = 0xAABBCCDD;
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "d",
      arrivals: [{ route: "R", dir: "W", monoMins: 400, tripIdHash: hash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, stopOffsets, new Map([[hash, 0]]), new Map());
    expect(result[offsets.get(hash)![0]]).toBe(0);
  });

  it("hash not in offsets → no-op", () => {
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "e",
      arrivals: [{ route: "A", dir: "N", monoMins: 100, tripIdHash: 0x12345678 }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, stopOffsets, new Map([[0x99999999, 3]]), new Map());
    for (let i = 4; i < result.length; i++) expect(result[i]).toBe(template[i]);
  });

  it("multi-stop trip patches all occurrences", () => {
    const hash = 0xFEEDFACE;
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [
      { slug: "s1", arrivals: [{ route: "W", dir: "N", monoMins: 100, tripIdHash: hash }] },
      { slug: "s2", arrivals: [{ route: "W", dir: "N", monoMins: 110, tripIdHash: hash }] },
    ]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, offsets, stopOffsets, new Map([[hash, 3]]), new Map());
    const offs = offsets.get(hash)!;
    expect(offs.length).toBe(2);
    expect(result[offs[0]]).toBe(128);
    expect(result[offs[1]]).toBe(128);
  });

  it("per-stop delay override writes status", () => {
    const tripHash = 0x1A2B3C4D;
    const stopHash = hashTripIdStopId("trip1", "stopA");
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "f",
      arrivals: [{ route: "D", dir: "N", monoMins: 500, tripIdHash: tripHash, stopHash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(
      out, template, offsets, stopOffsets,
      new Map([[tripHash, 0]]),
      new Map([[stopHash, 3]]),  // 3 = delayed 3 min
    );
    const statusOff = offsets.get(tripHash)![0];
    expect(result[statusOff]).toBe(3);
  });

  it("per-stop early: -4 min → status byte 0xFC (= -4 as s8)", () => {
    const tripHash = 0x5E6F7A8B;
    const stopHash = hashTripIdStopId("trip2", "stopB");
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "g",
      arrivals: [{ route: "E", dir: "S", monoMins: 600, tripIdHash: tripHash, stopHash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(
      out, template, offsets, stopOffsets,
      new Map([[tripHash, 0]]),
      new Map([[stopHash, (-4) & 0xff]]),
    );
    expect(result[offsets.get(tripHash)![0]]).toBe(0xFC);
  });

  it("per-stop skipped (stopRel=1) → status byte 129", () => {
    const tripHash = 0xC0FFEEEE;
    const stopHash = hashTripIdStopId("trip3", "stopC");
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "h",
      arrivals: [{ route: "W", dir: "N", monoMins: 700, tripIdHash: tripHash, stopHash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(
      out, template, offsets, stopOffsets,
      new Map([[tripHash, 0]]),
      new Map([[stopHash, 129]]),
    );
    expect(result[offsets.get(tripHash)![0]]).toBe(129);
  });

  it("stop override without trip-level entry — stop still patches", () => {
    const tripHash = 0xDECAFBAD;
    const stopHash = hashTripIdStopId("trip4", "stopD");
    const { template, offsets, stopOffsets } = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "i",
      arrivals: [{ route: "R", dir: "E", monoMins: 800, tripIdHash: tripHash, stopHash }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(
      out, template, offsets, stopOffsets,
      new Map(),
      new Map([[stopHash, 5]]),
    );
    expect(result[offsets.get(tripHash)![0]]).toBe(5);
  });
});
