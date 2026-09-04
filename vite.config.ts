import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// React SPA(client) 빌드 전용 설정. index.html -> src/client/main.tsx 를 dist/ 로 빌드한다.
// Worker(백엔드) 빌드는 vite.worker.config.ts 에서 별도로 수행하며,
// package.json의 build 스크립트가 두 빌드를 순서대로 실행해 같은 dist/ 에 합친다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
