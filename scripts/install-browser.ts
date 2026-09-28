import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(process.execPath, [resolve('node_modules/playwright/cli.js'), 'install', 'chromium'], {
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve('.local-tools/playwright') }, stdio: 'inherit', windowsHide: true,
});
process.exitCode = result.status ?? 1;
