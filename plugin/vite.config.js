import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const scenes = readdirSync(resolve(root, 'examples'))
  .filter(name => name.endsWith('.html') && !name.startsWith('_') && !['index.html', 'webcam.html'].includes(name))
  .sort().map(file => {
    const html = readFileSync(resolve(root, 'examples', file), 'utf8');
    const title = html.match(/<title>ascii-ify\s*[—–-]\s*(.*?)<\/title>/i)?.[1];
    return { id: file.slice(0, -5), name: title || file.slice(0, -5).replaceAll('-', ' '), file };
  });

export default defineConfig({
  root,
  base: './',
  plugins: [{
    name: 'plugin-scene-catalog',
    resolveId(id) { if (id === 'virtual:plugin-scenes') return '\0plugin-scenes'; },
    load(id) { if (id === '\0plugin-scenes') return `export default ${JSON.stringify(scenes)}`; },
  }],
  build: {
    outDir: 'plugin/build/web', emptyOutDir: true,
    rollupOptions: { input: [resolve(root, 'plugin/web/index.html'), ...scenes.map(s => resolve(root, 'examples', s.file))] },
  },
});
