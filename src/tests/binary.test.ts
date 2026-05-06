import { describe, it, expect } from "vitest";
import { scanArrivalsBin } from "../binary.js";

function buildTestTemplate(
  baseMidnight: number,
  stations: Array<{ slug: string; arrivals: Array<{ route: string; dir: string; monoMins: number; delayStatus: number }> }>,
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
  hdr.push(0, 0, 0, 0); // generated_at
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
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    data.push(st.arrivals.length & 0xFF, (st.arrivals.length >>> 8) & 0xFF);
    for (const a of st.arrivals) {
      data.push(getIdx(a.route), a.dir.charCodeAt(0), a.monoMins & 0xFF, (a.monoMins >>> 8) & 0xFF, a.delayStatus);
    }
  }

  return new Uint8Array([...hdr, ...idx, ...data]);
}

describe("scanArrivalsBin Filtering", () => {
  const BASE_MIDNIGHT = 1700000000; // A fixed midnight timestamp

  it("keeps a delayed train whose scheduled time is past but predicted time is future", () => {
    // Current time: 10:00 AM (600 mins since midnight)
    const nowSec = BASE_MIDNIGHT + 600 * 60;
    // Scheduled: 9:58 AM (598 mins). Current code would drop it at 10:03 AM.
    // Delay: 15 mins. Predicted: 10:13 AM.
    // Cutoff: 600 - 5 = 595 mins.
    
    // BUT! If we are at 10:10 AM (610 mins).
    // Cutoff: 610 - 5 = 605 mins.
    // Scheduled time (598) < 605 -> Old code DROPS it.
    // Predicted time (598 + 15 = 613) > 605 -> New code KEEPS it.
    
    const fakeNow = BASE_MIDNIGHT + 610 * 60;
    const bin = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "test-station",
      arrivals: [
        { route: "D", dir: "N", monoMins: 598, delayStatus: 15 }
      ]
    }]);

    // Mock Date.now()
    const realDateNow = Date.now;
    Date.now = () => fakeNow * 1000;

    try {
      const result = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(result).not.toBeNull();
      expect(result!.buf[0]).toBe(1); // Should have 1 arrival
    } finally {
      Date.now = realDateNow;
    }
  });

  it("drops a train whose predicted time is too far in the past", () => {
    const fakeNow = BASE_MIDNIGHT + 610 * 60; // 10:10 AM
    // Cutoff: 605 mins.
    // Predicted: 10:04 AM (604 mins).
    const bin = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "test-station",
      arrivals: [
        { route: "D", dir: "N", monoMins: 604, delayStatus: 0 }
      ]
    }]);

    const realDateNow = Date.now;
    Date.now = () => fakeNow * 1000;

    try {
      const result = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(result).not.toBeNull();
      expect(result!.buf[0]).toBe(0); // Should be empty
    } finally {
      Date.now = realDateNow;
    }
  });

  it("correctly handles negative delays", () => {
    const fakeNow = BASE_MIDNIGHT + 610 * 60; // 10:10 AM
    // Cutoff: 605 mins.
    // Scheduled: 10:07 AM (607 mins).
    // Delay: -3 mins (predicted 10:04 AM).
    const bin = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "test-station",
      arrivals: [
        { route: "D", dir: "N", monoMins: 607, delayStatus: 253 } // 253 is -3 in s8
      ]
    }]);

    const realDateNow = Date.now;
    Date.now = () => fakeNow * 1000;

    try {
      const result = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(result).not.toBeNull();
      expect(result!.buf[0]).toBe(0); // Predicted 604 < 605, so drop
    } finally {
      Date.now = realDateNow;
    }
  });

  it("keeps an 'On Time' (130) train that is exactly at the cutoff", () => {
    const fakeNow = BASE_MIDNIGHT + 610 * 60; // 10:10 AM
    // Cutoff: 605 mins.
    const bin = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "test-station",
      arrivals: [
        { route: "D", dir: "N", monoMins: 605, delayStatus: 130 }
      ]
    }]);

    const realDateNow = Date.now;
    Date.now = () => fakeNow * 1000;

    try {
      const result = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(result).not.toBeNull();
      expect(result!.buf[0]).toBe(1);
    } finally {
      Date.now = realDateNow;
    }
  });

  it("keeps Canceled (128) and Skipped (129) trains if scheduled in future", () => {
    const fakeNow = BASE_MIDNIGHT + 610 * 60; // 10:10 AM
    // Cutoff: 605 mins.
    const bin = buildTestTemplate(BASE_MIDNIGHT, [{
      slug: "test-station",
      arrivals: [
        { route: "D", dir: "N", monoMins: 615, delayStatus: 128 },
        { route: "E", dir: "S", monoMins: 615, delayStatus: 129 }
      ]
    }]);

    const realDateNow = Date.now;
    Date.now = () => fakeNow * 1000;

    try {
      const resultD = scanArrivalsBin(bin, "test-station", [{ route: "D", dir: "N" }]);
      expect(resultD!.buf[0]).toBe(1);
      const resultE = scanArrivalsBin(bin, "test-station", [{ route: "E", dir: "S" }]);
      expect(resultE!.buf[0]).toBe(1);
    } finally {
      Date.now = realDateNow;
    }
  });
});
