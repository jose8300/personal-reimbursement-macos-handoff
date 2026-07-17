// 多步撤回 / 重做功能冒烟测试
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
// 干净起点，避免 localStorage 残留进度干扰
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

try {
  await page.goto(base, { waitUntil: 'networkidle' });

  const undoBtn = page.getByRole('button', { name: /撤回/ });
  const redoBtn = page.getByRole('button', { name: /重做/ });

  // 干净起点：无可撤回 / 重做
  assert(await undoBtn.isDisabled(), '初始（无数据）状态下「撤回」按钮禁用');
  assert(await redoBtn.isDisabled(), '初始（无数据）状态下「重做」按钮禁用');

  // 上传示例账单（导入本身也是一步可撤回操作）
  const files = ['alipay-sample.csv', 'bank-card-sample.csv', 'wechat-sample.csv']
    .map((f) => path.join(SAMPLE, f));
  await page.setInputFiles('.primary-button input[type=file]', files);
  await page.waitForSelector('.expense-row', { timeout: 15000 });
  const total = await page.locator('.expense-row').count();
  assert(total === 9, `上传并解析出 ${total} 条消费记录`);
  assert(!(await undoBtn.isDisabled()), '导入后「撤回」按钮可用（导入=第 1 步）');

  // 进入消费筛选
  await page.getByRole('button', { name: '消费筛选' }).click();
  await page.waitForTimeout(300);

  const boxes = page.locator('.company-check-box-input');
  // 标记第 1、2 行为公司消费（第 2、3 步）
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await page.waitForTimeout(200);
  let checked = await page.locator('.company-check-box-input:checked').count();
  assert(checked === 2, `标记 2 条公司消费后，勾选数为 ${checked}（共 3 步）`);

  // 键盘快捷键 Ctrl/⌘+Z 撤回一步：2 → 1
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  checked = await page.locator('.company-check-box-input:checked').count();
  assert(checked === 1, `Ctrl+Z 撤回一步后，勾选数应为 1，实际 ${checked}`);

  // 再点「撤回」一步：1 → 0
  await undoBtn.click();
  await page.waitForTimeout(200);
  checked = await page.locator('.company-check-box-input:checked').count();
  assert(checked === 0, `再撤回一步后，勾选数应为 0，实际 ${checked}`);

  // 再撤回一步 = 撤销「导入」，记录清空，撤回禁用
  await undoBtn.click();
  await page.waitForTimeout(200);
  assert(await undoBtn.isDisabled(), '撤销「导入」后「撤回」按钮禁用');
  assert(!(await redoBtn.isDisabled()), '撤销后「重做」按钮可用');

  // 重做第一步：恢复导入 → 9 条记录
  await redoBtn.click();
  await page.waitForTimeout(200);
  const afterRedo = await page.locator('.expense-row').count();
  assert(afterRedo === 9, `重做（恢复导入）后记录数应为 9，实际 ${afterRedo}`);

  // 重做第二、三步：恢复 2 条公司消费标记
  await redoBtn.click();
  await page.waitForTimeout(150);
  await redoBtn.click();
  await page.waitForTimeout(150);
  checked = await page.locator('.company-check-box-input:checked').count();
  assert(checked === 2, `重做两步后，勾选数应为 2，实际 ${checked}`);
  assert(await redoBtn.isDisabled(), '全部重做后「重做」按钮禁用');

  assert(consoleErrors.length === 0, `无控制台错误（${consoleErrors.length}）`);
  console.log('\n✅ 多步撤回/重做冒烟通过');
} catch (e) {
  console.error('\n❌ 失败:', e.message);
  if (consoleErrors.length) console.error('控制台错误:', consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
