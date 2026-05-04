import { buildSchedule } from '../src/gtfs/schedule-build.js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const NAMESPACE_ID = process.env.SCHEDULE_KV_NAMESPACE_ID ?? 'df8cce3477aa40f3a473f618d7fcb343';
const TMP_PATH = '/tmp/nexttrainworker-schedule.json';

async function main() {
  console.log('[seed] Building schedule...');
  const schedule = await buildSchedule();
  const body = JSON.stringify(schedule);
  console.log(`[seed] Built — ${(body.length / 1024 / 1024).toFixed(1)} MB`);

  writeFileSync(TMP_PATH, body);
  try {
    console.log('[seed] Uploading schedule:current...');
    execSync(
      `npx wrangler kv key put "schedule:current" --path "${TMP_PATH}" --namespace-id "${NAMESPACE_ID}"`,
      { stdio: 'inherit' },
    );

    const version = String(schedule.generated_at);
    console.log(`[seed] Uploading schedule:version = ${version}...`);
    execSync(
      `npx wrangler kv key put "schedule:version" "${version}" --namespace-id "${NAMESPACE_ID}"`,
      { stdio: 'inherit' },
    );
  } finally {
    unlinkSync(TMP_PATH);
  }

  console.log('[seed] Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
