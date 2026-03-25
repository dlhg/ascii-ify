import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  root: mode === 'development' ? '.' : '.',
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'AsciiIfy',
      formats: ['es', 'cjs'],
      fileName: (format) => `ascii-ify.${format === 'es' ? 'js' : 'cjs'}`,
    },
    sourcemap: true,
    minify: 'esbuild',
  },
}));
