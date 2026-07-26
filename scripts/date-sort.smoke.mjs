// 消费时间列支持正序/倒序排序冒烟测试
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright');

const DIST = path.resolve(process.cwd(), 'dist');
const SAMPLE = path.resolve(process.cwd(), 'sample-data');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.csv': 'text/csv', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(DIST, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
    res.end(data);
  });
});

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg);
  console.log('  ✓ ' + msg);
}

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

try {
  await page.goto(base, { waitUntil: 'networkidle' });

  const files = ['alipay-sample.csv', 'bank-card-sample.csv', 'wechat-sample.csv']
    .map((f) => path.join(SAMPLE, f));
  await page.setInputFiles('.primary-button input[type=file]', files);
  await page.waitForSelector('.expense-row', { timeout: 15000 });
  await page.getByRole('button', { name: '消费筛选' }).click();
  await page.waitForTimeout(300);

  const sortBtn = page.locator('th[data-column-key="dateTime"] .date-sort-button');
  assert(await sortBtn.isVisible(), '消费时间列排序按钮可见');

  async function getFirstDate() {
    return page.locator('.expense-row .table-date-input').first().inputValue();
  }
  async function getAllDates() {
    return page.locator('.expense-row .table-date-input').evaluateAll((els) =>
      els.map((el) => (el instanceof HTMLInputElement ? el.value : '')).filter(Boolean),
    );
  }

  const originalFirst = await getFirstDate();
  const dates = await getAllDates();
  assert(dates.length > 0, `读取到 ${dates.length} 条日期`);
  const sortedAsc = [...dates].sort();
  const sortedDesc = [...dates].sort().reverse();

  // 第一次点击：升序
  await sortBtn.click();
  await page.waitForTimeout(200);
  assert(await sortBtn.getAttribute('title') === '消费时间升序', '点击一次后标题为「消费时间升序」');
  const firstAsc = await getFirstDate();
  assert(firstAsc === sortedAsc[0], `升序首行日期 ${firstAsc} 应为最早 ${sortedAsc[0]}`);

  // 第二次点击：降序
  await sortBtn.click();
  await page.waitForTimeout(200);
  assert(await sortBtn.getAttribute('title') === '消费时间降序', '点击两次后标题为「消费时间降序」');
  const firstDesc = await getFirstDate();
  assert(firstDesc === sortedDesc[0], `降序首行日期 ${firstDesc} 应为最晚 ${sortedDesc[0]}`);

  // 第三次点击：恢复默认
  await sortBtn.click();
  await page.waitForTimeout(200);
  assert(await sortBtn.getAttribute('title') === '消费时间排序', '点击三次后恢复默认排序');
  const firstNone = await getFirstDate();
  assert(firstNone === originalFirst, `恢复默认后首行日期 ${firstNone} 应回到初始 ${originalFirst}`);

  assert(consoleErrors.length === 0, `无控制台错误（${consoleErrors.length}）`);
  console.log('\n✅ 消费时间排序冒烟通过');
} catch (e) {
  console.error('\n❌ 失败:', e.message);
  if (consoleErrors.length) console.error('控制台错误:', consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
