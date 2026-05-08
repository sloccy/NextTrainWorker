import { describe, it, expect } from "vitest";
import { patchLiveWith } from "../worker/live/patch.js";

interface Arrival {
  route: string;
  dir: string;
  monoMins: number;
  tripId: string;
  stopId?: string;
}

function buildTestTemplate(
  baseMidnight: number,
  stations: Array<{ slug: string; arrivals: Arrival[] }>,
): {
  template: Uint8Array;
  tripOffsets: Map<string, Uint32Array>;
  stopOffsets: Map<string, Map<string, Uint32Array>>;
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
    const e: number[] = [st.slug.length];
    for (let i = 0; i < st.slug.length; i++) e.push(st.slug.charCodeAt(i));
    e.push(0, 0, 0, 0);
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
    for (let j = 0; j < e.length - 4; j++) idx.push(e[j]);
    idx.push(do_ & 0xFF, (do_ >>> 8) & 0xFF, (do_ >>> 16) & 0xFF, (do_ >>> 24) & 0xFF);
  }

  const data: number[] = [];
  const tripOffsetsRaw = new Map<string, number[]>();
  const stopOffsetsRaw = new Map<string, Map<string, number[]>>();

  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    data.push(st.arrivals.length & 0xFF, (st.arrivals.length >>> 8) & 0xFF);
    for (let j = 0; j < st.arrivals.length; j++) {
      const a = st.arrivals[j];
      const statusOff = dataOffsets[i] + 2 + j * 5 + 4;
      data.push(getIdx(a.route), a.dir.charCodeAt(0), a.monoMins & 0xFF, (a.monoMins >>> 8) & 0xFF, 0);

      let tarr = tripOffsetsRaw.get(a.tripId);
      if (!tarr) { tarr = []; tripOffsetsRaw.set(a.tripId, tarr); }
      tarr.push(statusOff);

      if (a.stopId !== undefined) {
        let outer = stopOffsetsRaw.get(a.tripId);
        if (!outer) { outer = new Map(); stopOffsetsRaw.set(a.tripId, outer); }
        let sarr = outer.get(a.stopId);
        if (!sarr) { sarr = []; outer.set(a.stopId, sarr); }
        sarr.push(statusOff);
      }
    }
  }

  const tripOffsets = new Map<string, Uint32Array>();
  for (const [k, v] of tripOffsetsRaw) tripOffsets.set(k, new Uint32Array(v));

  const stopOffsets = new Map<string, Map<string, Uint32Array>>();
  for (const [tid, inner] of stopOffsetsRaw) {
    const m = new Map<string, Uint32Array>();
    for (const [sid, v] of inner) m.set(sid, new Uint32Array(v));
    stopOffsets.set(tid, m);
  }

  const template = new Uint8Array([...hdr, ...idx, ...data]);
  return { template, tripOffsets, stopOffsets };
}

const BASE = 1700000000;

