# NextTrainWorker

Cloudflare Worker that serves RTD Denver rail arrivals to a Pebble watch app.

## Architecture

- Two KV namespaces: `SCHEDULE_KV` (weekly static GTFS) and `ARRIVALS_KV` (per-minute live blend)
- Two cron triggers: `* * * * *` (live refresh) and `0 4 * * 0` (static schedule refresh)
- Two HTTP endpoints: `GET /arrivals` and `GET /stations`

## Endpoints

### `GET /arrivals`

```
GET /arrivals?station=<station_slug>&routes=<route1>:<dir>,<route2>:<dir>,...
```

- `station` — a slug of the logical station name (e.g. `union_station`). The Worker expands this to all physical platform stop_ids automatically — no track knowledge needed.
- `routes` — comma-separated `route:direction` pairs. Direction is `N`, `S`, `E`, or `W`, required per route.

Example (Union Station, A Line eastbound + B and G Lines northbound — all platforms in one call):
```
curl 'https://nexttrainworker.<your-subdomain>.workers.dev/arrivals?station=union_station&routes=A:E,B:N,G:N'
```

All fields in the response are render-ready for the watch:
- `minutes_away` — pre-computed from `predicted ?? scheduled` minus `server_now`
- `display_time` — pre-formatted in America/Denver time (`3:44 PM`)
- `status_label` — human string (`"On time"`, `"Delayed 3 min"`, `"Canceled"`, etc.)
- `station_name` — human-readable name (`"Union Station"`)

### `GET /stations`

```
GET /stations
```

Discovery endpoint. Returns all stations with their available route/direction combos. Use this to build the watch app's station/route picker without hardcoding anything.

```bash
curl 'https://nexttrainworker.<your-subdomain>.workers.dev/stations'
```

Response shape:
```json
{
  "generated_at": 1730000000,
  "stations": [
    {
      "slug": "union_station",
      "name": "Union Station",
      "routes": [
        { "route": "A", "color": "#A2C617", "direction": "E", "headsign": "Denver Airport" },
        { "route": "A", "color": "#A2C617", "direction": "W", "headsign": "Wheat Ridge" },
        { "route": "B", "color": "#0080C0", "direction": "N", "headsign": "Westminster" }
      ]
    }
  ]
}
```

Cached for 1 hour (`Cache-Control: public, max-age=3600`) — only changes when the weekly schedule cron runs.

See `sample-response.json` for the full response shape.

## Deployment

### 1. Authenticate

```bash
npx wrangler login
```

### 2. Create KV namespaces

```bash
npx wrangler kv namespace create SCHEDULE_KV
npx wrangler kv namespace create SCHEDULE_KV --preview

npx wrangler kv namespace create ARRIVALS_KV
npx wrangler kv namespace create ARRIVALS_KV --preview
```

Each command prints an `id`. Copy the four IDs into `wrangler.toml`, replacing the `REPLACE_WITH_*` placeholders.

### 3. Deploy

```bash
npm run deploy
```

### 4. Verify

```bash
# Check the worker is live (returns 503 until crons have run once)
curl 'https://nexttrainworker.<your-subdomain>.workers.dev/arrivals?station=union_station&routes=A:E'
```

### 5. Force initial data population

After deploying, the schedule cron runs Sunday 4am UTC. To seed it immediately:
```bash
# Trigger via the Workers dashboard: Workers & Pages → nexttrainworker → Triggers → Test
# Or via the API:
curl -X POST "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/scripts/nexttrainworker/schedules" \
  -H "Authorization: Bearer <API_TOKEN>"
```

## Station slugs

Station slugs are derived from the GTFS parent station name at schedule-build time. To find available slugs, trigger the schedule cron once locally — the slug for any station is just its name lowercased with spaces replaced by underscores:

| Station | Slug |
|---------|------|
| Union Station | `union_station` |
| Denver Airport Station | `denver_airport_station` |
| Westminster Station | `westminster_station` |
| Peoria Station | `peoria_station` |

To discover all available slugs after deploying, you can read them from the schedule blob:
```bash
npx wrangler kv key get --binding=SCHEDULE_KV schedule:current | jq '.stations | keys'
```

## Local development

```bash
npm run dev
```

Triggers a cron manually during `wrangler dev`:
```bash
curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'         # live refresh
curl 'http://localhost:8787/__scheduled?cron=0+4+*+*+0'         # schedule refresh
```

Read a KV value locally (after cron has run):
```bash
npx wrangler kv key get --binding=ARRIVALS_KV arrivals:current
npx wrangler kv key get --binding=SCHEDULE_KV schedule:current | jq '.by_key | keys | length'
```

## Data sources

| Feed | URL |
|------|-----|
| Static GTFS zip | `https://www.rtd-denver.com/files/gtfs/google_transit.zip` |
| GTFS-RT TripUpdate | `https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb` |

> **Note:** The `open-data.rtd-denver.com` domain for GTFS-RT is the canonical post-2025 URL. The old `www.rtd-denver.com/files/gtfs-rt/` paths were retired December 5, 2025.

## Build phases completed

- [x] Phase 1: Skeleton + KV bindings + fetch handler
- [x] Phase 2: Live cron — fetch + parse GTFS-RT TripUpdate.pb, merge with schedule, write to KV
- [x] Phase 3: Fetch handler reads real KV — multi-route, per-route direction, render-ready response
- [x] Phase 4: Static schedule cron — two-pass streaming GTFS zip, direction inference from geometry, 7-day window
- [x] Phase 5: Hash-based change detection (FNV-1a) to stay under KV free-tier write quota (1,000/day)

## Tests

```bash
npm test
```

Tests live in `src/tests/` and run with vitest.
