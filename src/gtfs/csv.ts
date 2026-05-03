/**
 * Minimal RFC4180-aware streaming CSV parser.
 * Designed for GTFS files: no embedded newlines in fields, but quoted fields do appear.
 */
export class CsvStreamParser {
  private header: string[] = [];
  private buf = "";
  private decoder = new TextDecoder();

  push(chunk: Uint8Array, _final: boolean): Record<string, string>[] {
    this.buf += this.decoder.decode(chunk, { stream: true });
    const rows: Record<string, string>[] = [];
    let start = 0;

    while (true) {
      const nl = this.findNewline(start);
      if (nl === -1) break;
      const line = this.buf.slice(start, nl).replace(/\r$/, "");
      start = nl + 1;
      if (!line) continue;

      const fields = parseCsvLine(line);

      if (this.header.length === 0) {
        this.header = fields;
        continue;
      }

      const row: Record<string, string> = {};
      for (let i = 0; i < this.header.length; i++) {
        row[this.header[i]] = fields[i] ?? "";
      }
      rows.push(row);
    }

    this.buf = this.buf.slice(start);
    return rows;
  }

  private findNewline(start: number): number {
    let inQuote = false;
    for (let i = start; i < this.buf.length; i++) {
      const c = this.buf[i];
      if (c === '"') {
        if (inQuote && this.buf[i + 1] === '"') { i++; continue; }
        inQuote = !inQuote;
      } else if (c === "\n" && !inQuote) {
        return i;
      }
    }
    return -1;
  }
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { fields.push(""); break; }
    if (line[i] === '"') {
      let j = i + 1;
      let field = "";
      while (j < line.length) {
        if (line[j] === '"') {
          if (line[j + 1] === '"') { field += '"'; j += 2; continue; }
          j++; break;
        }
        field += line[j++];
      }
      fields.push(field);
      i = j;
      if (line[i] === ",") i++;
    } else {
      const comma = line.indexOf(",", i);
      if (comma === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, comma));
      i = comma + 1;
    }
  }
  return fields;
}
