import type { ExpenseRecord } from '../types/expense';

export type DuplicateMatchBasis = 'orderId' | 'amountTime';

export type DuplicateInfo = {
  groupId: string;
  /** 同一疑似重复组内的记录条数（>=2 才可能是重复） */
  dupCount: number;
  /** 匹配依据：订单号精确相同 / 金额+时间相近 */
  basis: DuplicateMatchBasis;
  /** 是否属于某个重复组（dupCount > 1） */
  isDuplicate: boolean;
};

/** 模糊匹配的时间窗口：金额相同且发生时间相差不超过 2 小时，视为疑似跨平台重复 */
const AMOUNT_TIME_WINDOW_MS = 2 * 60 * 60 * 1000;
/** 金额比较允许的浮点误差 */
const AMOUNT_EPSILON = 0.005;

function parseTime(dateTime: string): number {
  const t = Date.parse(dateTime);
  return Number.isNaN(t) ? NaN : t;
}

/**
 * 检测消费记录中的疑似重复，避免同一笔消费被重复报销（最常见报销事故）。
 *
 * 两层级匹配：
 * 1. 精确重复：交易订单号（transactionId）非空且相同 —— 多为同一账单重复导入。
 * 2. 模糊重复：订单号缺失或各不相同时，金额相等且与锚点记录时间差 ≤ 2 小时
 *    —— 多为微信支付与其绑定的银行卡同日扣款、或跨平台重复支付。
 *
 * 命中规则：组内有 ≥2 条记录，整组标记 isDuplicate=true（不自动删除，由用户决定保留哪条）。
 */
export function detectDuplicates(records: ExpenseRecord[]): Map<string, DuplicateInfo> {
  const result = new Map<string, DuplicateInfo>();
  if (records.length === 0) return result;

  // 1) 精确重复：按交易订单号分组
  const byOrderId = new Map<string, ExpenseRecord[]>();
  for (const record of records) {
    const id = (record.transactionId || '').trim();
    if (!id) continue;
    const bucket = byOrderId.get(id);
    if (bucket) bucket.push(record);
    else byOrderId.set(id, [record]);
  }
  let groupSeq = 0;
  for (const group of byOrderId.values()) {
    if (group.length > 1) {
      const groupId = `dup-${groupSeq++}`;
      for (const record of group) {
        result.set(record.id, { groupId, dupCount: group.length, basis: 'orderId', isDuplicate: true });
      }
    }
  }

  // 2) 模糊重复：订单号组之外的记录做金额 + 时间窗口匹配
  const remaining = records.filter((record) => !result.has(record.id));
  const consumed = new Set<string>();
  for (let i = 0; i < remaining.length; i++) {
    const anchor = remaining[i];
    if (consumed.has(anchor.id)) continue;
    const anchorTime = parseTime(anchor.dateTime);
    if (Number.isNaN(anchorTime)) {
      consumed.add(anchor.id);
      continue;
    }
    const cluster: ExpenseRecord[] = [anchor];
    for (let j = i + 1; j < remaining.length; j++) {
      const candidate = remaining[j];
      if (consumed.has(candidate.id)) continue;
      if (Math.abs(candidate.amount - anchor.amount) > AMOUNT_EPSILON) continue;
      const candidateTime = parseTime(candidate.dateTime);
      if (Number.isNaN(candidateTime)) continue;
      if (Math.abs(candidateTime - anchorTime) > AMOUNT_TIME_WINDOW_MS) continue;
      cluster.push(candidate);
      consumed.add(candidate.id);
    }
    if (cluster.length > 1) {
      const groupId = `dup-${groupSeq++}`;
      for (const record of cluster) {
        result.set(record.id, { groupId, dupCount: cluster.length, basis: 'amountTime', isDuplicate: true });
      }
    }
    consumed.add(anchor.id);
  }

  return result;
}
