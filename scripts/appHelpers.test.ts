import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  createMonthSelectOptions,
  dateToTime,
  getRecordReimbursementMonth,
  getRecordText,
  insertAfter,
  isAdjustedWorkday,
  isLegalHolidayDate,
  reorderItem,
  valueMatchesFilter,
} from '../src/utils/appHelpers';
import type { ExpenseRecord } from '../src/types/expense';

function makeRecord(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: 'x',
    sourceFile: 'x',
    sourcePlatform: '支付宝',
    originalRowNumber: 1,
    raw: {},
    dateTime: '2024-01-01 10:00',
    amount: 10,
    merchant: '',
    transactionType: '',
    counterparty: '',
    productName: '',
    billRemark: '',
    paymentAccount: '',
    isCompanyExpense: false,
    reimbursementMonth: '2024-01',
    reimburser: 'Musk',
    project: '',
    category: '',
    note: '',
    ...overrides,
  };
}

test('getRecordReimbursementMonth 优先用 reimbursementMonth', () => {
  assert.equal(
    getRecordReimbursementMonth(makeRecord({ reimbursementMonth: '2024-03', dateTime: '2024-01-05 10:00' })),
    '2024-03',
  );
  assert.equal(
    getRecordReimbursementMonth(makeRecord({ reimbursementMonth: '', dateTime: '2024-02-05 10:00' })),
    '2024-02',
  );
});

test('createMonthSelectOptions 生成全年 12 个月', () => {
  const opts = createMonthSelectOptions([makeRecord({ dateTime: '2024-05-01 10:00' })]);
  assert.equal(opts.length, 12);
  assert.equal(opts[0], '2024-01');
  assert.equal(opts[11], '2024-12');
});

test('valueMatchesFilter 空集合放行，include/exclude 语义', () => {
  assert.equal(valueMatchesFilter('A', { mode: 'include', values: [] }), true);
  assert.equal(valueMatchesFilter('A', { mode: 'include', values: ['A', 'B'] }), true);
  assert.equal(valueMatchesFilter('C', { mode: 'include', values: ['A', 'B'] }), false);
  assert.equal(valueMatchesFilter('C', { mode: 'exclude', values: ['A', 'B'] }), true);
  assert.equal(valueMatchesFilter('A', { mode: 'exclude', values: ['A', 'B'] }), false);
});

test('insertAfter 插入到目标之后，已存在则不重复', () => {
  assert.deepEqual(insertAfter(['a', 'b'], 'a', 'x'), ['a', 'x', 'b']);
  assert.deepEqual(insertAfter(['a', 'b'], 'z', 'x'), ['a', 'b', 'x']);
  assert.deepEqual(insertAfter(['a', 'x'], 'a', 'x'), ['a', 'x']);
});

test('reorderItem 支持 before/after 放置', () => {
  assert.deepEqual(reorderItem(['a', 'b', 'c'], 'c', 'a', 'before'), ['c', 'a', 'b']);
  assert.deepEqual(reorderItem(['a', 'b', 'c'], 'c', 'a', 'after'), ['a', 'c', 'b']);
  assert.deepEqual(reorderItem(['a', 'b'], 'a', 'a', 'after'), ['a', 'b']);
});

test('dateToTime 解析 YYYY-MM-DD，非法返回 NaN', () => {
  assert.equal(dateToTime('2024-01-01'), new Date(2024, 0, 1).getTime());
  assert.ok(Number.isNaN(dateToTime('bad')));
});

test('addDays 跨月进位，非法返回空串', () => {
  assert.equal(addDays('2024-01-31', 1), '2024-02-01');
  assert.equal(addDays('bad', 1), '');
});

test('getRecordText 拼接非空字段并转小写', () => {
  assert.equal(getRecordText(makeRecord({ merchant: '滴滴', note: '出差' })), '滴滴 出差');
});

test('isLegalHolidayDate / isAdjustedWorkday 基于节假日窗口返回布尔', () => {
  assert.equal(typeof isLegalHolidayDate('2024-01-01'), 'boolean');
  assert.equal(typeof isAdjustedWorkday('2024-01-01'), 'boolean');
});
