import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency,
  getDateOnly,
  getMonth,
  getWeekdayLabel,
  normalizeDateInput,
  parseAmount,
} from '../src/utils/format';

test('parseAmount 去除货币符号、千分位与空格', () => {
  assert.equal(parseAmount('¥1,234.50'), 1234.5);
  assert.equal(parseAmount('￥2,000'), 2000);
  assert.equal(parseAmount('100 元'), 100);
});

test('parseAmount 括号金额取绝对值', () => {
  assert.equal(parseAmount('(100)'), 100);
  assert.equal(parseAmount(' -50 '), 50);
});

test('parseAmount 无数字返回 0', () => {
  assert.equal(parseAmount('无金额'), 0);
  assert.equal(parseAmount(''), 0);
});

test('getWeekdayLabel 返回正确的中文星期', () => {
  assert.equal(getWeekdayLabel('2024-01-01 10:00'), '周一'); // 2024-01-01 是周一
  assert.equal(getWeekdayLabel('2024-01-06 10:00'), '周六');
  assert.equal(getWeekdayLabel('2024-01-07 10:00'), '周日');
});

test('getMonth 提取 YYYY-MM', () => {
  assert.equal(getMonth('2024-01-15 10:00'), '2024-01');
  assert.equal(getMonth('2024/03/02'), '2024-03');
});

test('getDateOnly 统一为 YYYY-MM-DD 短横线', () => {
  assert.equal(getDateOnly('2024/03/02 08:30'), '2024-03-02');
});

test('normalizeDateInput 处理 Date/Excel序列/字符串', () => {
  // toISOString 为 UTC，稳定不受时区影响
  assert.equal(normalizeDateInput(new Date(Date.UTC(2024, 0, 1))), '2024-01-01 00:00:00');
  assert.equal(normalizeDateInput('2024-01-01'), '2024-01-01');
  assert.equal(typeof normalizeDateInput(45000), 'string');
});

test('normalizeDateInput 解析支付宝 MM/DD/YY HH:mm 格式', () => {
  // 支付宝导出的日期格式（2位数年份+斜杠分隔）
  assert.equal(normalizeDateInput('12/31/24 10:15'), '2024-12-31 10:15:00');
  assert.equal(normalizeDateInput('12/31/24 0:14'), '2024-12-31 00:14:00');
  assert.equal(normalizeDateInput('01/15/25 09:30'), '2025-01-15 09:30:00');
  // 4位年份也能处理
  assert.equal(normalizeDateInput('06/20/2024'), '2024-06-20 00:00:00');
});

test('getWeekdayLabel 支持支付宝日期格式', () => {
  // 2024-12-31 是周二 — 这是之前不显示星期的根因
  assert.equal(getWeekdayLabel('12/31/24 10:15'), '周二');
  assert.equal(getWeekdayLabel('01/01/25 00:00'), '周三'); // 2025-01-01 是周三
});

test('formatCurrency 固定两位小数', () => {
  assert.equal(formatCurrency(1234.5), '1,234.50');
});
