import type { ExpenseRecord } from '../types/expense';
import { classifyExpenseRecord } from './classifyExpense';
import { getWeekdayLabel } from './format';

export type AutoReimbursementRuleId =
  | 'largeExpense'
  | 'ctripOrder'
  | 'weekdayDiningOver100'
  | 'highwayFeeOver10';

export type AutoReimbursementRule = {
  id: AutoReimbursementRuleId;
  label: string;
  description: string;
};

const largeExpenseMinimumAmount = 1000;
const highwayMinimumAmount = 10;
const highwayKeywords = ['高速', '高速公路', '通行费', '过路费', 'etc'];
const ctripKeywords = ['携程', '程支付', '赫程', '华程'];

export const autoReimbursementRules: AutoReimbursementRule[] = [
  {
    id: 'largeExpense',
    label: '大额消费',
    description: '金额大于 1000 元',
  },
  {
    id: 'ctripOrder',
    label: '携程订单',
    description: '包含携程、程支付、赫程、华程',
  },
  {
    id: 'weekdayDiningOver100',
    label: '工作日餐饮',
    description: '工作日餐饮消费大于 100 元',
  },
  {
    id: 'highwayFeeOver10',
    label: '高速费',
    description: '高速、ETC、通行费、过路费，且金额不低于 10 元',
  },
];

function recordText(record: ExpenseRecord) {
  return [
    record.transactionType,
    record.counterparty,
    record.productName,
    record.billRemark,
    record.merchant,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isWeekday(record: ExpenseRecord) {
  return ['周一', '周二', '周三', '周四', '周五'].includes(getWeekdayLabel(record.dateTime));
}

function isHighwayExpense(record: ExpenseRecord) {
  const text = recordText(record);
  return highwayKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function isCtripExpense(record: ExpenseRecord) {
  const text = recordText(record);
  return ctripKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function recordMatchesAutoReimbursementRule(
  record: ExpenseRecord,
  ruleId: AutoReimbursementRuleId,
) {
  const classification = classifyExpenseRecord(record);

  switch (ruleId) {
    case 'largeExpense':
      return record.amount > largeExpenseMinimumAmount;
    case 'ctripOrder':
      return isCtripExpense(record);
    case 'weekdayDiningOver100':
      return classification.category === '餐饮' && isWeekday(record) && record.amount > 100;
    case 'highwayFeeOver10':
      return isHighwayExpense(record) && record.amount >= highwayMinimumAmount;
    default:
      return false;
  }
}

export function recordMatchesAnyAutoReimbursementRule(
  record: ExpenseRecord,
  ruleIds: AutoReimbursementRuleId[],
) {
  return ruleIds.some((ruleId) => recordMatchesAutoReimbursementRule(record, ruleId));
}

export function applyAutoReimbursementRules(
  record: ExpenseRecord,
  ruleIds: AutoReimbursementRuleId[],
): ExpenseRecord {
  if (!recordMatchesAnyAutoReimbursementRule(record, ruleIds)) return record;
  const classification = classifyExpenseRecord(record);
  return {
    ...record,
    isCompanyExpense: true,
    project: record.project || classification.project,
    category: record.category || classification.category,
  };
}
