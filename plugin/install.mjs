// Builds the plugin and installs it into ~/Library/Audio/Plug-Ins/VST3 for testing in
// Live. Skips tests and validation; `npm run build:plugin` runs those.
//
//   node plugin/install.mjs              build and install
//   node plugin/install.mjs --if-changed only when sources changed since the last install
//   node plugin/install.mjs --hook       as --if-changed, reporting as a Claude Code hook
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hook = process.argv.includes('--hook');
const ifChanged = hook || process.argv.includes('--if-changed');
const stamp = join(root, 'plugin/build/.installed');
const built = join(root, 'plugin/build/native/VST3/Release/ASCII Visuals.vst3');
const target = join(homedir(), 'Library/Audio/Plug-Ins/VST3/ASCII Visuals.vst3');
// Everything bundled into the plugin: native code and the web UI with its scenes.
const inputs = ['plugin/native', 'plugin/web', 'plugin/CMakeLists.txt', 'plugin/version.json', 'plugin/vite.config.js', 'examples', 'src'];

function report(message, ok = true) {
  if (hook) console.log(JSON.stringify({ systemMessage: message }));
  else (ok ? console.log : console.error)(message);
  if (!ok && !hook) process.exit(1);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: hook ? 'pipe' : 'inherit' });
  if (result.status === 0) return;
  const tail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n');
  throw new Error(`${command} ${args[0]} failed${result.error ? `: ${result.error.message}` : ''}${tail ? `\n${tail}` : ''}`);
}
function sourceHash() {
  const files = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', ...inputs], { cwd: root, encoding: 'utf8' });
  if (files.status !== 0) throw new Error('git ls-files failed');
  const hash = createHash('sha256');
  for (const file of files.stdout.split('\0').filter(Boolean).sort()) {
    hash.update(file).update('\0');
    if (existsSync(join(root, file))) hash.update(readFileSync(join(root, file)));
  }
  return hash.digest('hex');
}
function findCmake() {
  const candidates = [process.env.CMAKE, 'cmake', '/opt/homebrew/bin/cmake', '/usr/local/bin/cmake',
    '/private/tmp/ascii-ify-build-tools/lib/python3.14/site-packages/cmake/data/bin/cmake'];
  const found = candidates.find(c => c && spawnSync(c, ['--version']).status === 0);
  if (!found) throw new Error('cmake not found. Install it (brew install cmake) or set CMAKE.');
  return found;
}

try {
  if (process.platform !== 'darwin') throw new Error('The plugin builds on macOS only.');
  const hash = sourceHash();
  if (ifChanged && existsSync(stamp) && readFileSync(stamp, 'utf8') === hash && existsSync(target)) process.exit(0);
  const cmake = findCmake();
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'plugin/vite.config.js', '--logLevel', 'warn']);
  run(cmake, ['-S', 'plugin', '-B', 'plugin/build/native', '-DCMAKE_BUILD_TYPE=Release',
    `-DCMAKE_OSX_ARCHITECTURES=${process.env.ASCII_PLUGIN_ARCHS || 'arm64'}`]);
  run(cmake, ['--build', 'plugin/build/native', '--target', 'AsciiVisuals', '--parallel', '6']);
  // Copy beside the old bundle, then swap, so a running Live never sees a half-copied plugin.
  const next = `${target}.new`;
  rmSync(next, { recursive: true, force: true });
  run('ditto', [built, next]);
  rmSync(target, { recursive: true, force: true });
  renameSync(next, target);
  writeFileSync(stamp, hash);
  const { version } = JSON.parse(readFileSync(join(root, 'plugin/version.json'), 'utf8'));
  const live = spawnSync('pgrep', ['-x', 'Live']).status === 0;
  report(`ASCII Visuals ${version} installed.${live ? ' Quit and reopen Live to load it.' : ''}`);
} catch (error) {
  report(`ASCII Visuals install failed: ${error.message}`, false);
}
