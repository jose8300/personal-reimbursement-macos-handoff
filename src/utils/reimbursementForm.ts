import type { ReimbursementRecord } from '../types/expense';

// 结构化报销单（等级三①）：按维度层级分组、每组小计、底部合计，并支持模板化复用。
// 本模块为纯函数，不读写 localStorage、不依赖浏览器全局变量，可在 node 下用 tsx 直接验证。

export type FormGroupDim =
  | 'reimburser'
  | 'project'
  | 'category'
  | 'month'
  | 'sourcePlatform'
  | 'transactionType';

export type FormColumnKey =
  | 'date'
  | 'counterparty'
  | 'productName'
  | 'description'
  | 'amount'
  | 'paymentAccount'
  | 'note'
  | 'sourcePlatform'
  | 'transactionType'
  | 'category'
  | 'project'
  | 'reimburser'
  | 'month';

export type ReimbursementFormTemplate = {
  id: string;
  name: string;
  groupBy: FormGroupDim[];
  columns: FormColumnKey[];
  title?: string;
  remark?: string;
};

export type FormGroup = {
  dim: FormGroupDim | null;
  value: string;
  amount: number;
  count: number;
  records?: ReimbursementRecord[];
  children?: FormGroup[];
};

export type ReimbursementFormModel = {
  title: string;
  generatedAt: string;
  totalAmount: number;
  totalCount: number;
  groups: FormGroup[];
};

export const FORM_DIM_LABELS: Record<FormGroupDim, string> = {
  reimburser: '报销人',
  project: '项目',
  category: '费用类别',
  month: '月份',
  sourcePlatform: '来源平台',
  transactionType: '交易类型',
};

export const FORM_COLUMN_LABELS: Record<FormColumnKey, string> = {
  date: '消费时间',
  counterparty: '交易对方',
  productName: '商品名称',
  description: '报销摘要',
  amount: '报销金额',
  paymentAccount: '支付账户',
  note: '报销备注',
  sourcePlatform: '来源平台',
  transactionType: '交易类型',
  category: '费用类别',
  project: '项目',
  reimburser: '报销人',
  month: '月份',
};

const DEFAULT_COLUMNS: FormColumnKey[] = [
  'date',
  'description',
  'amount',
  'paymentAccount',
  'note',
];

export function defaultFormTemplates(): ReimbursementFormTemplate[] {
  return [
    {
      id: 'preset-by-reimburser-project',
      name: '按报销人 / 项目',
      groupBy: ['reimburser', 'project'],
      columns: DEFAULT_COLUMNS,
      title: '个人报销单（按报销人 / 项目）',
    },
    {
      id: 'preset-by-category-month',
      name: '按费用类别 / 月份',
      groupBy: ['category', 'month'],
      columns: DEFAULT_COLUMNS,
      title: '个人报销单（按费用类别 / 月份）',
    },
  ];
}

function fieldOf(dim: FormGroupDim): keyof ReimbursementRecord {
  return dim as keyof ReimbursementRecord;
}

function sumAmount(records: ReimbursementRecord[]): number {
  return records.reduce((total, record) => total + (record.amount || 0), 0);
}

export function groupReimbursements(
  records: ReimbursementRecord[],
  groupBy: FormGroupDim[],
): FormGroup[] {
  if (groupBy.length === 0) {
    return [
      {
        dim: null,
        value: '全部',
        amount: sumAmount(records),
        count: records.length,
        records: [...records],
      },
    ];
  }

  const [dim, ...rest] = groupBy;
  const buckets = new Map<string, ReimbursementRecord[]>();
  for (const record of records) {
    const raw = record[fieldOf(dim)];
    const key = raw === undefined || raw === null || raw === '' ? '（未填写）' : String(raw);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(record);
    else buckets.set(key, [record]);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([value, bucketRecords]) => {
      const amount = sumAmount(bucketRecords);
      if (rest.length === 0) {
        return { dim, value, amount, count: bucketRecords.length, records: bucketRecords };
      }
      return {
        dim,
        value,
        amount,
        count: bucketRecords.length,
        children: groupReimbursements(bucketRecords, rest),
      };
    });
}

export function buildFormModel(
  records: ReimbursementRecord[],
  template: ReimbursementFormTemplate,
): ReimbursementFormModel {
  const groups = groupReimbursements(records, template.groupBy ?? []);
  return {
    title: template.title || '个人报销单',
    generatedAt: new Date().toISOString(),
    totalAmount: sumAmount(records),
    totalCount: records.length,
    groups,
  };
}

export type FormRow =
  | { kind: 'title'; text: string }
  | { kind: 'group'; depth: number; dim: FormGroupDim | null; value: string; amount: number; count: number }
  | { kind: 'detail'; depth: number; cells: Array<{ key: FormColumnKey; label: string; value: string | number }> }
  | { kind: 'subtotal'; depth: number; amount: number; count: number }
  | { kind: 'grand'; amount: number; count: number };

function detailCells(record: ReimbursementRecord, columns: FormColumnKey[]): Array<{ key: FormColumnKey; label: string; value: string | number }> {
  return columns.map((key) => ({
    key,
    label: FORM_COLUMN_LABELS[key],
    value: key === 'amount' ? (record.amount || 0) : String(record[fieldOf(key as FormGroupDim)] ?? ''),
  }));
}

export function flattenFormRows(model: ReimbursementFormModel, columns: FormColumnKey[]): FormRow[] {
  const rows: FormRow[] = [{ kind: 'title', text: model.title }];

  const walk = (groups: FormGroup[], depth: number) => {
    for (const group of groups) {
      rows.push({ kind: 'group', depth, dim: group.dim, value: group.value, amount: group.amount, count: group.count });
      if (group.records) {
        for (const record of group.records) {
          rows.push({ kind: 'detail', depth: depth + 1, cells: detailCells(record, columns) });
        }
      } else if (group.children) {
        walk(group.children, depth + 1);
      }
      rows.push({ kind: 'subtotal', depth, amount: group.amount, count: group.count });
    }
  };

  walk(model.groups, 0);
  rows.push({ kind: 'grand', amount: model.totalAmount, count: model.totalCount });
  return rows;
}
