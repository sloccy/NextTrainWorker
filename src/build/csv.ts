/**
 * Minimal RFC4180-aware streaming CSV parser.
 * Designed for GTFS files: no embedded newlines in fields, but quoted fields do appear.
 */
export class CsvStreamParser {
  private header: string[] = [];
  private buf = "";
  private decoder = new TextDecoder();

  push(chunk: Uint8Array, final: boolean): Record<string, string>[] {
    this.buf += this.decoder.decode(chunk, { stream: !final });
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
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      // Fast path: no embedded escaped quotes — find closing quote directly
      const close = line.indexOf('"', j);
      if (close === -1 || line[close + 1] !== '"') {
        fields.push(close === -1 ? line.slice(j) : line.slice(j, close));
        i = close === -1 ? line.length : close + 1;
      } else {
        // Slow path: has "" escape sequences
        let field = "";
        let segStart = j;
        while (j < line.length) {
          if (line[j] === '"') {
            field += line.slice(segStart, j);
            if (line[j + 1] === '"') { field += '"'; j += 2; segStart = j; continue; }
            j++; break;
          }
          j++;
        }
        field += line.slice(segStart, j - 1);
        fields.push(field);
        i = j;
      }
      if (i < line.length && line[i] === ",") i++;
    } else {
      const comma = line.indexOf(",", i);
      if (comma === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, comma));
      i = comma + 1;
      if (i === line.length) { fields.push(""); break; } // trailing comma → empty field
    }
  }
  return fields;
}
