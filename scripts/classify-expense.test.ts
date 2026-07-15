import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyExpenseRecord, fillMissingClassification } from '../src/utils/classifyExpense';
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

test('滴滴 -> 交通/差旅', () => {
  assert.deepEqual(classifyExpenseRecord(makeRecord({ merchant: '滴滴出行' })), {
    project: '差旅',
    category: '交通',
  });
});

test('酒店 -> 住宿/差旅', () => {
  assert.deepEqual(classifyExpenseRecord(makeRecord({ merchant: '如家酒店' })), {
    project: '差旅',
    category: '住宿',
  });
});

test('腾讯云 -> 软件服务/内部运营', () => {
  assert.deepEqual(classifyExpenseRecord(makeRecord({ merchant: '腾讯云服务器' })), {
    project: '内部运营',
    category: '软件服务',
  });
});

test('美团 -> 餐饮/客户招待', () => {
  assert.deepEqual(classifyExpenseRecord(makeRecord({ merchant: '美团点评' })), {
    project: '客户招待',
    category: '餐饮',
  });
});

test('保险 -> 其他/内部运营（classify 内保险归内部运营）', () => {
  assert.deepEqual(classifyExpenseRecord(makeRecord({ merchant: '中国平安保险' })), {
    project: '内部运营',
    category: '其他',
  });
});

test('ETC(大写) -> 交通/差旅', () => {
  assert.deepEqual(classifyExpenseRecord(makeRecord({ merchant: 'ETC通行费' })), {
    project: '差旅',
    category: '交通',
  });
});

test('无关键词 -> 其他/其他', () => {
  assert.deepEqual(classifyExpenseRecord(makeRecord()), { project: '其他', category: '其他' });
});

test('fillMissingClassification 仅在字段为空时填充', () => {
  const kept = fillMissingClassification(makeRecord({ project: '差旅', category: '交通' }));
  assert.equal(kept.project, '差旅');
  assert.equal(kept.category, '交通');

  const filled = fillMissingClassification(makeRecord());
  assert.equal(filled.category, '其他');
});
