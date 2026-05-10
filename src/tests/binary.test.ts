import { describe, it, expect } from "vitest";
import { scanArrivalsBin } from "../worker/binary/scan.js";

function buildTestBin(
  baseMidnight: number,
  stations: Array<{
    slug: string;
    arrivals: Array<{ route: string; dir: string; monoMins: number; delayStatus: number }>;
  }>,
): Uint8Array {
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
  for (const st of stations) {
    data.push(st.arrivals.length & 0xFF, (st.arrivals.length >>> 8) & 0xFF);
    for (const a of st.arrivals) {
      data.push(getIdx(a.route), a.dir.charCodeAt(0), a.monoMins & 0xFF, (a.monoMins >>> 8) & 0xFF, a.delayStatus);
    }
  }

  return new Uint8Array([...hdr, ...idx, ...data]);
}

describe("scanArrivalsBin", () => {
  const BASE = 1700000000;

  it("keeps a delayed train whose scheduled time is past but predicted time is future", () => {
    const fakeNow = BASE + 610 * 60;
    const bin = buildTestBin(BASE, [{ slug: "test-station", arrivals: [{ route: "D", dir: "N", monoMins: 598, delayStatus: 15 }] }]);
    const realNow = Date.now;
    Date.now = () => fakeNow * 1000;
    try {
      const r = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(r).not.toBeNull();
      expect(r!.buf[0]).toBe(1);
    } finally { Date.now = realNow; }
  });

  it("drops a train whose predicted time is past the cutoff", () => {
    const fakeNow = BASE + 610 * 60;
    const bin = buildTestBin(BASE, [{ slug: "test-station", arrivals: [{ route: "D", dir: "N", monoMins: 608, delayStatus: 0 }] }]);
    const realNow = Date.now;
    Date.now = () => fakeNow * 1000;
    try {
      const r = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(r).not.toBeNull();
      expect(r!.buf[0]).toBe(0);
    } finally { Date.now = realNow; }
  });

  it("handles negative delays correctly", () => {
    const fakeNow = BASE + 610 * 60;
    const bin = buildTestBin(BASE, [{ slug: "test-station", arrivals: [{ route: "D", dir: "N", monoMins: 607, delayStatus: 253 }] }]);
    const realNow = Date.now;
    Date.now = () => fakeNow * 1000;
    try {
      const r = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(r).not.toBeNull();
      expect(r!.buf[0]).toBe(0);
    } finally { Date.now = realNow; }
  });

  it("keeps an on-time train at exactly the cutoff", () => {
    const fakeNow = BASE + 610 * 60;
    const bin = buildTestBin(BASE, [{ slug: "test-station", arrivals: [{ route: "D", dir: "N", monoMins: 609, delayStatus: 130 }] }]);
    const realNow = Date.now;
    Date.now = () => fakeNow * 1000;
    try {
      const r = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(r).not.toBeNull();
      expect(r!.buf[0]).toBe(1);
    } finally { Date.now = realNow; }
  });

  it("keeps Canceled (128) and Skipped (129) trains if scheduled in future", () => {
    const fakeNow = BASE + 610 * 60;
    const bin = buildTestBin(BASE, [{
      slug: "test-station",
      arrivals: [
        { route: "D", dir: "N", monoMins: 615, delayStatus: 128 },
        { route: "E", dir: "S", monoMins: 615, delayStatus: 129 },
      ],
    }]);
    const realNow = Date.now;
    Date.now = () => fakeNow * 1000;
    try {
      expect(scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }])!.buf[0]).toBe(1);
      expect(scanArrivalsBin(bin, "test-station", [{ route: "E", dir: "S" }])!.buf[0]).toBe(1);
    } finally { Date.now = realNow; }
  });
});
