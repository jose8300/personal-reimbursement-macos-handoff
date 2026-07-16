// 批量替换功能冒烟测试
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
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

try {
  await page.goto(base, { waitUntil: 'networkidle' });

  // 上传示例账单
  const files = ['alipay-sample.csv', 'bank-card-sample.csv', 'wechat-sample.csv']
    .map((f) => path.join(SAMPLE, f));
  await page.setInputFiles('.primary-button input[type=file]', files);

  // 等待解析出消费记录
  await page.waitForSelector('.expense-row', { timeout: 15000 });
  const expenseRows = await page.locator('.expense-row').count();
  assert(expenseRows > 0, `上传并解析出 ${expenseRows} 条消费记录`);

  // 进入消费筛选，全选标记为公司消费
  await page.getByRole('button', { name: '消费筛选' }).click();
  await page.getByRole('button', { name: '全选', exact: true }).click();
  await page.waitForTimeout(300);

  // 打开「批量替换」Popover
  const btn = page.getByRole('button', { name: /批量替换/ }).first();
  const btnEnabled = await btn.isEnabled();
  assert(btnEnabled, '「批量替换」按钮可用（已有公司消费记录）');
  await btn.click();
  await page.waitForSelector('.batch-replace-menu', { timeout: 5000 });
  assert(true, '批量替换 Popover 已打开');

  // 选择列 → 留空查找（直接覆写）→ 填替换值 → 执行
  await page.selectOption('.batch-replace-field select', 'productName');
  // 查找留空 = 直接覆写
  await page.locator('.batch-replace-field input').nth(1).fill('交通出行');
  await page.getByRole('button', { name: '执行替换' }).click();
  await page.waitForTimeout(300);

  // 验证：表格中出现了 "交通出行"
  const hasNew = await page.locator(`text=交通出行`).count();
  assert(hasNew >= 1, `覆写后 "交通出行" 出现在表格中（${hasNew} 处）`);

  // 控制台无错误
  assert(consoleErrors.length === 0, `运行期间无控制台错误（捕获 ${consoleErrors.length} 条）`);

  console.log('\n✅ 批量替换 冒烟测试通过');
} catch (e) {
  console.error('\n❌ 冒烟测试失败:', e.message);
  if (consoleErrors.length) console.error('控制台错误:', consoleErrors.slice(0, 5));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
