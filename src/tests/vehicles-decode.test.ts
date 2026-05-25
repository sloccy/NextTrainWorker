import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transit_realtime } from "gtfs-realtime-bindings";
import { decodeVehiclePositions, type VehicleEvent } from "../worker/live/vehicles-decode.js";

const buf = readFileSync(join(import.meta.dirname, "fixtures/vehiclepositions.pb"));
const raw = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

function toNumber(v: number | { toNumber(): number } | null | undefined): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  return (v as { toNumber(): number }).toNumber();
}

// ── reference decode ─────────────────────────────────────────────────────────

function referenceEvents(binary: Uint8Array): VehicleEvent[] {
  const feed = transit_realtime.FeedMessage.decode(binary);
  const out: VehicleEvent[] = [];
  for (const entity of feed.entity ?? []) {
    const vp = entity.vehicle;
    if (!vp) continue;
    const tripId = vp.trip?.tripId ?? "";
    const stopId = vp.stopId ?? "";
    if (!tripId || !stopId) continue; // matches vehicles-decode.ts:54 filter
    out.push({
      tripId,
      stopId,
      status: vp.currentStatus ?? 2,
      timestamp: toNumber(vp.timestamp),
    });
  }
  return out;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("decodeVehiclePositions — parity with gtfs-realtime-bindings", () => {
  it("count matches reference (vehicles with tripId and stopId)", () => {
    const ref = referenceEvents(raw);
    const ours = decodeVehiclePositions(raw);
    expect(ours.length).toBe(ref.length);
  });

  it("tripId, stopId, status, timestamp match for every vehicle", () => {
    const ref = referenceEvents(raw);
    const ours = decodeVehiclePositions(raw);
    for (let i = 0; i < ref.length; i++) {
      expect(ours[i].tripId,    `[${i}].tripId`).toBe(ref[i].tripId);
      expect(ours[i].stopId,    `[${i}].stopId`).toBe(ref[i].stopId);
      expect(ours[i].status,    `[${i}].status`).toBe(ref[i].status);
      expect(ours[i].timestamp, `[${i}].timestamp`).toBe(ref[i].timestamp);
    }
  });

  it("no events emitted without both tripId and stopId", () => {
    const ours = decodeVehiclePositions(raw);
    for (const ev of ours) {
      expect(ev.tripId.length, "tripId must be non-empty").toBeGreaterThan(0);
      expect(ev.stopId.length, "stopId must be non-empty").toBeGreaterThan(0);
    }
  });
});
