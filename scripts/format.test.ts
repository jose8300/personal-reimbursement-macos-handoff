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

test('formatCurrency 固定两位小数', () => {
  assert.equal(formatCurrency(1234.5), '1,234.50');
});
