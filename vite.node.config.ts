import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/server/index.ts',
    target: 'node24',
    outDir: 'dist/server',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'index.js' } },
  },
})
