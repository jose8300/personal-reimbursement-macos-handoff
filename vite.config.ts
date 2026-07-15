import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 读取 package.json 的 version 作为应用版本号
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
)

// 构建时间精确到分钟，用于页面底部展示「更新时间」
const buildTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date())

// https://vite.dev/config/
export default defineConfig({
  // 相对路径 base：同一份构建既能在本地根路径预览，也能在 GitHub Pages 项目子路径下正确加载资源
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_TIME__: JSON.stringify(buildTime.replace(/\//g, '-')),
  },
  build: {
    // 把体积大且相对稳定的依赖拆成独立 chunk，避免单个 1.7MB 包并消除分块警告
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@e965/xlsx') || id.includes('exceljs') || id.includes('/xlsx/')) return 'sheet';
            if (id.includes('papaparse')) return 'papaparse';
            if (
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react/') ||
              id.includes('node_modules/scheduler')
            ) return 'react-vendor';
            if (
              id.includes('@radix-ui') ||
              id.includes('@floating-ui') ||
              id.includes('lucide-react') ||
              id.includes('sonner')
            ) return 'ui';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
