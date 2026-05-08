# NextTrainWorker

Cloudflare Worker serving RTD Denver rail arrivals as compact binary responses to a Pebble watch app.

## Architecture

```
GitHub Actions (twice daily)
  → downloads RTD GTFS zip
  → builds binary schedule (offsets.ts, stations.ts)
  → deploys Worker with generated files bundled in

Worker cron (every minute)
  → fetches GTFS-RT TripUpdate.pb from RTD open data
  → merges with bundled schedule template
  → writes current.bin to R2

HTTP requests
  → GET /a  reads current.bin from R2, scans for station, filters by route:dir
  → GET /s  returns bundled stations.bin (station slugs + route/dir metadata)
```

**R2 bucket:** `nexttrainworker-arrivals` — holds `arrivals/current.bin` (live patch output)

**Generated files** (gitignored, rebuilt by schedule cron):
- `src/worker/generated/offsets.ts` — binary template + trip/stop offset maps
- `src/worker/generated/stations.ts` — stations binary blob

## Endpoints

### `GET /a` — Arrivals

```
GET /a?s=<station_slug>&r=<compact_route_pairs>
```

- `s` — station slug (e.g. `union_station`)
- `r` — compact route+direction string. Each pair is 2 chars: route letter + direction digit (`0`=N `1`=S `2`=E `3`=W). Concatenate pairs directly, no separator.

```bash
# Route A eastbound + Route B northbound at Union Station
curl 'https://nt.sloccy.workers.dev/a?s=union_station&r=A2B0'
```

**Response:** `application/octet-stream` binary. Layout:

```
[u8 count] × (
  [u8 route_len][route_chars...]
  [u8 dir_code]
  [u8 time_hi][u8 time_lo]   ← minutes since midnight, big-endian
  [s8 delay_status]          ← 129=skipped 130=on-time, else signed delay minutes
)
```

**Headers:**
- `X-Next-Refresh` — Unix timestamp after which fresh data is available

### `GET /s` — Stations

Returns the bundled `stations.bin` blob. Contains all station slugs with their available route/direction combos and route colours. Cached 1 hour.

```bash
curl -o stations.bin 'https://nt.sloccy.workers.dev/s'
```

### `GET /config.html` — Favourite rename UI

Browser-based UI for renaming Pebble watch favourites. Not used by the watch app directly.

## Deployment

### Prerequisites

- Cloudflare account with Workers and R2 enabled
- `CLOUDFLARE_API_TOKEN` — token with Workers Edit + R2 Edit permissions
- `CLOUDFLARE_ACCOUNT_ID` — found in the Cloudflare dashboard URL

### 1. Authenticate

```bash
npx wrangler login
```

### 2. Create R2 buckets

```bash
npx wrangler r2 bucket create nexttrainworker-arrivals
npx wrangler r2 bucket create nexttrainworker-arrivals-preview
```

Bucket names are already set in `wrangler.toml`.

### 3. Add GitHub secrets

In the repo: **Settings → Secrets and variables → Actions**, add:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### 4. Seed initial data

Trigger the schedule build workflow manually:

```bash
gh workflow run build-schedule.yml
```

Or via the GitHub Actions UI: **Actions → Build GTFS Schedule → Run workflow**.

This downloads the RTD GTFS zip, builds the binary schedule, deploys the Worker, and commits the generated files. Takes ~1 minute. Once deployed, the per-minute cron populates `arrivals/current.bin` automatically.

### 5. Verify

```bash
curl 'https://nt.sloccy.workers.dev/s' | wc -c          # stations blob
curl 'https://nt.sloccy.workers.dev/a?s=union_station&r=A2' | xxd | head
```

## Schedule rebuilds

The schedule rebuilds automatically twice daily (`0 6,18 * * *` UTC — midnight and noon MDT) via GitHub Actions. Force a rebuild:

```bash
gh workflow run build-schedule.yml
```

## Local development

Generate the required files first (downloads live GTFS data — needs internet):

```bash
npx tsx scripts/seed-schedule.ts
```

Then start the dev server:

```bash
npm run dev
```

Trigger the live refresh cron manually:

```bash
curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'
```

Note: local dev reads from the R2 preview bucket. It will be empty unless you upload `current.bin` to it manually or run the full schedule build with real credentials.

## Data sources

| Feed | URL |
|------|-----|
| Static GTFS zip | `https://www.rtd-denver.com/files/gtfs/google_transit.zip` |
| GTFS-RT TripUpdate | `https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb` |

## Tests

```bash
npm test
```

Tests live in `src/tests/` and run with Vitest.

## CI / Dependencies

- **PR CI** (`.github/workflows/pr-ci.yml`) — typecheck, lint, test on every PR
- **Dependabot** (`.github/dependabot.yml`) — daily npm + GitHub Actions updates, auto-merged when CI passes
