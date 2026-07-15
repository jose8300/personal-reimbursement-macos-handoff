import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAutoReimbursementRules,
  autoReimbursementRules,
  recordMatchesAnyAutoReimbursementRule,
  recordMatchesAutoReimbursementRule,
  type AutoReimbursementRuleId,
} from '../src/utils/initialReimbursementSelection';
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

test('规则总数为 13（4 原规则 + 9 虾叔拆分）', () => {
  assert.equal(autoReimbursementRules.length, 13);
});

test('largeExpense: 金额 >1000 命中，=1000 不命中', () => {
  assert.equal(recordMatchesAutoReimbursementRule(makeRecord({ amount: 1500 }), 'largeExpense'), true);
  assert.equal(recordMatchesAutoReimbursementRule(makeRecord({ amount: 1000 }), 'largeExpense'), false);
});

test('ctripOrder: 含携程关键词命中', () => {
  assert.equal(recordMatchesAutoReimbursementRule(makeRecord({ merchant: '携程旅行网' }), 'ctripOrder'), true);
  assert.equal(recordMatchesAutoReimbursementRule(makeRecord({ merchant: '美团' }), 'ctripOrder'), false);
});

test('weekdayDiningOver100: 工作日餐饮>100 命中，周末/<=100 不命中', () => {
  assert.equal(
    recordMatchesAutoReimbursementRule(
      makeRecord({ merchant: '餐厅', amount: 200, dateTime: '2024-01-01 12:00' }),
      'weekdayDiningOver100',
    ),
    true,
  );
  // 2024-01-06 是周六
  assert.equal(
    recordMatchesAutoReimbursementRule(
      makeRecord({ merchant: '餐厅', amount: 200, dateTime: '2024-01-06 12:00' }),
      'weekdayDiningOver100',
    ),
    false,
  );
  assert.equal(
    recordMatchesAutoReimbursementRule(
      makeRecord({ merchant: '餐厅', amount: 100, dateTime: '2024-01-01 12:00' }),
      'weekdayDiningOver100',
    ),
    false,
  );
});

test('highwayFeeOver10: 高速关键词且金额>=10 命中，<10 不命中', () => {
  assert.equal(
    recordMatchesAutoReimbursementRule(makeRecord({ merchant: '高速公路通行费', amount: 20 }), 'highwayFeeOver10'),
    true,
  );
  assert.equal(
    recordMatchesAutoReimbursementRule(makeRecord({ merchant: '高速公路通行费', amount: 5 }), 'highwayFeeOver10'),
    false,
  );
  assert.equal(
    recordMatchesAutoReimbursementRule(makeRecord({ merchant: '餐厅', amount: 20 }), 'highwayFeeOver10'),
    false,
  );
});

const uncleXiaCases: Array<[AutoReimbursementRuleId, string]> = [
  ['insurance', '保险'],
  ['familyCard', '亲情卡'],
  ['etcFee', 'ETC'],
  ['reserveFund', '备用金'],
  ['alibaba1688', '1688增值服务'],
  ['transfer', '转账'],
  ['gas', '燃气'],
  ['chinaMobile', '中国移动'],
  ['stateGridXiamen', '国网厦门供电公司'],
];

for (const [id, keyword] of uncleXiaCases) {
  test(`虾叔规则 ${id} 命中关键词「${keyword}」`, () => {
    assert.equal(recordMatchesAutoReimbursementRule(makeRecord({ merchant: `某${keyword}消费` }), id), true);
    assert.equal(recordMatchesAutoReimbursementRule(makeRecord({ merchant: '无关消费' }), id), false);
  });
}

test('applyAutoReimbursementRules: 命中则标记公司消费并填充分类', () => {
  const hit = applyAutoReimbursementRules(makeRecord({ merchant: '滴滴出行', amount: 2000 }), ['largeExpense']);
  assert.equal(hit.isCompanyExpense, true);
  assert.equal(hit.project, '差旅');
  assert.equal(hit.category, '交通');

  const miss = applyAutoReimbursementRules(makeRecord({ merchant: '餐厅', amount: 50 }), ['largeExpense']);
  assert.equal(miss.isCompanyExpense, false);
});

test('recordMatchesAnyAutoReimbursementRule: 任一规则命中即为真', () => {
  assert.equal(
    recordMatchesAnyAutoReimbursementRule(makeRecord({ amount: 2000 }), ['largeExpense', 'insurance']),
    true,
  );
  assert.equal(
    recordMatchesAnyAutoReimbursementRule(makeRecord({ amount: 50, merchant: '餐厅' }), ['largeExpense', 'insurance']),
    false,
  );
});
