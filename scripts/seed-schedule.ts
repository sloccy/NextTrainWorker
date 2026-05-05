import { buildSchedule } from '../src/gtfs/schedule-build.js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const NAMESPACE_ID = process.env.SCHEDULE_KV_NAMESPACE_ID ?? 'df8cce3477aa40f3a473f618d7fcb343';
const TMP_PATH = '/tmp/nexttrainworker-schedule.json';

async function main() {
  console.log('[seed] Building schedule...');
  const { generatedAt, baselineBin, stationsBin } = await buildSchedule();
  console.log(`[seed] Built — baseline=${(baselineBin.length / 1024).toFixed(1)} KB, stations=${(stationsBin.length / 1024).toFixed(1)} KB`);

  try {
    console.log('[seed] Uploading baseline:bin...');
    writeFileSync(TMP_PATH, baselineBin);
    execSync(
      `npx wrangler kv key put "baseline:bin" --path "${TMP_PATH}" --namespace-id "${NAMESPACE_ID}"`,
      { stdio: 'inherit' },
    );

    console.log('[seed] Uploading stations:bin...');
    writeFileSync(TMP_PATH, stationsBin);
    execSync(
      `npx wrangler kv key put "stations:bin" --path "${TMP_PATH}" --namespace-id "${NAMESPACE_ID}"`,
      { stdio: 'inherit' },
    );

    const version = String(generatedAt);
    console.log(`[seed] Uploading schedule:version = ${version}...`);
    execSync(
      `npx wrangler kv key put "schedule:version" "${version}" --namespace-id "${NAMESPACE_ID}"`,
      { stdio: 'inherit' },
    );
  } finally {
    if (require('fs').existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  }

  console.log('[seed] Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
