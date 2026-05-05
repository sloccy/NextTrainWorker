# NextTrainWorker

Cloudflare Worker that serves RTD Denver rail arrivals to a Pebble watch app.

## Architecture

- **KV namespace**: `SCHEDULE_KV` (legacy/minimal data)
- **R2 bucket**: `nexttrainworker-arrivals` (serves `current.bin` and `stations.bin`)
- **Baseline bundling**: The static schedule is bundled into the worker as a generated binary blob (`src/baseline.generated.ts`).
- **GitHub Actions**: Builds the static schedule every 12h, uploads `stations.bin` to R2, and deploys the worker with the updated baseline.
- **One Worker cron** (`* * * * *`): fetches GTFS-RT, merges with bundled baseline, writes `current.bin` to R2.
- **Two HTTP endpoints**: `GET /a` (arrivals) and `GET /s` (stations).

## Endpoints

### `GET /arrivals`

```
GET /arrivals?station=<station_slug>&routes=<route1>:<dir>,<route2>:<dir>,...
```

- `station` — station slug (e.g. `union_station`). Automatically expands to all platform stop IDs.
- `routes` — comma-separated `route:direction` pairs. Direction is `N`, `S`, `E`, or `W`.

```bash
curl 'https://nexttrainworker.sloccy.workers.dev/arrivals?station=union_station&routes=A:E,B:N,G:N'
```

Response fields are render-ready for the watch: `t` (display time in America/Denver), `s` (status), `l` (human label).

### `GET /stations`

Discovery endpoint — returns all stations with available route/direction combos.

```bash
curl 'https://nexttrainworker.sloccy.workers.dev/stations'
```

Cached for 1 hour. Only changes when the weekly schedule runs.

See `sample-response.json` for the full response shape.

## Deployment

### 1. Authenticate with Cloudflare

```bash
npx wrangler login
```

### 2. Create KV namespace and R2 bucket

```bash
npx wrangler kv namespace create SCHEDULE_KV
npx wrangler kv namespace create SCHEDULE_KV --preview
npx wrangler r2 bucket create nexttrainworker-arrivals
npx wrangler r2 bucket create nexttrainworker-arrivals-preview
```

Copy the KV namespace IDs into `wrangler.toml`. The R2 bucket names are already set in `wrangler.toml`.

### 3. Deploy the Worker

```bash
npm run deploy
```

### 4. Set up GitHub Actions for schedule builds

The static schedule is built by GitHub Actions (not the Worker) to avoid Cloudflare's free-tier CPU limit.

1. Push this repo to GitHub
2. Create a Cloudflare API token at **dash.cloudflare.com/profile/api-tokens** with permission: `Account → Workers KV Storage → Edit`
3. Add it as a GitHub repo secret named `CLOUDFLARE_API_TOKEN`

### 5. Seed initial data

Trigger the workflow manually — it runs the full schedule build, uploads `stations.bin` to R2, and deploys the worker with the new baseline:

```bash
gh workflow run build-schedule.yml --repo <your-username>/NextTrainWorker
```

Or trigger it from the GitHub Actions UI: **Actions → Build GTFS Schedule → Run workflow**.

After it completes (~1 min), the Worker's per-minute cron will start populating the R2 `arrivals/current.bin` file automatically.

### 6. Verify

```bash
curl 'https://nexttrainworker.sloccy.workers.dev/stations'
curl 'https://nexttrainworker.sloccy.workers.dev/arrivals?station=union_station&routes=A:E'
```

## Schedule rebuilds

The schedule rebuilds automatically every Sunday at 4am UTC via GitHub Actions. To force a rebuild at any time:

```bash
gh workflow run build-schedule.yml --repo <your-username>/NextTrainWorker
```

## Local development

```bash
npm run dev
```

### Initial setup (Typecheck)

Because the baseline schedule is generated and ignored by git, you must generate it once locally for typechecking and local execution to work:

```bash
npx tsx scripts/seed-schedule.ts --skip-r2
```

### Triggering live refresh

Trigger the live refresh cron manually during `wrangler dev`:

```bash
curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'
```

Read stored values locally:

```bash
npx wrangler r2 object get nexttrainworker-arrivals-preview arrivals/current.json --pipe | jq '.generated_at, (.data | length)'
npx wrangler kv key get --binding=SCHEDULE_KV schedule:current | jq '.stations | keys'
```

## Data sources

| Feed | URL |
|------|-----|
| Static GTFS zip | `https://www.rtd-denver.com/files/gtfs/google_transit.zip` |
| GTFS-RT TripUpdate | `https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb` |

## Tests

```bash
npm test
```

Tests live in `src/tests/` and run with vitest.
