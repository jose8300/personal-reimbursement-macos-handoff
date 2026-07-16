// 等级二：让报销判定「筛得更准、更可控」。
// 全部为纯函数，不依赖浏览器全局变量，可在 node 下用 tsx 验证。
// 置信度/命中理由/影响预览/边界复核/行为学规则建议都由此模块派生，App.tsx 只负责展示。

import type { ExpenseRecord } from '../types/expense';
import { getRecordText } from './appHelpers';
import { fillMissingClassification } from './classifyExpense';
import {
  getAutoRuleDisplayList,
  recordMatchesAnyAutoReimbursementRule,
  recordMatchesAutoReimbursementRule,
  type AutoReimbursementRuleId,
  type CustomAutoRule,
} from './initialReimbursementSelection';

export type RuleHit = { id: AutoReimbursementRuleId; label: string };
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type RecordInsight = {
  autoHits: RuleHit[];
  confidence: { score: number; level: ConfidenceLevel };
  reason: string;
  // 已勾选但没有任何筛入规则命中（纯人工判断）
  isManualSelected: boolean;
  // 未勾选却被筛入规则命中（可能漏选）
  isRuleMissed: boolean;
};

export type RuleImpact = {
  matchedTotal: number;
  addCount: number;
  addAmount: number;
};

export type BoundaryCase = {
  record: ExpenseRecord;
  kind: 'missed' | 'over-included' | 'low-confidence';
  reason: string;
  suggestedAction: 'select' | 'deselect';
};

export type BehaviorRuleSuggestion = {
  keyword: string;
  selectedCount: number;
  unselectedCount: number;
  confidence: number;
};

// 每条内置规则的基准置信度（0-100）：判定越明确越高，越依赖主观判断越低
const AUTO_RULE_CONFIDENCE: Record<string, number> = {
  largeExpense: 92,
  ctripOrder: 95,
  highwayFeeOver10: 85,
  weekdayDiningOver100: 58,
  insurance: 80,
  familyCard: 70,
  etcFee: 88,
  reserveFund: 85,
  alibaba1688: 80,
  transfer: 50,
  gas: 75,
  chinaMobile: 80,
  stateGridXiamen: 82,
};

// 行为学建议时忽略的高频通用词，避免产生噪声规则
const BEHAVIOR_STOPWORDS = new Set([
  '微信', '支付宝', '转账', '支付', '银行', '余额', '零钱', '账单', '交易', '消费',
  '收入', '支出', '收款', '付款', '订单', '商户', '明细', '信用卡', '借记', '理财',
  '红包', '钱包', '现金', '提现', '充值', '退款', '手续费', '利息', '还款', '分期',
]);

export function buildRuleLabelMap(customRules: CustomAutoRule[]): Record<string, string> {
  return Object.fromEntries(getAutoRuleDisplayList(customRules).map((rule) => [rule.id, rule.label]));
}

// 返回该记录命中的（已勾选的）筛入规则列表
export function explainAutoRuleHits(
  record: ExpenseRecord,
  ruleIds: AutoReimbursementRuleId[],
  customRules: CustomAutoRule[],
  labelMap: Record<string, string>,
): RuleHit[] {
  return ruleIds
    .filter((id) => recordMatchesAutoReimbursementRule(record, id, customRules))
    .map((id) => ({ id, label: labelMap[id] ?? String(id) }));
}

export function computeConfidence(autoHits: RuleHit[]): { score: number; level: ConfidenceLevel } {
  if (!autoHits.length) return { score: 100, level: 'high' }; // 人工勾选即视为用户确认
  const score = Math.max(...autoHits.map((hit) => AUTO_RULE_CONFIDENCE[hit.id] ?? 65));
  const level: ConfidenceLevel = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  return { score, level };
}

// 计算单条记录的判定洞察：命中理由 + 置信度
export function getRecordInsight(
  record: ExpenseRecord,
  selectedAutoRuleIds: AutoReimbursementRuleId[],
  customRules: CustomAutoRule[],
  labelMap: Record<string, string>,
): RecordInsight {
  const autoHits = explainAutoRuleHits(record, selectedAutoRuleIds, customRules, labelMap);
  const confidence = computeConfidence(autoHits);
  const isManualSelected = record.isCompanyExpense && autoHits.length === 0;
  const isRuleMissed = !record.isCompanyExpense && autoHits.length > 0;
  let reason: string;
  if (record.isCompanyExpense) {
    reason = autoHits.length
      ? `命中规则：${autoHits.map((hit) => hit.label).join('、')}`
      : '人工勾选（无规则命中）';
  } else {
    reason = autoHits.length
      ? `未勾选，但命中规则：${autoHits.map((hit) => hit.label).join('、')}`
      : '未命中筛入规则';
  }
  return { autoHits, confidence, reason, isManualSelected, isRuleMissed };
}

