import { describe, it, expect } from "vitest";
import { buildAlertsBin, scanAlertsSummaryBytes, scanAlertsByRouteBytes } from "../worker/binary/alerts.js";
import type { ParsedAlert } from "../worker/live/alerts-decode.js";

// Use real GTFS route IDs (keys of ROUTE_ID_TO_SHORT_NAME), not short names.
const ROUTE_A = "A";       // "A" → "A" (direct)
const ROUTE_B = "113B";    // "113B" → "B"
const ROUTE_G = "113G";    // "113G" → "G"
const ROUTE_C = "101C";    // "101C" → "C"
const ROUTE_E = "101E";    // "101E" → "E"

function makeAlert(routeId: string, overrides?: Partial<ParsedAlert>): ParsedAlert {
  return {
    routeIds: routeId ? [routeId] : [],
    routeTypes: [],
    cause: 1,
    effect: 1,
    activeFrom: 1700000000,
    activeUntil: 1700003600,
    header: "Test",
    description: "Test description",
    ...overrides,
  };
}

describe("buildAlertsBin / scanAlerts* — count/body consistency", () => {
  it("bucket with >255 alerts: count byte capped, exactly 255 records written and parsed", () => {
    const alerts: ParsedAlert[] = [];
    for (let i = 0; i < 300; i++) alerts.push(makeAlert(ROUTE_A, { header: `Alert ${i}` }));

    const bin = buildAlertsBin(alerts, 1700000000);

    // summary: should show route "A" with alertCount=255
    const summary = scanAlertsSummaryBytes(bin);
    expect(summary).not.toBeNull();
    // summary format: [u8 routeCount][per route: u8 nameLen][name][u8 alertCount]
    expect(summary![0]).toBe(1);     // 1 route
    expect(summary![1]).toBe(1);     // name_len = 1 ("A")
    expect(summary![2]).toBe(65);    // 'A'
    expect(summary![3]).toBe(255);   // alert_count capped at 255

    // detail: should return exactly 255 records
    const detail = scanAlertsByRouteBytes(bin, "A");
    expect(detail).not.toBeNull();
    expect(detail![0]).toBe(255);
  });

  it("two routes: first route with 256 alerts does not corrupt second route's parsing", () => {
    const alerts: ParsedAlert[] = [];
    for (let i = 0; i < 256; i++) alerts.push(makeAlert(ROUTE_B));
    alerts.push(makeAlert(ROUTE_G, { header: "G alert", activeFrom: 1700001000 }));

    const bin = buildAlertsBin(alerts, 1700000000);

    const summaryB = scanAlertsByRouteBytes(bin, "B");
    expect(summaryB).not.toBeNull();
    expect(summaryB![0]).toBe(255);

    const summaryG = scanAlertsByRouteBytes(bin, "G");
    expect(summaryG).not.toBeNull();
    expect(summaryG![0]).toBe(1);
    // verify activeFrom field of the G alert is intact
    const activeFrom = (summaryG![1] | (summaryG![2] << 8) | (summaryG![3] << 16) | (summaryG![4] << 24)) >>> 0;
    expect(activeFrom).toBe(1700001000);
  });

  it("normal bucket (< 255 alerts) is unaffected", () => {
    const alerts = [makeAlert(ROUTE_C), makeAlert(ROUTE_C), makeAlert(ROUTE_E)];
    const bin = buildAlertsBin(alerts, 1700000000);

    const c = scanAlertsByRouteBytes(bin, "C");
    const e = scanAlertsByRouteBytes(bin, "E");
    expect(c).not.toBeNull();
    expect(c![0]).toBe(2);
    expect(e).not.toBeNull();
    expect(e![0]).toBe(1);
  });

  it("wildcard (no routeId, rail routeType) alert fans out to all known rail routes", () => {
    const wildcard = makeAlert("", { routeIds: [], routeTypes: [0] });
    const bin = buildAlertsBin([wildcard], 1700000000);

    // "A" line is in ROUTE_ID_TO_SHORT_NAME → should have 1 alert
    const aDetail = scanAlertsByRouteBytes(bin, "A");
    expect(aDetail).not.toBeNull();
    expect(aDetail![0]).toBe(1);
  });
});
