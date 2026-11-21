import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function resolveAppVersion(): string {
  const envVersion = process.env.VITE_APP_VERSION?.trim();
  if (envVersion) {
    return /^v/i.test(envVersion) ? `V${envVersion.slice(1)}` : `V${envVersion}`;
  }

  let major = 1;
  let minor = 0;
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'version.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Number.isInteger(parsed.major) && parsed.major >= 0) major = parsed.major;
    if (Number.isInteger(parsed.minor) && parsed.minor >= 0) minor = parsed.minor;
  } catch {
    // Fallback to V1.0 if version.json is missing
  }

  let commitDelta = 0;
  try {
    const anchorHash = execSync('git log -n 1 --format=%H -- version.json', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();

    if (anchorHash) {
      const countStr = execSync(`git rev-list --count ${anchorHash}..HEAD`, {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
      const parsedCount = parseInt(countStr, 10);
      if (!Number.isNaN(parsedCount) && parsedCount >= 0) {
        commitDelta = parsedCount;
      }
    }
  } catch {
    // Non-git environment (e.g. preview sandbox) uses base version from version.json
  }

  return `V${major}.${minor + commitDelta}`;
}

export default defineConfig(() => {
  const appVersion = resolveAppVersion();
  const buildTime = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_TIME__: JSON.stringify(buildTime),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
