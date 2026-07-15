import type { ExpenseRecord } from '../types/expense';
import { classifyExpenseRecord } from './classifyExpense';
import { getWeekdayLabel } from './format';

export type AutoReimbursementRuleId =
  | 'largeExpense'
  | 'ctripOrder'
  | 'weekdayDiningOver100'
  | 'highwayFeeOver10'
  | 'insurance'
  | 'familyCard'
  | 'etcFee'
  | 'reserveFund'
  | 'alibaba1688'
  | 'transfer'
  | 'gas'
  | 'chinaMobile'
  | 'stateGridXiamen'
  | string; // 自定义规则使用字符串 ID

export type AutoReimbursementRule = {
  id: AutoReimbursementRuleId;
  label: string;
  description: string;
};

export type CustomAutoRule = {
  id: string;
  label: string;
  keywords: string[];
};

const largeExpenseMinimumAmount = 1000;
const highwayMinimumAmount = 10;
const highwayKeywords = ['高速', '高速公路', '通行费', '过路费', 'etc'];
const ctripKeywords = ['携程', '程支付', '赫程', '华程'];
// 虾叔规则按顿号拆分为独立筛入选项：ruleId -> 匹配关键词
const uncleXiaKeywordMap: Record<string, string> = {
  insurance: '保险',
  familyCard: '亲情卡',
  etcFee: 'etc',
  reserveFund: '备用金',
  alibaba1688: '1688增值服务',
  transfer: '转账',
  gas: '燃气',
  chinaMobile: '中国移动',
  stateGridXiamen: '国网厦门供电公司',
};

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
  {
    id: 'insurance',
    label: '保险',
    description: '交易含「保险」关键词',
  },
  {
    id: 'familyCard',
    label: '亲情卡',
    description: '交易含「亲情卡」关键词',
  },
  {
    id: 'etcFee',
    label: 'ETC',
    description: '交易含「ETC」关键词',
  },
  {
    id: 'reserveFund',
    label: '备用金',
    description: '交易含「备用金」关键词',
  },
  {
    id: 'alibaba1688',
    label: '1688增值服务',
    description: '交易含「1688增值服务」关键词',
  },
  {
    id: 'transfer',
    label: '转账',
    description: '交易含「转账」关键词',
  },
  {
    id: 'gas',
    label: '燃气',
    description: '交易含「燃气」关键词',
  },
  {
    id: 'chinaMobile',
    label: '中国移动',
    description: '交易含「中国移动」关键词',
  },
  {
    id: 'stateGridXiamen',
    label: '国网厦门供电公司',
    description: '交易含「国网厦门供电公司」关键词',
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

function isUncleXiaKeywordExpense(record: ExpenseRecord, ruleId: AutoReimbursementRuleId) {
  const keyword = uncleXiaKeywordMap[ruleId];
  if (!keyword) return false;
  const text = recordText(record);
  return text.includes(keyword.toLowerCase());
}

export function recordMatchesAutoReimbursementRule(
  record: ExpenseRecord,
  ruleId: AutoReimbursementRuleId,
  customRules?: CustomAutoRule[],
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
    case 'insurance':
    case 'familyCard':
    case 'etcFee':
    case 'reserveFund':
    case 'alibaba1688':
    case 'transfer':
    case 'gas':
    case 'chinaMobile':
    case 'stateGridXiamen':
      return isUncleXiaKeywordExpense(record, ruleId);
    default:
      // 自定义规则：按关键词匹配
      if (customRules) {
        const custom = customRules.find((r) => r.id === ruleId);
        if (custom) return recordMatchesCustomRule(record, custom);
      }
      return false;
  }
}

export function recordMatchesAnyAutoReimbursementRule(
  record: ExpenseRecord,
  ruleIds: AutoReimbursementRuleId[],
  customRules?: CustomAutoRule[],
): boolean {
  return ruleIds.some((ruleId) => recordMatchesAutoReimbursementRule(record, ruleId, customRules));
}

export function applyAutoReimbursementRules(
  record: ExpenseRecord,
  ruleIds: AutoReimbursementRuleId[],
  customRules?: CustomAutoRule[],
): ExpenseRecord {
  if (!recordMatchesAnyAutoReimbursementRule(record, ruleIds, customRules)) return record;
  const classification = classifyExpenseRecord(record);
  return {
    ...record,
    isCompanyExpense: true,
    project: record.project || classification.project,
    category: record.category || classification.category,
  };
}

export function recordMatchesCustomRule(
  record: ExpenseRecord,
  rule: CustomAutoRule,
): boolean {
  if (!rule.keywords.length) return false;
  const text = recordText(record);
  return rule.keywords.every((keyword) => text.includes(keyword.toLowerCase()));
}

export function getAutoRuleDisplayList(
  customRules: CustomAutoRule[],
): AutoReimbursementRule[] {
  const builtIn = autoReimbursementRules as AutoReimbursementRule[];
  const custom: AutoReimbursementRule[] = customRules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    description: `关键词：${rule.keywords.join('、')}`,
    _custom: true as const,
  }));
  return [...builtIn, ...custom];
}

const BUILTIN_RULE_IDS = new Set(autoReimbursementRules.map((r) => r.id));

export function isBuiltinRuleId(id: string): boolean {
  return BUILTIN_RULE_IDS.has(id);
}
