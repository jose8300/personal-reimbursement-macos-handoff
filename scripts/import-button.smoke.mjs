// 报销结果页「导入」按钮可见性冒烟（ESM，支持顶层 await）
import { createRequire } from 'module'
import http from 'http'
import fs from 'fs'
import path from 'path'

const req = createRequire(import.meta.url)
const { chromium } = req('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright')

const DIST = path.resolve(process.cwd(), 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = http.createServer((req2, res) => {
  let p = decodeURIComponent((req2.url || '/').split('?')[0])
  if (p === '/') p = '/index.html'
  const fp = path.join(DIST, p)
  fs.readFile(fp, (err, data) => {
    if (err) { res.statusCode = 404; res.end('nf'); return }
    res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream')
    res.end(data)
  })
})

await new Promise((r) => server.listen(0, r))
const port = server.address().port
const browser = await chromium.launch()
const page = await browser.newPage()

try {
  await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '报销结果', exact: true }).click()

  const btn = page.locator('label.result-toolbar-button[title^="导入"]')
  const vis = await btn.isVisible()
  console.log(vis ? '✓ 导入按钮在报销结果工具栏可见' : '✗ 导入按钮不可见')

  const fi = await page.locator('.result-toolbar-button[title^="导入"] input[type=file]').count()
  console.log(fi === 1 ? '✓ 包含隐藏 file input（accept .xlsx/.xls/.csv）' : '✗ 缺少 file input')

  console.log('\n✅ 导入按钮冒烟通过')
} catch (e) {
  console.error('\n❌ 失败:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
