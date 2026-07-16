// 报销结果 tab 全选/反选/批量删除 浏览器冒烟测试
// 启动静态服务器托管 dist，上传示例 CSV，全选筛入 -> 报销结果，验证选择交互。
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
console.log('静态服务器已启动:', base);

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

try {
  await page.goto(base, { waitUntil: 'networkidle' });

  // 1) 上传示例账单
  const files = ['alipay-sample.csv', 'bank-card-sample.csv', 'wechat-sample.csv']
    .map((f) => path.join(SAMPLE, f));
  await page.setInputFiles('.primary-button input[type=file]', files);

  // 2) 等待解析出消费记录
  await page.waitForSelector('.expense-row', { timeout: 15000 });
  const expenseRows = await page.locator('.expense-row').count();
  assert(expenseRows > 0, `上传并解析出 ${expenseRows} 条消费记录`);

  // 3) 进入消费筛选，全选标记为公司消费
  await page.getByRole('button', { name: '消费筛选' }).click();
  await page.getByRole('button', { name: '全选', exact: true }).click();
  await page.waitForTimeout(300);

  // 4) 进入报销结果
  await page.getByRole('button', { name: '报销结果' }).click();
  await page.waitForSelector('.result-row-checkbox', { timeout: 10000 });
  const total = await page.locator('.result-row-checkbox').count();
  assert(total > 0, `报销结果渲染出 ${total} 行（含行级勾选框）`);

  // 5) Shift+点击：首行 -> 末行 连续全选（类 Excel 区域选择）
  await page.locator('.result-row-checkbox').nth(0).click();
  await page.locator('.result-row-checkbox').nth(total - 1).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(150);
  let rc = await page.locator('.result-row-checkbox:checked').count();
  assert(rc === total, `Shift+点击首末行 -> 连续选中全部 ${rc}/${total}`);

  // 6) Shift+方向键：从首行向下扩展选区
  await page.getByRole('button', { name: '反选', exact: true }).click();
  await page.waitForTimeout(120);
  await page.locator('.result-row-checkbox').nth(0).click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(120);
  rc = await page.locator('.result-row-checkbox:checked').count();
  assert(rc === 2, `Shift+↓ 从首行向下扩展 -> 选中 2 行（实际 ${rc}）`);
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(120);
  rc = await page.locator('.result-row-checkbox:checked').count();
  assert(rc === 3, `再次 Shift+↓ -> 选中 3 行（实际 ${rc}）`);

  // 7) 普通方向键仅移动焦点、不改选区
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  rc = await page.locator('.result-row-checkbox:checked').count();
  assert(rc === 3, `普通 ↑ 仅移动焦点、选区保持 3 行（实际 ${rc}）`);

  // 8) 全选
  await page.getByRole('button', { name: '全选', exact: true }).click();
  await page.waitForTimeout(150);
  let checked = await page.locator('.result-row-checkbox:checked').count();
  assert(checked === total, `点击「全选」后 ${checked}/${total} 行被勾选`);

  // 9) 反选
  await page.getByRole('button', { name: '反选', exact: true }).click();
  await page.waitForTimeout(150);
  checked = await page.locator('.result-row-checkbox:checked').count();
  assert(checked === 0, `点击「反选」后勾选数归零（实际 ${checked}）`);

  // 10) 勾选单行 -> 删除选中 可用
  await page.locator('.result-row-checkbox').first().check();
  await page.waitForTimeout(150);
  checked = await page.locator('.result-row-checkbox:checked').count();
  assert(checked === 1, '勾选单行后勾选数为 1');
  const delDisabled = await page.getByRole('button', { name: /删除选中/ }).isDisabled();
  assert(!delDisabled, '勾选后「删除选中」按钮可用');

  // 11) 删除选中 -> 行数减少
  await page.getByRole('button', { name: /删除选中/ }).click();
  await page.waitForTimeout(300);
  const after = await page.locator('.result-row-checkbox').count();
  assert(after === total - 1, `点击「删除选中」后行数 ${total} -> ${after}`);

  // 9) 控制台无错误
  assert(consoleErrors.length === 0, `运行期间无控制台错误（捕获 ${consoleErrors.length} 条）`);
  if (consoleErrors.length) console.log('    控制台错误样本:', consoleErrors.slice(0, 3));

  console.log('\n✅ 报销结果 全选/反选/批量删除 冒烟测试通过');
} catch (e) {
  console.error('\n❌ 冒烟测试失败:', e.message);
  if (consoleErrors.length) console.error('控制台错误:', consoleErrors.slice(0, 5));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
