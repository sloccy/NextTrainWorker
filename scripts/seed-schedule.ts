import { buildSchedule } from '../src/gtfs/schedule-build.js';

const ACCOUNT_ID   = process.env.CLOUDFLARE_ACCOUNT_ID   ?? 'e1d75be504abde68ca88d6a879201756';
const API_TOKEN    = process.env.CLOUDFLARE_API_TOKEN!;
const NAMESPACE_ID = process.env.SCHEDULE_KV_NAMESPACE_ID ?? 'df8cce3477aa40f3a473f618d7fcb343';

async function main() {
  if (!API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is required');

  console.log('[seed] Building schedule...');
  const schedule = await buildSchedule();
  const body = JSON.stringify(schedule);
  console.log(`[seed] Built — ${(body.length / 1024 / 1024).toFixed(1)} MB`);

  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`
            + `/storage/kv/namespaces/${NAMESPACE_ID}/values/schedule%3Acurrent`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body,
  });

  const json = await res.json() as { success: boolean; errors: unknown[] };
  if (!json.success) throw new Error(`KV upload failed: ${JSON.stringify(json.errors)}`);

  console.log('[seed] Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