// 规则影响面预览：应用当前勾选的筛入规则，会「新增」多少条、涉及多少金额
export function previewAutoRuleImpact(
  records: ExpenseRecord[],
  ruleIds: AutoReimbursementRuleId[],
  customRules: CustomAutoRule[],
): RuleImpact {
  if (!ruleIds.length) return { matchedTotal: 0, addCount: 0, addAmount: 0 };
  let matchedTotal = 0;
  let addCount = 0;
  let addAmount = 0;
  for (const record of records) {
    if (recordMatchesAnyAutoReimbursementRule(record, ruleIds, customRules)) {
      matchedTotal += 1;
      if (!record.isCompanyExpense) {
        addCount += 1;
        addAmount += record.amount;
      }
    }
  }
  return { matchedTotal, addCount, addAmount };
}

// 边界主动复核：挑出「最可能误判」的若干条，主动请人工确认（而非全量盲信）
export function findBoundaryCases(
  records: ExpenseRecord[],
  selectedAutoRuleIds: AutoReimbursementRuleId[],
  customRules: CustomAutoRule[],
  labelMap: Record<string, string>,
  limit = 20,
): BoundaryCase[] {
  const cases: BoundaryCase[] = [];
  for (const record of records) {
    const autoHits = explainAutoRuleHits(record, selectedAutoRuleIds, customRules, labelMap);
    const { level } = computeConfidence(autoHits);
    if (!record.isCompanyExpense && autoHits.length > 0) {
      cases.push({
        record,
        kind: 'missed',
        reason: `未勾选，但命中规则：${autoHits.map((hit) => hit.label).join('、')}`,
        suggestedAction: 'select',
      });
    } else if (record.isCompanyExpense && autoHits.length === 0) {
      cases.push({
        record,
        kind: 'over-included',
        reason: '已勾选但无规则命中，属人工判断，建议确认是否真的该报',
        suggestedAction: 'deselect',
      });
    } else if (record.isCompanyExpense && level === 'low') {
      cases.push({
        record,
        kind: 'low-confidence',
        reason: `仅命中低置信度规则（${autoHits.map((hit) => hit.label).join('、')}）`,
        suggestedAction: 'deselect',
      });
    }
  }
  const rank = (c: BoundaryCase) => (c.kind === 'missed' ? 0 : c.kind === 'over-included' ? 1 : 2);
  cases.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return b.record.amount - a.record.amount;
  });
  return cases.slice(0, limit);
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const cjkSegments = lower.match(/[一-龥]+/g) ?? [];
  for (const segment of cjkSegments) {
    for (let n = 2; n <= 4; n += 1) {
      for (let i = 0; i + n <= segment.length; i += 1) tokens.push(segment.slice(i, i + n));
    }
  }
  const words = lower.match(/[a-z0-9]+/g) ?? [];
  tokens.push(...words);
  return tokens;
}

function isCoveredByExistingRule(keyword: string, customRules: CustomAutoRule[]): boolean {
  const k = keyword.toLowerCase();
  return customRules.some((rule) =>
    rule.keywords.some((kw) => {
      const lk = kw.toLowerCase();
      return k.includes(lk) || lk.includes(k);
    }),
  );
}

// 从行为学规则：分析「用户手动勾选 / 未勾选」的模式，归纳出候选关键词规则
export function suggestRulesFromBehavior(
  records: ExpenseRecord[],
  customRules: CustomAutoRule[],
  limit = 5,
): BehaviorRuleSuggestion[] {
  const selected = records.filter((record) => record.isCompanyExpense);
  const unselected = records.filter((record) => !record.isCompanyExpense);
  if (selected.length < 2) return [];

  const selCount = new Map<string, number>();
  const unCount = new Map<string, number>();
  const bump = (map: Map<string, number>, text: string) => {
    for (const token of tokenize(text)) {
      if (token.length < 2) continue;
      if (/^[0-9]+$/.test(token)) continue;
      if (BEHAVIOR_STOPWORDS.has(token)) continue;
      map.set(token, (map.get(token) ?? 0) + 1);
    }
  };
  selected.forEach((record) => bump(selCount, getRecordText(record)));
  unselected.forEach((record) => bump(unCount, getRecordText(record)));

  const suggestions: BehaviorRuleSuggestion[] = [];
  for (const [keyword, sc] of selCount) {
    if (sc < 2) continue; // 至少在 2 条选中记录里出现
    const uc = unCount.get(keyword) ?? 0;
    const total = sc + uc;
    if (uc > sc) continue; // 未选里出现更多 → 不是好信号
    const confidence = sc / total;
    if (confidence < 0.8) continue; // 噪声过滤
    if (isCoveredByExistingRule(keyword, customRules)) continue;
    suggestions.push({ keyword, selectedCount: sc, unselectedCount: uc, confidence });
  }
  // 兼顾支持度与置信度排序，避免只挑长尾噪声
  suggestions.sort(
    (a, b) => b.selectedCount * b.confidence - a.selectedCount * a.confidence,
  );
  return suggestions.slice(0, limit);
}

// 采纳一条边界复核建议（用于 UI 直接调用）
export function applyBoundarySuggestion(
  record: ExpenseRecord,
  action: 'select' | 'deselect',
): ExpenseRecord {
  if (action === 'deselect') {
    return { ...record, isCompanyExpense: false };
  }
  if (record.isCompanyExpense) return record;
  const filled = fillMissingClassification(record);
  return { ...filled, isCompanyExpense: true };
}
