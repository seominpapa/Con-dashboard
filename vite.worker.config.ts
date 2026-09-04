import { defineConfig } from 'vite'
import build from '@hono/vite-build/cloudflare-pages'

// Hono Worker(백엔드) 빌드 전용 설정. src/worker/index.ts -> dist/_worker.js
// 클라이언트 정적 자산(index.html, assets/*)은 vite.config.ts가 먼저 dist/에 만들어두고,
// 이 빌드는 emptyOutDir=false로 해당 파일들을 지우지 않고 _worker.js만 추가한다.
export default defineConfig({
  plugins: [
    build({
      entry: 'src/worker/index.ts',
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
  },
})
