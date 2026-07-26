import type { ExpenseRecord } from '../types/expense';
import { detectDuplicates } from './dedupe';

export type SelfCheckSeverity = 'error' | 'warning';

export type SelfCheckIssueType =
  | 'amountInvalid'
  | 'duplicate'
  | 'refunded'
  | 'missingOrderId'
  | 'missingCategory'
  | 'missingNote'
  | 'missingMeta'
  | 'staleDate';

export type SelfCheckIssue = {
  type: SelfCheckIssueType;
  recordId: string;
  severity: SelfCheckSeverity;
  /** 用于在清单里显示这条记录：商户 / 交易对方 */
  label: string;
  /** 辅助信息：金额 · 日期 */
  detail: string;
  /** 该条的具体原因 */
  reason: string;
};

export type SelfCheckSummary = {
  total: number;
  issues: SelfCheckIssue[];
  errorCount: number;
  warningCount: number;
  /** 没有任何问题（错误 + 提醒都为 0）才视为通过 */
  passed: boolean;
};

/** 消费时间距今超过该天数，视为超过常规报销时效 */
const STALE_DAYS = 365;
/** 交易状态里出现这些关键字，说明这笔钱实际没有支出（退款 / 失败 / 关闭） */
const REFUND_KEYWORDS = ['退款', '已退款', '退回', '失败', '关闭', '已撤销', '冲正', '作废'];

export const SELF_CHECK_LABELS: Record<SelfCheckIssueType, string> = {
  amountInvalid: '金额异常',
  duplicate: '疑似重复报销',
  refunded: '交易已退款 / 失败',
  missingOrderId: '缺交易订单号',
  missingCategory: '缺费用类别',
  missingNote: '缺报销事由',
  missingMeta: '缺报销月份 / 报销人 / 项目',
  staleDate: '消费时间过旧',
};

/** 各问题类型的严重级别：error = 大概率被退单，必须处理；warning = 建议补齐 */
export const SELF_CHECK_SEVERITY: Record<SelfCheckIssueType, SelfCheckSeverity> = {
  amountInvalid: 'error',
  duplicate: 'error',
  refunded: 'error',
  missingOrderId: 'warning',
  missingCategory: 'warning',
  missingNote: 'warning',
  missingMeta: 'warning',
  staleDate: 'warning',
};

function formatAmount(amount: number): string {
  return `¥${Number.isFinite(amount) ? amount.toFixed(2) : '—'}`;
}

function formatDate(dateTime: string): string {
  if (!dateTime) return '—';
  return dateTime.slice(0, 10);
}

/**
 * 报销前自检：对「已选待报销」记录跑一组校验，输出问题清单，把「被财务退回重做」降到 0。
 *
 * 纯本地、无外部依赖；复用 dedupe 的疑似重复判定（在已选子集内检测，避免同一笔被重复报销）。
 * 只标记不自动改——由用户决定如何修复。
 */
export function runSelfCheck(records: ExpenseRecord[]): SelfCheckSummary {
  const selected = records.filter((record) => record.isCompanyExpense);
  if (selected.length === 0) {
    return { total: 0, issues: [], errorCount: 0, warningCount: 0, passed: true };
  }

  const duplicateMap = detectDuplicates(selected);
  const now = Date.now();
  const staleBoundary = now - STALE_DAYS * 24 * 60 * 60 * 1000;

  const issues: SelfCheckIssue[] = [];

  for (const record of selected) {
    const label = record.merchant || record.counterparty || '未命名记录';
    const detail = `${formatAmount(record.amount)} · ${formatDate(record.dateTime)}`;

    // 1) 金额异常
    if (!Number.isFinite(record.amount) || record.amount <= 0) {
      issues.push({
        type: 'amountInvalid',
        recordId: record.id,
        severity: 'error',
        label,
        detail,
        reason: '金额为 0 或无效，无法纳入报销',
      });
    }

    // 2) 疑似重复（复用 dedupe，已在选中子集内）
    const dup = duplicateMap.get(record.id);
    if (dup?.isDuplicate) {
      const basisText = dup.basis === 'orderId' ? '订单号相同' : '金额与时间相近';
      issues.push({
        type: 'duplicate',
        recordId: record.id,
        severity: 'error',
        label,
        detail,
        reason: `与同组其他 ${dup.dupCount - 1} 条疑似重复（${basisText}），同一笔可能被重复报销`,
      });
    }

    // 3) 交易状态异常（退款 / 失败等，钱实际没花）
    const status = (record.transactionStatus || '').trim();
    if (status && REFUND_KEYWORDS.some((keyword) => status.includes(keyword))) {
      issues.push({
        type: 'refunded',
        recordId: record.id,
        severity: 'error',
        label,
        detail,
        reason: `交易状态为「${status}」，这笔钱实际未支出，不应报销`,
      });
    }

    // 4) 缺交易订单号（无法追溯到原始支付凭证）
    if (!record.transactionId?.trim()) {
      issues.push({
        type: 'missingOrderId',
        recordId: record.id,
        severity: 'warning',
        label,
        detail,
        reason: '缺少交易订单号，财务难以核对原始支付',
      });
    }

    // 5) 缺费用类别
    if (!record.category?.trim()) {
      issues.push({
        type: 'missingCategory',
        recordId: record.id,
        severity: 'warning',
        label,
        detail,
        reason: '未填写费用类别，财务无法归类',
      });
    }

    // 6) 缺报销事由
    if (!record.note?.trim()) {
      issues.push({
        type: 'missingNote',
        recordId: record.id,
        severity: 'warning',
        label,
        detail,
        reason: '未填写报销事由，建议补一句用途说明',
      });
    }

    // 7) 缺报销月份 / 报销人 / 项目
    const missingMeta: string[] = [];
    if (!record.reimbursementMonth?.trim()) missingMeta.push('报销月份');
    if (!record.reimburser?.trim()) missingMeta.push('报销人');
    if (!record.project?.trim()) missingMeta.push('项目');
    if (missingMeta.length > 0) {
      issues.push({
        type: 'missingMeta',
        recordId: record.id,
        severity: 'warning',
        label,
        detail,
        reason: `未填写：${missingMeta.join('、')}`,
      });
    }

    // 8) 消费时间过旧
    const t = Date.parse(record.dateTime);
    if (Number.isFinite(t) && t < staleBoundary) {
      const days = Math.floor((now - t) / (24 * 60 * 60 * 1000));
      issues.push({
        type: 'staleDate',
        recordId: record.id,
        severity: 'warning',
        label,
        detail,
        reason: `消费时间距今已 ${days} 天，可能超过报销时效`,
      });
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;

  return {
    total: selected.length,
    issues,
    errorCount,
    warningCount,
    passed: issues.length === 0,
  };
}
