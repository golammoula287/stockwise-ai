require('dotenv').config();
const { spawnSync } = require('node:child_process');
const { validateTestDatabase } = require('../utils/testDatabase');

try {
  const testUrl = validateTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
