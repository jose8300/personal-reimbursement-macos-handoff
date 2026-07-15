import type { ExpenseRecord, ReimbursementRecord } from '../types/expense';
import { getDateOnly, getMonth, normalizeDateInput } from './format';

export type FeishuSyncItem = ReimbursementRecord;

export function createReimbursementSyncId(record: ExpenseRecord) {
  return [
    getDateOnly(record.dateTime),
    record.amount.toFixed(2),
    record.sourcePlatform,
    record.transactionType,
    record.counterparty,
    record.productName,
    record.paymentAccount,
    record.billRemark,
  ]
    .map((value) => String(value ?? '').trim().replace(/\s+/g, ' '))
    .join('|');
}

export function buildReimbursementDescription(record: ExpenseRecord) {
  const pieces = [record.counterparty, record.productName].filter(Boolean);
  return pieces.length ? Array.from(new Set(pieces)).join(' - ') : record.merchant;
}

function normalizeReimbursementDateTime(dateTime: string) {
  const normalized = normalizeDateInput(dateTime).replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!match) return getDateOnly(dateTime);

  const [, year, month, day, hour, minute, second = '00'] = match;
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (!hour || !minute) return date;
  return `${date} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
}

export function toReimbursementRecord(record: ExpenseRecord): ReimbursementRecord {
  const date = normalizeReimbursementDateTime(record.dateTime);
  return {
    syncId: createReimbursementSyncId(record),
    month: record.reimbursementMonth || getMonth(record.dateTime),
    date,
    reimburser: record.reimburser || 'Musk',
    project: record.project || '未填写项目',
    category: record.category || '未分类',
    transactionType: record.transactionType,
    counterparty: record.counterparty,
    productName: record.productName,
    billRemark: record.billRemark,
    description: buildReimbursementDescription(record),
    amount: record.amount,
    paymentAccount: record.paymentAccount,
    sourcePlatform: record.sourcePlatform,
    note: record.note,
  };
}

export function toFeishuSyncItem(record: ExpenseRecord): FeishuSyncItem {
  return toReimbursementRecord(record);
}
