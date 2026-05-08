import { describe, it, expect } from "vitest";
import { decodeFeedMessage } from "../worker/live/decode.js";
import { TEMPLATE_BYTES, STOP_OFFSETS } from "../worker/generated/offsets.js";

// Pull a real trip+stop from the bundled schedule so TRIP_HASH and STOP_HASH resolve.
const [TEST_TRIP_ID, tripStops] = STOP_OFFSETS.entries().next().value as [string, ReadonlyMap<string, Uint32Array>];
const [TEST_STOP_ID, testOffsets] = tripStops.entries().next().value as [string, Uint32Array];
const BASE_MIDNIGHT = (TEMPLATE_BYTES[4] | (TEMPLATE_BYTES[5] << 8) | (TEMPLATE_BYTES[6] << 16) | (TEMPLATE_BYTES[7] << 24)) >>> 0;
const TEST_MONO_MINS = TEMPLATE_BYTES[testOffsets[0] - 2] | (TEMPLATE_BYTES[testOffsets[0] - 1] << 8);
const SCHED_EPOCH = BASE_MIDNIGHT + TEST_MONO_MINS * 60;

// ── proto builder helpers ────────────────────────────────────────────────────

function encodeVarint(n: number): number[] {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n & 0x7f);
  return out;
}

const enc = new TextEncoder();

function field_len(tag: number, bytes: number[]): number[] {
  return [...encodeVarint((tag << 3) | 2), ...encodeVarint(bytes.length), ...bytes];
}

function field_var(tag: number, val: number): number[] {
  return [...encodeVarint((tag << 3) | 0), ...encodeVarint(val)];
}

function field_str(tag: number, s: string): number[] {
  return field_len(tag, Array.from(enc.encode(s)));
}

function buildSTE(time?: number, delay?: number): number[] {
  const out: number[] = [];
  if (delay !== undefined) out.push(...field_var(1, delay));
  if (time !== undefined) out.push(...field_var(2, time));
  return out;
}

function buildSTU(stopId: string, stopSeq: number, arrivalTime?: number, stopSR = 0, arrivalDelay?: number): number[] {
  const out: number[] = [...field_var(1, stopSeq)];
  const steBytes = buildSTE(arrivalTime, arrivalDelay);
  if (steBytes.length > 0) out.push(...field_len(2, steBytes));
  out.push(...field_str(4, stopId), ...field_var(5, stopSR));
  return out;
}

function buildFeedMessage(tripId: string, stus: number[][]): Uint8Array {
  const tripDesc = [...field_str(1, tripId), ...field_var(6, 0)];
  const tu: number[] = [...field_len(1, tripDesc), ...stus.flatMap(s => field_len(2, s))];
  const entity = [...field_str(1, `test_${tripId}`), ...field_len(3, tu)];
  return new Uint8Array(field_len(2, entity));
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("decodeFeedMessage — time-based delay derivation", () => {
  it("arrival.time 5 min late → stopOverride = 5", () => {
    const buf = buildFeedMessage(TEST_TRIP_ID, [
      buildSTU(TEST_STOP_ID, 1, SCHED_EPOCH + 5 * 60),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.get(TEST_TRIP_ID)?.get(TEST_STOP_ID)).toBe(5);
  });

  it("arrival.time on-time (+30s) → stopOverride = 130 (ON-TIME sentinel)", () => {
    const buf = buildFeedMessage(TEST_TRIP_ID, [
      buildSTU(TEST_STOP_ID, 1, SCHED_EPOCH + 30),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.get(TEST_TRIP_ID)?.get(TEST_STOP_ID)).toBe(130);
  });

  it("arrival.time 3 min early → stopOverride = 0xFD (−3 as unsigned byte)", () => {
    const buf = buildFeedMessage(TEST_TRIP_ID, [
      buildSTU(TEST_STOP_ID, 1, SCHED_EPOCH - 3 * 60),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.get(TEST_TRIP_ID)?.get(TEST_STOP_ID)).toBe((-3) & 0xff);
  });

  it("arrival.time +128 min → clamps to 127", () => {
    const buf = buildFeedMessage(TEST_TRIP_ID, [
      buildSTU(TEST_STOP_ID, 1, SCHED_EPOCH + 128 * 60),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.get(TEST_TRIP_ID)?.get(TEST_STOP_ID)).toBe(127);
  });

  it("arrival.time −126 min → clamps to −125 (0x83)", () => {
    const buf = buildFeedMessage(TEST_TRIP_ID, [
      buildSTU(TEST_STOP_ID, 1, SCHED_EPOCH - 126 * 60),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.get(TEST_TRIP_ID)?.get(TEST_STOP_ID)).toBe((-125) & 0xff);
  });

  it("arrival.delay field present wins over arrival.time", () => {
    // delay=2min, time=sched+10min — delay should win
    const buf = buildFeedMessage(TEST_TRIP_ID, [
      buildSTU(TEST_STOP_ID, 1, SCHED_EPOCH + 10 * 60, 0, 2 * 60),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.get(TEST_TRIP_ID)?.get(TEST_STOP_ID)).toBe(2);
  });

  it("stop_schedule_relationship=SKIPPED → 129 regardless of time", () => {
    const buf = buildFeedMessage(TEST_TRIP_ID, [
      buildSTU(TEST_STOP_ID, 1, SCHED_EPOCH + 5 * 60, 1 /* SKIPPED */),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.get(TEST_TRIP_ID)?.get(TEST_STOP_ID)).toBe(129);
  });

  it("stop not in STOP_OFFSETS → no override emitted", () => {
    const buf = buildFeedMessage(TEST_TRIP_ID, [
      buildSTU("stop_not_in_offsets", 1, SCHED_EPOCH + 5 * 60),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.get(TEST_TRIP_ID)?.has("stop_not_in_offsets")).toBeFalsy();
  });

  it("trip not in TRIP_OFFSETS → no entries in stopOverrides", () => {
    const buf = buildFeedMessage("trip_not_in_offsets", [
      buildSTU(TEST_STOP_ID, 1, SCHED_EPOCH + 5 * 60),
    ]);
    const { stopOverrides } = decodeFeedMessage(buf);
    expect(stopOverrides.has("trip_not_in_offsets")).toBe(false);
  });
});
