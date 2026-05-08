/**
 * CI bundle guard:
 * 1. Builds the worker with wrangler --dry-run.
 * 2. Checks raw + gzip size against limits.
 * 3. Fails if any build-only symbol leaked into the bundle.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const RAW_LIMIT = 800_000;   // Cloudflare Workers limit is 10MB uncompressed
const GZIP_LIMIT = 250_000;  // Cloudflare compresses to 1MB limit; our 140KB is well under
const BANNED_SYMBOLS = [
  "streamZipFiles",
  "CsvStreamParser",
  "inferDirections",
  "parseCalendarRow",
  "buildSchedule",
  "buildStationsBin",
];

console.log("[check] Running wrangler dry-run...");
execSync("npx wrangler deploy --dry-run --outdir dist", { stdio: "inherit" });

const bundle = readFileSync("dist/index.js");
const raw = bundle.length;
const gz = gzipSync(bundle).length;

console.log(`[check] Bundle: ${(raw / 1024).toFixed(1)}KB raw / ${(gz / 1024).toFixed(1)}KB gzip`);

if (raw > RAW_LIMIT) {
  console.error(`[check] FAIL: raw size ${raw} > limit ${RAW_LIMIT}`);
  process.exit(1);
}
if (gz > GZIP_LIMIT) {
  console.error(`[check] FAIL: gzip size ${gz} > limit ${GZIP_LIMIT}`);
  process.exit(1);
}

const bundleStr = bundle.toString();
let leaked = false;
for (const sym of BANNED_SYMBOLS) {
  if (bundleStr.includes(sym)) {
    console.error(`[check] FAIL: build-only symbol "${sym}" found in bundle`);
    leaked = true;
  }
}
if (leaked) process.exit(1);

console.log("[check] OK");
