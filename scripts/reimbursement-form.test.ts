import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReimbursementRecord } from '../src/types/expense';
import {
  buildFormModel,
  defaultFormTemplates,
  flattenFormRows,
  groupReimbursements,
  type FormColumnKey,
  type FormGroupDim,
} from '../src/utils/reimbursementForm';

const VALID_DIMS: FormGroupDim[] = [
  'reimburser',
  'project',
  'category',
  'month',
  'sourcePlatform',
  'transactionType',
];
const VALID_COLS: FormColumnKey[] = [
  'date',
  'counterparty',
  'productName',
  'description',
  'amount',
  'paymentAccount',
  'note',
  'sourcePlatform',
  'transactionType',
  'category',
  'project',
  'reimburser',
  'month',
];

function makeRecord(over: Partial<ReimbursementRecord> & Pick<ReimbursementRecord, 'amount'>): ReimbursementRecord {
  return {
    syncId: over.syncId ?? `s-${Math.random()}`,
    month: over.month ?? '2026-06',
    date: over.date ?? '2026-06-01',
    reimburser: over.reimburser ?? '甲',
    project: over.project ?? 'A',
    category: over.category ?? '餐饮',
    transactionType: over.transactionType ?? '消费',
    counterparty: over.counterparty ?? '',
    productName: over.productName ?? '',
    billRemark: over.billRemark ?? '',
    description: over.description ?? '',
    amount: over.amount,
    paymentAccount: over.paymentAccount ?? '',
    sourcePlatform: over.sourcePlatform ?? '微信',
    note: over.note ?? '',
    ...over,
  };
}

const records = [
  makeRecord({ syncId: '1', reimburser: '甲', project: 'A', category: '餐饮', month: '2026-06', amount: 120 }),
  makeRecord({ syncId: '2', reimburser: '甲', project: 'A', category: '交通', month: '2026-06', amount: 30 }),
  makeRecord({ syncId: '3', reimburser: '乙', project: 'B', category: '餐饮', month: '2026-06', amount: 200 }),
  makeRecord({ syncId: '4', reimburser: '甲', project: 'A', category: '餐饮', month: '2026-07', amount: 80 }),
];

test('defaultFormTemplates 返回 2 个合法预置模板', () => {
  const templates = defaultFormTemplates();
  assert.equal(templates.length, 2);
  for (const template of templates) {
    assert.ok(template.id && template.name, '模板需有 id 与 name');
    assert.ok(Array.isArray(template.groupBy) && template.groupBy.length > 0, 'groupBy 非空');
    assert.ok(Array.isArray(template.columns) && template.columns.length > 0, 'columns 非空');
    assert.ok(template.groupBy.every((dim) => VALID_DIMS.includes(dim)), 'groupBy 均为合法维度');
    assert.ok(template.columns.every((col) => VALID_COLS.includes(col)), 'columns 均为合法列');
  }
});

test('groupReimbursements 单维度分组：各组和=组内金额和', () => {
  const groups = groupReimbursements(records, ['reimburser']);
  assert.equal(groups.length, 2);
  const jia = groups.find((g) => g.value === '甲')!;
  assert.equal(jia.count, 3);
  assert.equal(jia.amount, 230);
  const yi = groups.find((g) => g.value === '乙')!;
  assert.equal(yi.count, 1);
  assert.equal(yi.amount, 200);
});

test('groupReimbursements 多维度层级：子组金额累加正确', () => {
  const groups = groupReimbursements(records, ['reimburser', 'project']);
  const jia = groups.find((g) => g.value === '甲')!;
  assert.ok(jia.children && jia.children.length === 1, '甲 仅一个项目 A');
  assert.equal(jia.children![0].value, 'A');
  assert.equal(jia.children![0].amount, 230);
  assert.equal(jia.children![0].count, 3);
});

test('groupReimbursements 空 groupBy 返回单一「全部」组', () => {
  const groups = groupReimbursements(records, []);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].value, '全部');
  assert.equal(groups[0].count, 4);
  assert.equal(groups[0].amount, 430);
  assert.equal(groups[0].records?.length, 4);
});

test('buildFormModel 合计=全部记录金额和', () => {
  const model = buildFormModel(records, defaultFormTemplates()[0]);
  assert.equal(model.totalAmount, 430);
  assert.equal(model.totalCount, 4);
  assert.equal(model.title.length > 0, true);
});

test('flattenFormRows 结构：含标题/分组/明细/小计/合计且合计一致', () => {
  const template = defaultFormTemplates()[0];
  const model = buildFormModel(records, template);
  const rows = flattenFormRows(model, template.columns);

  assert.equal(rows[0].kind, 'title');
  const grand = rows[rows.length - 1];
  assert.equal(grand.kind, 'grand');
  if (grand.kind === 'grand') {
    assert.equal(grand.amount, model.totalAmount);
    assert.equal(grand.count, model.totalCount);
  }
  assert.ok(rows.some((r) => r.kind === 'group'));
  assert.ok(rows.some((r) => r.kind === 'detail'));
  assert.ok(rows.some((r) => r.kind === 'subtotal'));
});

test('flattenFormRows 小计一致性：顶层小计之和=合计', () => {
  const model = buildFormModel(records, defaultFormTemplates()[0]);
  const rows = flattenFormRows(model, defaultFormTemplates()[0].columns);
  const topSubtotals = rows.filter((r) => r.kind === 'subtotal' && r.depth === 0);
  assert.ok(topSubtotals.length >= 2);
  const sum = topSubtotals.reduce((total, r) => (r.kind === 'subtotal' ? total + r.amount : total), 0);
  // 顶层按报销人：甲(230)+乙(200)=430，与合计一致（父组小计已含子组）
  assert.equal(sum, model.totalAmount);
});
