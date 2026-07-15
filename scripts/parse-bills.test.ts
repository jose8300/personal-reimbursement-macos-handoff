import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBillFiles } from '../src/utils/parseBills';

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

// 支付宝真实导出风格：前导注释行 + CRLF 行尾 + 全角括号金额列
const alipayCsv = [
  '# 支付宝交易明细查询',
  '# 导出时间：[2025-01-01 00:00:00]',
  '# 账号：[123****4567]',
  '交易时间,交易分类,交易对方,商品说明,收/付款方式,金额（元）,收/支',
  '2024-01-05 10:00:00,数码产品,Apple,MacBook Pro,余额宝,9999.00,支出',
  '2024-01-06 12:00:00,餐饮,麦当劳,麦辣鸡腿堡套餐,花呗,35.00,支出',
  '2024-01-07 09:00:00,退款,某商户,订单退款,余额,0.00,退款',
].join('\r\n');

test('支付宝 CSV：CRLF + 前导注释下正确解析，且跳过 0 元退款', async () => {
  const { records, summaries } = await parseBillFiles([makeFile('支付宝交易明细.csv', alipayCsv)]);
  assert.equal(summaries[0].platform, '支付宝');
  assert.equal(summaries[0].imported, 2);
  assert.equal(records.length, 2);

  assert.equal(records[0].amount, 9999);
  assert.equal(records[0].merchant, 'MacBook Pro');
  assert.equal(records[0].paymentAccount, '余额宝');
  assert.equal(records[1].amount, 35);

  // CRLF 已被剥离，未因分隔符检测失败而合并成单列
  assert.ok(!records[0].merchant.includes('\r'));
  assert.ok(!records[0].paymentAccount.includes('\r'));
});

test('支付宝 CSV：无文件名提示时仍能按表头识别平台', async () => {
  const { summaries } = await parseBillFiles([makeFile('账单明细.csv', alipayCsv)]);
  assert.equal(summaries[0].platform, '支付宝');
});

const wechatCsv = [
  '交易时间,交易类型,交易对方,商品,收/付款方式,交易金额(元),当前状态',
  '2024-02-01 11:00:00,商户消费,星巴克,拿铁,零钱,42.00,支付成功',
].join('\r\n');

test('微信 CSV：字段映射正确（商品/收付款方式）', async () => {
  const { records, summaries } = await parseBillFiles([makeFile('微信支付明细.csv', wechatCsv)]);
  assert.equal(summaries[0].platform, '微信');
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 42);
  assert.equal(records[0].merchant, '拿铁');
  assert.equal(records[0].paymentAccount, '零钱');
});

test('收入/退款行被跳过', async () => {
  const csv = [
    '交易时间,交易分类,交易对方,商品说明,收/付款方式,金额（元）,收/支',
    '2024-03-01 10:00:00,餐饮,饭店,午餐,余额,88.00,支出',
    '2024-03-02 10:00:00,退款,饭店,退款,余额,88.00,退款',
  ].join('\r\n');
  const { records } = await parseBillFiles([makeFile('支付宝交易明细.csv', csv)]);
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 88);
});

test('0 元冲正行被跳过（金额缺失视为无效）', async () => {
  const csv = [
    '交易时间,交易分类,交易对方,商品说明,收/付款方式,金额（元）,收/支',
    '2024-03-01 10:00:00,其他,商户,0元冲正,余额,0.00,支出',
  ].join('\r\n');
  const { records } = await parseBillFiles([makeFile('支付宝交易明细.csv', csv)]);
  assert.equal(records.length, 0);
});
