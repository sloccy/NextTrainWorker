import { describe, it, expect } from "vitest";
import { CsvStreamParser } from "../gtfs/csv.js";

function parseAll(text: string): Record<string, string>[] {
  const parser = new CsvStreamParser();
  return parser.push(new TextEncoder().encode(text), true);
}

describe("CsvStreamParser", () => {
  it("parses a basic CSV", () => {
    const rows = parseAll("route_id,route_type\nA,2\nB,0\n");
    expect(rows).toEqual([
      { route_id: "A", route_type: "2" },
      { route_id: "B", route_type: "0" },
    ]);
  });

  it("handles quoted fields", () => {
    const rows = parseAll('id,name\n1,"Union Station, Track 1"\n');
    expect(rows[0].name).toBe("Union Station, Track 1");
  });

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseAll('id,note\n1,"He said ""hello"""\n');
    expect(rows[0].note).toBe('He said "hello"');
  });

  it("handles CRLF line endings", () => {
    const rows = parseAll("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("accumulates partial chunks correctly", () => {
    const parser = new CsvStreamParser();
    const enc = new TextEncoder();
    // Feed header and half a line
    const r1 = parser.push(enc.encode("route_id,name\nA,Air"), false);
    expect(r1).toHaveLength(0); // incomplete line — not yet emitted
    // Complete the line
    const r2 = parser.push(enc.encode("port\n"), true);
    expect(r2).toEqual([{ route_id: "A", name: "Airport" }]);
  });
});
