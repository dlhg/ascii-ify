import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.platform !== 'darwin') throw new Error('This prototype currently builds on macOS only.');
const cmake = process.env.CMAKE || 'cmake';
run(cmake, ['--version']);
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'plugin/vite.config.js']);
const configure = ['-S', 'plugin', '-B', 'plugin/build/native', '-DCMAKE_BUILD_TYPE=Release',
  `-DCMAKE_OSX_ARCHITECTURES=${process.env.ASCII_PLUGIN_ARCHS || 'arm64'}`];
if (process.env.VST3_SDK_ROOT) configure.push(`-DVST3_SDK_ROOT=${process.env.VST3_SDK_ROOT}`);
if (process.env.LINK_ROOT) configure.push(`-DLINK_ROOT=${process.env.LINK_ROOT}`);
run(cmake, configure);
run(cmake, ['--build', 'plugin/build/native', '--parallel', '6']);
run(cmake, ['--build', 'plugin/build/native', '--target', 'test']);
run('plugin/build/native/bin/Release/validator', ['plugin/build/native/VST3/Release/ASCII Visuals.vst3']);
console.log('\nBuilt and validated: plugin/build/native/VST3/Release/ASCII Visuals.vst3');
