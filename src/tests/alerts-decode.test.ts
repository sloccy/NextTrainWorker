import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transit_realtime } from "gtfs-realtime-bindings";
import { decodeAlertFeed, type ParsedAlert } from "../worker/live/alerts-decode.js";

const buf = readFileSync(join(import.meta.dirname, "fixtures/alerts.pb"));
const raw = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

// ── reference decode ─────────────────────────────────────────────────────────

function bestText(ts: transit_realtime.ITranslatedString | null | undefined): string {
  if (!ts?.translation?.length) return "";
  const en = ts.translation.find(t => t.language === "en");
  return (en ?? ts.translation[0]).text ?? "";
}

function toNumber(v: number | { toNumber(): number } | null | undefined): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  return (v as { toNumber(): number }).toNumber();
}

interface RefAlert {
  routeIds: string[];
  routeTypes: number[];
  cause: number;
  effect: number;
  activeFrom: number;
  activeUntil: number;
  header: string;
  description: string;
}

function referenceAlerts(binary: Uint8Array): RefAlert[] {
  const feed = transit_realtime.FeedMessage.decode(binary);
  const out: RefAlert[] = [];

  for (const entity of feed.entity ?? []) {
    const a = entity.alert;
    if (!a) continue;

    // Apply same filters as buildAlertsBin: skip cause=9, skip activeFrom=0
    const firstPeriod = a.activePeriod?.[0];
    const activeFrom  = toNumber(firstPeriod?.start);
    const activeUntil = toNumber(firstPeriod?.end);
    if ((a.cause ?? 0) === 9) continue;
    if (activeFrom === 0) continue;

    const routeIds: string[] = [];
    const routeTypes: number[] = [];
    for (const sel of a.informedEntity ?? []) {
      if (sel.routeId) routeIds.push(sel.routeId);
      if (sel.routeType != null) routeTypes.push(sel.routeType);
    }

    out.push({
      routeIds,
      routeTypes,
      cause: a.cause ?? 0,
      effect: a.effect ?? 0,
      activeFrom,
      activeUntil,
      header: bestText(a.headerText).slice(0, 200),
      description: bestText(a.descriptionText).slice(0, 512),
    });
  }
  return out;
}

// ── our decode ───────────────────────────────────────────────────────────────

function filteredCustom(binary: Uint8Array): ParsedAlert[] {
  return decodeAlertFeed(binary).filter(a => a.cause !== 9 && a.activeFrom !== 0);
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("decodeAlertFeed — parity with gtfs-realtime-bindings", () => {
  it("count matches reference after applying buildAlertsBin filters", () => {
    const ref = referenceAlerts(raw);
    const ours = filteredCustom(raw);
    expect(ours.length).toBe(ref.length);
  });

  it("routeIds, cause, effect match for every alert", () => {
    const ref = referenceAlerts(raw);
    const ours = filteredCustom(raw);
    for (let i = 0; i < ref.length; i++) {
      expect(ours[i].cause,    `alert[${i}].cause`).toBe(ref[i].cause);
      expect(ours[i].effect,   `alert[${i}].effect`).toBe(ref[i].effect);
      expect([...ours[i].routeIds].sort(), `alert[${i}].routeIds`).toEqual([...ref[i].routeIds].sort());
    }
  });

  it("activeFrom/activeUntil match — only first active_period taken", () => {
    const ref = referenceAlerts(raw);
    const ours = filteredCustom(raw);
    for (let i = 0; i < ref.length; i++) {
      expect(ours[i].activeFrom,  `alert[${i}].activeFrom`).toBe(ref[i].activeFrom);
      expect(ours[i].activeUntil, `alert[${i}].activeUntil`).toBe(ref[i].activeUntil);
    }
  });

  it("header and description match (truncated to 200B / 512B, English preferred)", () => {
    const ref = referenceAlerts(raw);
    const ours = filteredCustom(raw);
    for (let i = 0; i < ref.length; i++) {
      expect(ours[i].header,      `alert[${i}].header`).toBe(ref[i].header);
      expect(ours[i].description, `alert[${i}].description`).toBe(ref[i].description);
    }
  });

  it("alerts with empty route_id are not included in routeIds", () => {
    const ours = filteredCustom(raw);
    for (const a of ours) {
      for (const rid of a.routeIds) expect(rid.length, "routeId must be non-empty").toBeGreaterThan(0);
    }
  });
});