describe("patchLiveWith", () => {
  it("zero live maps — only generated_at changes", () => {
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "a",
      arrivals: [{ route: "A", dir: "N", monoMins: 100, tripId: "trip-noop" }],
    }]);
    const out = new Uint8Array(template.length);
    const before = Date.now();
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map(), new Map());
    const after = Date.now();

    const genAt = (result[0] | (result[1] << 8) | (result[2] << 16) | (result[3] << 24)) >>> 0;
    expect(genAt).toBeGreaterThanOrEqual(Math.floor(before / 1000));
    expect(genAt).toBeLessThanOrEqual(Math.floor(after / 1000) + 1);

    for (let i = 8; i < result.length; i++) {
      if (result[i] !== template[i]) expect(i).toBeLessThan(4);
    }
  });

  it("cancelled trip (rel=3) → status byte = 128", () => {
    const tripId = "trip-cancelled";
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "b",
      arrivals: [{ route: "B", dir: "S", monoMins: 200, tripId }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map([[tripId, 3]]), new Map());
    expect(result[tripOffsets.get(tripId)![0]]).toBe(128);
  });

  it("skipped trip (rel=4) → status byte = 129", () => {
    const tripId = "trip-skipped";
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "c",
      arrivals: [{ route: "L", dir: "N", monoMins: 300, tripId }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map([[tripId, 4]]), new Map());
    expect(result[tripOffsets.get(tripId)![0]]).toBe(129);
  });

  it("on-time trip (rel=0) → status byte unchanged (0)", () => {
    const tripId = "trip-ontime";
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "d",
      arrivals: [{ route: "R", dir: "W", monoMins: 400, tripId }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map([[tripId, 0]]), new Map());
    expect(result[tripOffsets.get(tripId)![0]]).toBe(0);
  });

  it("tripId not in offsets → no-op", () => {
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "e",
      arrivals: [{ route: "A", dir: "N", monoMins: 100, tripId: "trip-in-template" }],
    }]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map([["trip-not-in-template", 3]]), new Map());
    for (let i = 4; i < result.length; i++) expect(result[i]).toBe(template[i]);
  });

  it("multi-stop trip patches all occurrences", () => {
    const tripId = "trip-multi";
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [
      { slug: "s1", arrivals: [{ route: "W", dir: "N", monoMins: 100, tripId }] },
      { slug: "s2", arrivals: [{ route: "W", dir: "N", monoMins: 110, tripId }] },
    ]);
    const out = new Uint8Array(template.length);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map([[tripId, 3]]), new Map());
    const offs = tripOffsets.get(tripId)!;
    expect(offs.length).toBe(2);
    expect(result[offs[0]]).toBe(128);
    expect(result[offs[1]]).toBe(128);
  });

  it("per-stop delay override patches status byte", () => {
    const tripId = "trip1";
    const stopId = "stopA";
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "f",
      arrivals: [{ route: "D", dir: "N", monoMins: 500, tripId, stopId }],
    }]);
    const out = new Uint8Array(template.length);
    const stopOverrides = new Map([[tripId, new Map([[stopId, 3]])]]);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map([[tripId, 0]]), stopOverrides);
    expect(result[tripOffsets.get(tripId)![0]]).toBe(3);
  });

  it("per-stop early: -4 min → status byte 0xFC", () => {
    const tripId = "trip2";
    const stopId = "stopB";
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "g",
      arrivals: [{ route: "E", dir: "S", monoMins: 600, tripId, stopId }],
    }]);
    const out = new Uint8Array(template.length);
    const stopOverrides = new Map([[tripId, new Map([[stopId, (-4) & 0xff]])]]);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map([[tripId, 0]]), stopOverrides);
    expect(result[tripOffsets.get(tripId)![0]]).toBe(0xFC);
  });

  it("per-stop skipped (stopRel=1) → status byte 129", () => {
    const tripId = "trip3";
    const stopId = "stopC";
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "h",
      arrivals: [{ route: "W", dir: "N", monoMins: 700, tripId, stopId }],
    }]);
    const out = new Uint8Array(template.length);
    const stopOverrides = new Map([[tripId, new Map([[stopId, 129]])]]);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map([[tripId, 0]]), stopOverrides);
    expect(result[tripOffsets.get(tripId)![0]]).toBe(129);
  });

  it("stop override without trip-level entry — stop still patches", () => {
    const tripId = "trip4";
    const stopId = "stopD";
    const { template, tripOffsets, stopOffsets } = buildTestTemplate(BASE, [{
      slug: "i",
      arrivals: [{ route: "R", dir: "E", monoMins: 800, tripId, stopId }],
    }]);
    const out = new Uint8Array(template.length);
    const stopOverrides = new Map([[tripId, new Map([[stopId, 5]])]]);
    const result = patchLiveWith(out, template, tripOffsets, stopOffsets, new Map(), stopOverrides);
    expect(result[tripOffsets.get(tripId)![0]]).toBe(5);
  });
});
