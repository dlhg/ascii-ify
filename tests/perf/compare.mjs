import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselineDir = path.join(os.tmpdir(), `ascii-ify-baseline-${process.pid}-${Date.now()}`);

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    throw new Error(`${cmd} ${args.join(' ')} failed`);
  }
}

try {
  run('git', ['worktree', 'add', '--detach', baselineDir, 'HEAD']);
  run('npx', ['playwright', 'test', 'tests/perf/perf.spec.js'], {
    env: {
      ...process.env,
      ASCIIIFY_BASELINE_DIR: baselineDir,
      ASCIIIFY_CURRENT_PORT: process.env.ASCIIIFY_CURRENT_PORT || '5174',
      ASCIIIFY_BASELINE_PORT: process.env.ASCIIIFY_BASELINE_PORT || '5175',
    },
  });
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', baselineDir], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
}
