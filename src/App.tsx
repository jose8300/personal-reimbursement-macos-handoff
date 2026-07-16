import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react';
import * as Popover from '@radix-ui/react-popover';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  FileSpreadsheet,
  Trash2,
  Upload,
} from 'lucide-react';
import './App.css';
import { shareState, parseSharedCode, getStateFromHash, clearStateHash, collectLocalData } from './utils/stateShare';
import { encryptBackup, decryptBackup, downloadText } from './utils/encryptedBackup';

// 由 vite.config.ts 的 define 在构建时注入（版本号与构建时间）
declare const __APP_VERSION__: string;
declare const __APP_BUILD_TIME__: string;
import { holidayRanges } from './config/holidayWindows';
import type { ExpenseRecord, ParseSummary } from './types/expense';
import { classifyExpenseRecord, fillMissingClassification } from './utils/classifyExpense';
import { exportReimbursementsAsCsv, exportReimbursementsAsXlsx, exportStructuredFormAsXlsx, toReimbursementRecords } from './utils/exporters';
import { formatCurrency, getDateOnly, getMonth, getWeekdayLabel, normalizeDateInput, parseAmount } from './utils/format';
import {
  applyAutoReimbursementRules,
  autoReimbursementRules,
  getAutoRuleDisplayList,
  isBuiltinRuleId,
  recordMatchesAnyAutoReimbursementRule,
  type AutoReimbursementRuleId,
  type CustomAutoRule,
} from './utils/initialReimbursementSelection';
import {
  applyBoundarySuggestion,
  buildRuleLabelMap,
  findBoundaryCases,
  getRecordInsight,
  previewAutoRuleImpact,
  suggestRulesFromBehavior,
  type BoundaryCase,
  type BehaviorRuleSuggestion,
} from './utils/selectionInsight';
import { changelog } from './changelog';
import {
  buildFormModel,
  defaultFormTemplates,
  flattenFormRows,
  FORM_COLUMN_LABELS,
  FORM_DIM_LABELS,
  type FormColumnKey,
  type FormGroupDim,
  type ReimbursementFormTemplate,
} from './utils/reimbursementForm';
import { Footer } from './components/Footer';
import { parseBillFiles } from './utils/parseBills';
import {
  addDays,
  createMonthSelectOptions,
  dateToTime,
  getRecordText,
  getRecordReimbursementMonth,
  insertAfter,
  isAdjustedWorkday,
  pushVersion,
  isLegalHolidayDate,
  reorderItem,
  valueMatchesFilter,
} from './utils/appHelpers';
import { parseReimbursementResultFiles } from './utils/parseReimbursementResults';
import { toFeishuSyncItem } from './utils/reimbursementSync';

const projectOptions = ['客户招待', '客户项目', '内部运营', '差旅', '市场活动', '其他'];
const categoryOptions = ['交通', '餐饮', '住宿', '办公用品', '通讯', '软件服务', '其他'];
const reimburserOptions = ['Musk', '虾叔'];
const lastReimbursementResultFile = '个人报销表-2026-06-02.xlsx';
type ColumnFilterKey =
  | 'sourcePlatform'
  | 'weekday'
  | 'transactionType'
  | 'counterparty'
  | 'productName'
  | 'billRemark'
  | 'paymentAccount';
type ColumnFilterMode = 'include' | 'exclude';
type AmountSortMode = 'none' | 'asc' | 'desc';
type ColumnFilterValue = {
  mode: ColumnFilterMode;
  values: string[];
};
type FeishuSyncResult = {
  ok: boolean;
  created: number;
  updated: number;
  failed: number;
  failures?: Array<{ syncId: string; message: string }>;
};
type ExpenseColumnKey =
  | 'actions'
  | 'company'
  | 'dateTime'
  | 'weekday'
  | 'amount'
  | 'transactionType'
  | 'counterparty'
  | 'productName'
  | 'billRemark'
  | 'paymentAccount'
  | 'sourcePlatform'
  | 'project'
  | 'category'
  | 'note';
type ResultColumnKey =
  | 'remove'
  | 'month'
  | 'date'
  | 'weekday'
  | 'reimburser'
  | 'project'
  | 'category'
  | 'transactionType'
  | 'counterparty'
  | 'productName'
  | 'billRemark'
  | 'description'
  | 'amount'
  | 'paymentAccount'
  | 'sourcePlatform'
  | 'note';

const columnFilterLabels: Record<ColumnFilterKey, string> = {
  sourcePlatform: '来源平台',
  weekday: '星期',
  transactionType: '交易类型/来源',
  counterparty: '交易对方',
  productName: '商品名称',
  billRemark: '备注',
  paymentAccount: '支付账户',
};
const columnFilterKeys = Object.keys(columnFilterLabels) as ColumnFilterKey[];
const legalHolidayAndWeekendLabel = '法定节假日及周末';
const weekdayOrder = ['工作日', legalHolidayAndWeekendLabel, '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const workdayValues = ['周一', '周二', '周三', '周四', '周五'];
const weekendValues = ['周六', '周日'];
const defaultExpenseColumnOrder: ExpenseColumnKey[] = [
  'actions',
  'company',
  'sourcePlatform',
  'dateTime',
  'weekday',
  'amount',
  'productName',
  'transactionType',
  'counterparty',
  'billRemark',
  'paymentAccount',
  'project',
  'category',
  'note',
];
const expenseColumnLabels: Record<ExpenseColumnKey, string> = {
  actions: '操作',
  company: '公司',
  dateTime: '消费时间',
  weekday: '星期',
  amount: '金额',
  transactionType: '交易类型/来源',
  counterparty: '交易对方',
  productName: '商品名称',
  billRemark: '备注',
  paymentAccount: '支付账户',
  sourcePlatform: '平台',
  project: '报销项目',
  category: '费用类别',
  note: '报销备注',
};
const defaultResultColumnOrder: ResultColumnKey[] = [
  'remove',
  'description',
  'amount',
  'date',
  'weekday',
  'reimburser',
  'note',
  'project',
  'category',
  'sourcePlatform',
  'paymentAccount',
  'counterparty',
  'productName',
  'transactionType',
  'month',
];
const resultColumnLabels: Record<ResultColumnKey, string> = {
  remove: '操作',
  month: '月份',
  date: '消费时间',
  weekday: '星期',
  reimburser: '报销人',
  project: '报销项目',
  category: '费用类别',
  transactionType: '交易类型/来源',
  counterparty: '交易对方',
  productName: '商品名称',
  billRemark: '备注',
  description: '报销摘要',
  amount: '报销金额',
  paymentAccount: '支付账户',
  sourcePlatform: '来源平台',
  note: '报销备注',
};
type ResultFilterKey =
  | 'weekday'
  | 'project'
  | 'sourcePlatform'
  | 'counterparty'
  | 'productName'
  | 'transactionType';
const resultFilterKeys: ResultFilterKey[] = [
  'weekday',
  'project',
  'sourcePlatform',
  'counterparty',
  'productName',
  'transactionType',
];
type ResultExcludeRuleId = 'holidayWeekendHighwayTravel';
type ResultExcludeRule = {
  id: ResultExcludeRuleId;
  label: string;
  description: string;
};
const resultExcludeRules: ResultExcludeRule[] = [
  {
    id: 'holidayWeekendHighwayTravel',
    label: '节假日前后高速',
    description: '法定节假日及周末，含前后各 2 天内的高速差旅费',
  },
];
const highwayExpenseKeywords = ['高速', '高速公路', '通行费', '过路费', 'etc'];
const localProgressDraftKey = 'personal-reimbursement-progress-v1';
const localProgressVersionsKey = 'personal-reimbursement-progress-versions-v1';
const localCustomRulesKey = 'personal-reimbursement-custom-rules-v1';
const localFormTemplatesKey = 'personal-reimbursement-form-templates-v1';
const MAX_PROGRESS_VERSIONS = 24;
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;

function createEmptyResultExcludeHistory() {
  return resultExcludeRules.reduce(
    (history, rule) => ({
      ...history,
      [rule.id]: [],
    }),
    {} as Record<ResultExcludeRuleId, string[][]>,
  );
}

type LocalProgressDraft = {
  savedAt: string;
  records: ExpenseRecord[];
  summaries: ParseSummary[];
  activeTab: 'upload' | 'filter' | 'result';
  monthFilter: ColumnFilterValue;
  monthQuery: string;
  columnFilters: Record<ColumnFilterKey, ColumnFilterValue>;
  filterQueries: Record<ColumnFilterKey, string>;
  amountSort: AmountSortMode;
  expenseColumnOrder: ExpenseColumnKey[];
  hiddenExpenseColumnKeys: ExpenseColumnKey[];
  resultColumnOrder: ResultColumnKey[];
  hiddenResultColumnKeys: ResultColumnKey[];
  resultAmountSort: AmountSortMode;
  resultFilters: Record<ResultFilterKey, ColumnFilterValue>;
  resultFilterQueries: Record<ResultFilterKey, string>;
  hideBankWalletRecords: boolean;
  selectedAutoRuleIds: AutoReimbursementRuleId[];
  selectedResultExcludeRuleIds: ResultExcludeRuleId[];
  resultExcludeHistory: Record<ResultExcludeRuleId, string[][]>;
  customRules: CustomAutoRule[];
};

type LocalProgressDraftInfo = {
  savedAt: string;
  recordCount: number;
  selectedCount: number;
};

type ProgressVersion = {
  id: string;
  savedAt: string;
  recordCount: number;
  selectedCount: number;
  kind: 'auto' | 'manual';
};

function readLocalProgressDraft() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(localProgressDraftKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalProgressDraft;
  } catch {
    return null;
  }
}

function getLocalProgressDraftInfo() {
  const draft = readLocalProgressDraft();
  if (!draft) return null;
  return {
    savedAt: draft.savedAt,
    recordCount: draft.records.length,
    selectedCount: draft.records.filter((record) => record.isCompanyExpense).length,
  };
}

function formatSavedAt(savedAt: string) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function readProgressVersions(): ProgressVersion[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(localProgressVersionsKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProgressVersion[]) : [];
  } catch {
    return [];
  }
}

function writeProgressVersions(versions: ProgressVersion[]) {
  try {
    window.localStorage.setItem(localProgressVersionsKey, JSON.stringify(versions));
  } catch {
    // 本地存储空间不足时静默忽略，不影响主草稿保存
  }
}

function readCustomRules(): CustomAutoRule[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(localCustomRulesKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as CustomAutoRule[]).filter(
          (r) => r.id && r.label && Array.isArray(r.keywords),
        )
      : [];
  } catch {
    return [];
  }
}

function writeCustomRules(rules: CustomAutoRule[]) {
  try {
    window.localStorage.setItem(localCustomRulesKey, JSON.stringify(rules));
  } catch {
    // 静默忽略
  }
}

function readFormTemplates(): ReimbursementFormTemplate[] {
  if (typeof window === 'undefined') return defaultFormTemplates();
  const raw = window.localStorage.getItem(localFormTemplatesKey);
  if (!raw) return defaultFormTemplates();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultFormTemplates();
    return (parsed as ReimbursementFormTemplate[]).filter(
      (t) => t.id && t.name && Array.isArray(t.groupBy) && Array.isArray(t.columns),
    );
  } catch {
    return defaultFormTemplates();
  }
}

function writeFormTemplates(templates: ReimbursementFormTemplate[]) {
  try {
    window.localStorage.setItem(localFormTemplatesKey, JSON.stringify(templates));
  } catch {
    // 静默忽略
  }
}

// 需要随备份一起导出的本地存储键（进度草稿 / 版本历史 / 自定义规则 / 结构化报销单模板）
const BACKUP_KEYS = [
  localProgressDraftKey,
  localProgressVersionsKey,
  localCustomRulesKey,
  localFormTemplatesKey,
];

// 跨源迁移：把当前源的本地进度导出为 JSON 文件，并尝复制到剪贴板兜底
function exportLocalBackup() {
  if (typeof window === 'undefined') return;
  const data: Record<string, string | null> = {};
  for (const key of BACKUP_KEYS) {
    data[key] = window.localStorage.getItem(key);
  }
  const payload = {
    app: 'personal-reimbursement',
    schema: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `报销进度备份-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  try {
    navigator.clipboard?.writeText(json);
  } catch {
    // 剪贴板不可用时忽略，文件已下载
  }
  toast.success('已导出本地进度备份（文件已下载，并尝复制到剪贴板）');
}

// 跨源迁移 / 分享恢复：把解析出的本地键映射写回 localStorage 并刷新
async function applySharedData(data: Record<string, string | null>, skipConfirm = false) {
  if (typeof window === 'undefined') return;
  if (!skipConfirm && !window.confirm('导入备份会覆盖当前网站的本地进度，确定继续吗？')) return;
  let count = 0;
  for (const key of BACKUP_KEYS) {
    const value = data[key];
    if (typeof value === 'string') {
      try {
        window.localStorage.setItem(key, value);
        count += 1;
      } catch {
        // 单键失败忽略
      }
    }
  }
  if (count === 0) {
    toast.error('备份中未找到可恢复的数据');
    return;
  }
  toast.success(`已导入 ${count} 项本地数据，即将刷新页面…`);
  window.setTimeout(() => window.location.reload(), 700);
}

// 从文本恢复：支持分享码（PR1: 前缀）或原有 JSON 备份
async function applyImportFromText(text: string) {
  if (typeof window === 'undefined') return;
  const trimmed = text.trim();
  if (trimmed.startsWith('PR1:')) {
    const data = await parseSharedCode(trimmed);
    if (!data) {
      toast.error('分享码无法解析或已损坏');
      return;
    }
    await applySharedData(data);
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    toast.error('备份格式不正确：不是有效的 JSON');
    return;
  }
  const data = (payload as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data !== 'object') {
    toast.error('备份格式不正确：缺少 data 字段');
    return;
  }
  await applySharedData(data as Record<string, string | null>);
}

// 从文件导入（隐藏 file input 触发）
async function importLocalBackup(file: File) {
  applyImportFromText(await file.text());
}

// 从剪贴板导入（导出/分享时已复制到剪贴板，新站点点导入即可，无需下载文件）
function importFromClipboard(text: string) {
  applyImportFromText(text);
}

// 分享进度：生成可分享链接或分享码并复制到剪贴板
async function shareProgress() {
  const kind = await shareState();
  if (kind === 'url') {
    toast.success('已生成分享链接并复制，发给别人打开即恢复进度');
  } else {
    toast.success('进度已压缩为分享码并复制，粘贴到新设备「导入备份」即可恢复');
  }
}

// 加密备份：口令加密后导出文件（无口令无法打开）
async function exportEncrypted() {
  const pwd = window.prompt('设置加密口令（恢复时必须输入，请牢记）：');
  if (!pwd) return;
  const data = collectLocalData();
  const payload = await encryptBackup(data, pwd);
  downloadText(`报销进度加密备份-${new Date().toISOString().slice(0, 10)}.json`, payload);
  toast.success('已导出加密备份文件，请妥善保管（无口令无法打开）');
}

// 加密备份恢复：选文件 + 口令解密
async function importEncryptedFile(file: File) {
  const text = await file.text();
  if (!text.trimStart().startsWith('ENC1:')) {
    toast.error('这不是加密备份文件');
    return;
  }
  const pwd = window.prompt('输入加密口令：');
  if (!pwd) return;
  const data = await decryptBackup(text, pwd);
  if (!data) {
    toast.error('口令错误或备份已损坏');
    return;
  }
  await applySharedData(data);
}

function createProgressVersion(kind: ProgressVersion['kind'], recordCount: number, selectedCount: number): ProgressVersion {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, savedAt: new Date().toISOString(), recordCount, selectedCount, kind };
}

function createEmptyResultFilters(): Record<ResultFilterKey, ColumnFilterValue> {
  return resultFilterKeys.reduce(
    (filters, key) => ({
      ...filters,
      [key]: { mode: 'include', values: [] },
    }),
    {} as Record<ResultFilterKey, ColumnFilterValue>,
  );
}

function createEmptyResultFilterQueries(): Record<ResultFilterKey, string> {
  return Object.fromEntries(resultFilterKeys.map((key) => [key, ''])) as Record<ResultFilterKey, string>;
}

function createEmptyColumnFilters(): Record<ColumnFilterKey, ColumnFilterValue> {
  return columnFilterKeys.reduce(
    (filters, key) => ({
      ...filters,
      [key]: { mode: 'include', values: [] },
    }),
    {} as Record<ColumnFilterKey, ColumnFilterValue>,
  );
}

function createEmptyFilterQueries(): Record<ColumnFilterKey, string> {
  return Object.fromEntries(columnFilterKeys.map((key) => [key, ''])) as Record<ColumnFilterKey, string>;
}

function getWeekdayDisplay(dateTime: string) {
  const weekday = getWeekdayLabel(dateTime);
  if (!weekday) return '';
  if (isLegalHolidayDate(dateTime)) return `${weekday}(休)`;
  if (weekendValues.includes(weekday) && isAdjustedWorkday(dateTime)) return `${weekday}(班)`;
  return weekday;
}

function renderWeekdayContent(dateTime: string) {
  const display = getWeekdayDisplay(dateTime);
  if (!display) return '-';
  const holidayMatch = display.match(/^(.+)\(休\)$/);
  if (holidayMatch) {
    return (
      <>
        {holidayMatch[1]}
        <span className="weekday-holiday-tag">休</span>
      </>
    );
  }
  return display;
}

function isNearLegalHoliday(date: string, bufferDays: number) {
  const time = dateToTime(date);
  if (Number.isNaN(time)) return false;
  return holidayRanges.some((range) => {
    const start = dateToTime(addDays(range.start, -bufferDays));
    const end = dateToTime(addDays(range.end, bufferDays));
    return time >= start && time <= end;
  });
}

function isNearWeekend(dateTime: string, bufferDays: number) {
  const date = getDateOnly(dateTime);
  return Array.from({ length: bufferDays * 2 + 1 }, (_, index) => index - bufferDays).some((offset) =>
    weekendValues.includes(getWeekdayLabel(addDays(date, offset))),
  );
}

function isHighwayTravelExpense(record: ExpenseRecord) {
  const text = getRecordText(record);
  const classification = classifyExpenseRecord(record);
  const isHighway = highwayExpenseKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
  const isTravel = record.project === '差旅' || record.category === '交通' || classification.category === '交通';
  return isHighway && isTravel;
}

function recordMatchesResultExcludeRule(record: ExpenseRecord, ruleId: ResultExcludeRuleId) {
  switch (ruleId) {
    case 'holidayWeekendHighwayTravel': {
      const date = getDateOnly(record.dateTime);
      return (isNearLegalHoliday(date, 2) || isNearWeekend(record.dateTime, 2)) && isHighwayTravelExpense(record);
    }
    default:
      return false;
  }
}

function recordMatchesAnyResultExcludeRule(record: ExpenseRecord, ruleIds: ResultExcludeRuleId[]) {
  return ruleIds.some((ruleId) => recordMatchesResultExcludeRule(record, ruleId));
}

function valueMatchesWeekdayFilter(record: ExpenseRecord, value: string, filter: ColumnFilterValue) {
  if (!filter.values.length) return true;
  const selectedValues = new Set(filter.values);
  const isLegalHolidayOrWeekend = weekendValues.includes(value) || isLegalHolidayDate(record.dateTime);
  const isSelected =
    selectedValues.has(value) ||
    (selectedValues.has('工作日') && workdayValues.includes(value)) ||
    (selectedValues.has(legalHolidayAndWeekendLabel) && isLegalHolidayOrWeekend) ||
    (selectedValues.has('周末') && isLegalHolidayOrWeekend);
  return filter.mode === 'include' ? isSelected : !isSelected;
}

function getColumnFilterValue(record: ExpenseRecord, key: ColumnFilterKey) {
  if (key === 'weekday') return getWeekdayLabel(record.dateTime);
  return String(record[key] || '').trim();
}

function getResultFilterValue(record: ExpenseRecord, key: ResultFilterKey) {
  if (key === 'weekday') return getWeekdayLabel(record.dateTime);
  return String(record[key] || '').trim();
}

function recordMatchesResultFilters(
  record: ExpenseRecord,
  filters: Record<ResultFilterKey, ColumnFilterValue>,
  excludeKey?: ResultFilterKey,
) {
  return resultFilterKeys.every((key) => {
    if (excludeKey === key) return true;
    const value = getResultFilterValue(record, key);
    const filter = filters[key] ?? { mode: 'include', values: [] };
    return key === 'weekday'
      ? valueMatchesWeekdayFilter(record, value, filter)
      : valueMatchesFilter(value, filter);
  });
}

function isBankWalletMirrorRecord(record: ExpenseRecord) {
  if (record.sourcePlatform !== '银行卡') return false;
  const bankText = [record.transactionType, record.counterparty, record.merchant, record.billRemark].join(' ');
  return /财付通|支付宝/.test(bankText);
}

function recordMatchesFilters(
  record: ExpenseRecord,
  monthFilter: ColumnFilterValue,
  columnFilters: Record<ColumnFilterKey, ColumnFilterValue>,
  excludeKey?: ColumnFilterKey | 'month',
) {
  const matchesMonth =
    excludeKey === 'month' || valueMatchesFilter(getMonth(record.dateTime), monthFilter);
  const matchesColumns = columnFilterKeys.every((key) => {
    if (excludeKey === key) return true;
    const value = getColumnFilterValue(record, key);
    return key === 'weekday'
      ? valueMatchesWeekdayFilter(record, value, columnFilters[key])
      : valueMatchesFilter(value, columnFilters[key]);
  });
  return matchesMonth && matchesColumns;
}

function getCurrentDateTimeValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:00`;
}

function formatDateForTable(dateTime: string) {
  const normalized = normalizeDateInput(dateTime).replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return String(dateTime || '').replace(/-/g, '/');

  const [, year, month, day] = match;
  return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
}

function fromTableDateValue(value: string, fallback: string) {
  const raw = value.trim();
  if (!raw) return fallback || getCurrentDateTimeValue();

  const match = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return fallback;

  const fallbackTime = normalizeDateInput(fallback).match(/[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/) ?? [];
  const [, year, month, day] = match;
  const [, hour = '00', minute = '00', second = '00'] = fallbackTime;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
}

function createManualCreditCardRecord(isCompanyExpense: boolean): ExpenseRecord {
  const dateTime = getCurrentDateTimeValue();
  const id = `manual-credit-card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    sourceFile: '手动录入',
    sourcePlatform: '信用卡',
    originalRowNumber: 1,
    raw: { manual: true },
    dateTime,
    amount: 0,
    merchant: '',
    transactionType: '手动录入',
    counterparty: '',
    productName: '',
    billRemark: '',
    paymentAccount: '',
    isCompanyExpense,
    reimbursementMonth: getMonth(dateTime),
    reimburser: 'Musk',
    project: '',
    category: '',
    note: '',
  };
}

function App() {
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [summaries, setSummaries] = useState<ParseSummary[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [monthFilter, setMonthFilter] = useState<ColumnFilterValue>({ mode: 'include', values: [] });
  const [monthQuery, setMonthQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<ColumnFilterKey, ColumnFilterValue>>(
    createEmptyColumnFilters,
  );
  const [filterQueries, setFilterQueries] = useState<Record<ColumnFilterKey, string>>(createEmptyFilterQueries);
  const [openFilterKey, setOpenFilterKey] = useState<ColumnFilterKey | 'month' | null>(null);
  const [amountSort, setAmountSort] = useState<AmountSortMode>('none');
  const [expenseColumnOrder, setExpenseColumnOrder] = useState<ExpenseColumnKey[]>(defaultExpenseColumnOrder);
  const [hiddenExpenseColumnKeys, setHiddenExpenseColumnKeys] = useState<ExpenseColumnKey[]>([]);
  const [draggedColumnKey, setDraggedColumnKey] = useState<ExpenseColumnKey | null>(null);
  const [resultColumnOrder, setResultColumnOrder] = useState<ResultColumnKey[]>(defaultResultColumnOrder);
  const [hiddenResultColumnKeys, setHiddenResultColumnKeys] = useState<ResultColumnKey[]>([]);
  const [draggedResultColumnKey, setDraggedResultColumnKey] = useState<ResultColumnKey | null>(null);
  const [resultAmountSort, setResultAmountSort] = useState<AmountSortMode>('none');
  const [resultFilters, setResultFilters] = useState<Record<ResultFilterKey, ColumnFilterValue>>(
    createEmptyResultFilters,
  );
  const [resultFilterQueries, setResultFilterQueries] =
    useState<Record<ResultFilterKey, string>>(createEmptyResultFilterQueries);
  const [openResultFilterKey, setOpenResultFilterKey] = useState<ResultFilterKey | null>(null);
  const [isBulkReimburserMenuOpen, setIsBulkReimburserMenuOpen] = useState(false);
  const [isAutoRuleMenuOpen, setIsAutoRuleMenuOpen] = useState(false);
  const [isResultExcludeRuleMenuOpen, setIsResultExcludeRuleMenuOpen] = useState(false);
  const [isSyncingFeishu, setIsSyncingFeishu] = useState(false);
  const [feishuSyncResult, setFeishuSyncResult] = useState<FeishuSyncResult | null>(null);
  const [feishuSyncError, setFeishuSyncError] = useState('');
  const [hideBankWalletRecords, setHideBankWalletRecords] = useState(true);
  const [activeTab, setActiveTab] = useState<'upload' | 'filter' | 'result'>('upload');
  const [selectedAutoRuleIds, setSelectedAutoRuleIds] = useState<AutoReimbursementRuleId[]>(
    autoReimbursementRules.map((rule) => rule.id),
  );
  const [customRules, setCustomRules] = useState<CustomAutoRule[]>(readCustomRules);
  const [newCustomLabel, setNewCustomLabel] = useState('');
  const [newCustomKeywords, setNewCustomKeywords] = useState('');
  const [batchRemarkValue, setBatchRemarkValue] = useState('');
  const [selectedResultExcludeRuleIds, setSelectedResultExcludeRuleIds] = useState<ResultExcludeRuleId[]>(
    resultExcludeRules.map((rule) => rule.id),
  );
  const [resultExcludeHistory, setResultExcludeHistory] = useState<Record<ResultExcludeRuleId, string[][]>>(
    createEmptyResultExcludeHistory(),
  );
  const autoRuleListRef = useRef<HTMLDivElement>(null);

  // 等级二：边界复核展开状态 + 已忽略的边界/建议项
  const [showBoundaryReview, setShowBoundaryReview] = useState(false);
  const [dismissedBoundaryIds, setDismissedBoundaryIds] = useState<Set<string>>(new Set());
  const [dismissedSuggestionKeywords, setDismissedSuggestionKeywords] = useState<Set<string>>(new Set());

  // 等级三①：结构化报销单
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [formTemplates, setFormTemplates] = useState<ReimbursementFormTemplate[]>(readFormTemplates);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    () => readFormTemplates()[0]?.id ?? '',
  );
  const [formGroupBy, setFormGroupBy] = useState<FormGroupDim[]>(
    () => readFormTemplates()[0]?.groupBy ?? [],
  );
  const [formColumns, setFormColumns] = useState<FormColumnKey[]>(
    () => readFormTemplates()[0]?.columns ?? [],
  );
  const [selectedResultRowIds, setSelectedResultRowIds] = useState<Set<string>>(new Set());
  const [newTemplateName, setNewTemplateName] = useState('');

  const [localProgressInfo, setLocalProgressInfo] = useState<LocalProgressDraftInfo | null>(
    getLocalProgressDraftInfo,
  );
  const [localProgressMessage, setLocalProgressMessage] = useState('');
  const [progressVersions, setProgressVersions] = useState<ProgressVersion[]>(readProgressVersions);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const visibleExpenseColumnOrder = useMemo(
    () => expenseColumnOrder.filter((columnKey) => !hiddenExpenseColumnKeys.includes(columnKey)),
    [expenseColumnOrder, hiddenExpenseColumnKeys],
  );
  const visibleResultColumnOrder = useMemo(
    () => insertAfter(resultColumnOrder, 'date', 'weekday').filter((columnKey) => !hiddenResultColumnKeys.includes(columnKey)),
    [resultColumnOrder, hiddenResultColumnKeys],
  );

  const visibleRecords = useMemo(
    () => (hideBankWalletRecords ? records.filter((record) => !isBankWalletMirrorRecord(record)) : records),
    [records, hideBankWalletRecords],
  );
  const hiddenBankWalletCount = records.length - visibleRecords.length;

  const months = useMemo(
    () =>
      Array.from(
        new Set(
          visibleRecords
            .filter((record) => recordMatchesFilters(record, monthFilter, columnFilters, 'month'))
            .map((record) => getMonth(record.dateTime))
            .filter(Boolean),
        ),
      ).sort(),
    [visibleRecords, monthFilter, columnFilters],
  );
  const columnFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        columnFilterKeys.map((key) => {
          const options = Array.from(
            new Set(
              visibleRecords
                .filter((record) => recordMatchesFilters(record, monthFilter, columnFilters, key))
                .map((record) => getColumnFilterValue(record, key))
                .filter(Boolean),
            ),
          );
          return [
            key,
            key === 'weekday'
              ? weekdayOrder.filter(
                  (option) => option === '工作日' || option === legalHolidayAndWeekendLabel || options.includes(option),
                )
              : options.sort((a, b) => a.localeCompare(b, 'zh-CN')),
          ];
        }),
      ) as Record<ColumnFilterKey, string[]>,
    [visibleRecords, monthFilter, columnFilters],
  );

  const filteredRecords = useMemo(() => {
    return visibleRecords.filter((record) => recordMatchesFilters(record, monthFilter, columnFilters));
  }, [visibleRecords, monthFilter, columnFilters]);

  const displayRules = useMemo(() => getAutoRuleDisplayList(customRules), [customRules]);

  function addCustomRule() {
    const label = newCustomLabel.trim();
    const keywords = newCustomKeywords
      .split(/[,，、\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (!label || !keywords.length) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rule: CustomAutoRule = { id, label, keywords };
    const next = [...customRules, rule];
    setCustomRules(next);
    writeCustomRules(next);
    setSelectedAutoRuleIds((prev) => [...prev, id]);
    setNewCustomLabel('');
    setNewCustomKeywords('');
  }

  function deleteCustomRule(id: string) {
    const next = customRules.filter((r) => r.id !== id);
    setCustomRules(next);
    writeCustomRules(next);
    setSelectedAutoRuleIds((prev) => prev.filter((rid) => rid !== id));
  }

  const hasActiveFilters = useMemo(() => {
    if (monthFilter.values.length > 0 || monthQuery.trim()) return true;
    if (amountSort !== 'none') return true;
    if (!hideBankWalletRecords) return true;
    return Object.values(columnFilters).some((f) => f.values.length > 0);
  }, [monthFilter, monthQuery, amountSort, hideBankWalletRecords, columnFilters]);
  const sortedFilteredRecords = useMemo(() => {
    if (amountSort === 'none') return filteredRecords;
    return [...filteredRecords].sort((a, b) =>
      amountSort === 'asc' ? a.amount - b.amount : b.amount - a.amount,
    );
  }, [filteredRecords, amountSort]);

  const displayExpenseRecords = useMemo(() => {
    if (!showOnlySelected) return sortedFilteredRecords;
    return sortedFilteredRecords.filter((record) => record.isCompanyExpense);
  }, [sortedFilteredRecords, showOnlySelected]);
  const autoRuleMatchedCount = useMemo(
    () =>
      filteredRecords.filter((record) =>
        recordMatchesAnyAutoReimbursementRule(record, selectedAutoRuleIds, customRules),
      ).length,
    [filteredRecords, selectedAutoRuleIds, customRules],
  );
  const autoRuleMatchCounts = useMemo(
    () =>
      Object.fromEntries(
        displayRules.map((rule) => [
          rule.id,
          filteredRecords.filter((record) =>
            recordMatchesAnyAutoReimbursementRule(record, [rule.id], customRules),
          ).length,
        ]),
      ) as Record<AutoReimbursementRuleId, number>,
    [filteredRecords, displayRules, customRules],
  );

  // 等级二派生：规则标签映射（供命中理由展示）
  const ruleLabelMap = useMemo(() => buildRuleLabelMap(customRules), [customRules]);

  // 等级二派生：每条记录的判定洞察（命中理由 + 置信度）
  const insightById = useMemo(() => {
    const map: Record<string, ReturnType<typeof getRecordInsight>> = {};
    for (const record of records) {
      map[record.id] = getRecordInsight(record, selectedAutoRuleIds, customRules, ruleLabelMap);
    }
    return map;
  }, [records, selectedAutoRuleIds, customRules, ruleLabelMap]);

  // 等级二派生：一键筛入的规则影响面预览
  const autoRuleImpact = useMemo(
    () => previewAutoRuleImpact(filteredRecords, selectedAutoRuleIds, customRules),
    [filteredRecords, selectedAutoRuleIds, customRules],
  );

  // 等级二派生：边界主动复核候选
  const boundaryCasesAll = useMemo(
    () => findBoundaryCases(records, selectedAutoRuleIds, customRules, ruleLabelMap, 20),
    [records, selectedAutoRuleIds, customRules, ruleLabelMap],
  );
  const boundaryCases = useMemo(
    () => boundaryCasesAll.filter((item) => !dismissedBoundaryIds.has(item.record.id)),
    [boundaryCasesAll, dismissedBoundaryIds],
  );

  // 等级二派生：从行为学归纳的候选规则
  const behaviorSuggestionsAll = useMemo(
    () => suggestRulesFromBehavior(records, customRules),
    [records, customRules],
  );
  const behaviorSuggestions = useMemo(
    () => behaviorSuggestionsAll.filter((item) => !dismissedSuggestionKeywords.has(item.keyword)),
    [behaviorSuggestionsAll, dismissedSuggestionKeywords],
  );

  function applyBoundaryCase(item: BoundaryCase) {
    updateRecord(item.record.id, applyBoundarySuggestion(item.record, item.suggestedAction));
    setDismissedBoundaryIds((prev) => new Set(prev).add(item.record.id));
  }

  function dismissBoundaryCase(item: BoundaryCase) {
    setDismissedBoundaryIds((prev) => new Set(prev).add(item.record.id));
  }

  function saveBehaviorSuggestion(suggestion: BehaviorRuleSuggestion) {
    const label = suggestion.keyword;
    const keywords = [suggestion.keyword];
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rule: CustomAutoRule = { id, label, keywords };
    const next = [...customRules, rule];
    setCustomRules(next);
    writeCustomRules(next);
    setSelectedAutoRuleIds((prev) => [...prev, id]);
    setDismissedSuggestionKeywords((prev) => new Set(prev).add(suggestion.keyword));
    toast.success(`已存为规则：${label}`);
  }

  const reimbursements = useMemo(() => toReimbursementRecords(records), [records]);

  // 等级三①：结构化报销单模型（由当前可报销记录 + 选中模板派生）
  const activeTemplate = useMemo(
    () => formTemplates.find((t) => t.id === activeTemplateId) ?? formTemplates[0],
    [formTemplates, activeTemplateId],
  );
  const formModel = useMemo(
    () =>
      buildFormModel(reimbursements, {
        ...(activeTemplate ?? defaultFormTemplates()[0]),
        groupBy: formGroupBy,
        columns: formColumns,
      }),
    [reimbursements, activeTemplate, formGroupBy, formColumns],
  );
  const selectedRecords = records.filter((record) => record.isCompanyExpense);
  const filteredSelectedRecords = useMemo(
    () =>
      selectedRecords.filter((record) => recordMatchesResultFilters(record, resultFilters)),
    [selectedRecords, resultFilters],
  );
  const sortedResultRecords = useMemo(() => {
    if (resultAmountSort === 'none') return filteredSelectedRecords;
    return [...filteredSelectedRecords].sort((a, b) =>
      resultAmountSort === 'asc' ? a.amount - b.amount : b.amount - a.amount,
    );
  }, [filteredSelectedRecords, resultAmountSort]);
  const resultExcludeMatchedCount = useMemo(
    () =>
      filteredSelectedRecords.filter((record) =>
        recordMatchesAnyResultExcludeRule(record, selectedResultExcludeRuleIds),
      ).length,
    [filteredSelectedRecords, selectedResultExcludeRuleIds],
  );
  const resultExcludeRuleMatchCounts = useMemo(
    () =>
      Object.fromEntries(
        resultExcludeRules.map((rule) => [
          rule.id,
          filteredSelectedRecords.filter((record) => recordMatchesAnyResultExcludeRule(record, [rule.id])).length,
        ]),
      ) as Record<ResultExcludeRuleId, number>,
    [filteredSelectedRecords],
  );
  const resultFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        resultFilterKeys.map((key) => {
          const options = Array.from(
            new Set(
              selectedRecords
                .filter((record) => recordMatchesResultFilters(record, resultFilters, key))
                .map((record) => getResultFilterValue(record, key))
                .filter(Boolean),
            ),
          );
          return [
            key,
            key === 'weekday'
              ? weekdayOrder.filter(
                  (option) => option === '工作日' || option === legalHolidayAndWeekendLabel || options.includes(option),
                )
              : options.sort((a, b) => a.localeCompare(b, 'zh-CN')),
          ];
        }),
      ) as Record<ResultFilterKey, string[]>,
    [selectedRecords, resultFilters],
  );
  const resultMonthOptions = useMemo(() => createMonthSelectOptions(records), [records]);
  const bulkReimburserValue = useMemo(() => {
    const values = Array.from(new Set(selectedRecords.map((record) => record.reimburser || 'Musk')));
    return values.length === 1 ? values[0] : '';
  }, [selectedRecords]);
  const totalAmount = selectedRecords.reduce((sum, record) => sum + record.amount, 0);
  const filteredSelectedCount = filteredRecords.filter((record) => record.isCompanyExpense).length;

  useEffect(() => {
    if (
      !openFilterKey &&
      !openResultFilterKey &&
      !isBulkReimburserMenuOpen &&
      !isAutoRuleMenuOpen &&
      !isResultExcludeRuleMenuOpen
    ) return;

    function closeFilterOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.filter-menu, .filter-trigger, .bulk-menu, .auto-rule-control, .auto-rule-menu')) return;
      setOpenFilterKey(null);
      setOpenResultFilterKey(null);
      setIsBulkReimburserMenuOpen(false);
      setIsAutoRuleMenuOpen(false);
      setIsResultExcludeRuleMenuOpen(false);
    }

    document.addEventListener('pointerdown', closeFilterOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeFilterOnOutsideClick);
  }, [
    openFilterKey,
    openResultFilterKey,
    isBulkReimburserMenuOpen,
    isAutoRuleMenuOpen,
    isResultExcludeRuleMenuOpen,
  ]);

  const saveLocalProgressRef = useRef(saveLocalProgress);
  useEffect(() => {
    saveLocalProgressRef.current = saveLocalProgress;
  });

  // 打开他人发来的「分享链接」时，自动从地址栏 hash 恢复进度（用户主动打开，跳过确认）
  useEffect(() => {
    (async () => {
      const code = getStateFromHash();
      if (!code) return;
      const data = await parseSharedCode(code);
      clearStateHash();
      if (data) await applySharedData(data, true);
    })();
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!records.length) return;
    const timer = setInterval(() => saveLocalProgressRef.current('auto'), AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [records.length]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    await importFiles(Array.from(fileList));
  }

  async function handleReimbursementFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    await importReimbursementFiles(Array.from(fileList), '已导入', 'filter');
  }

  async function restoreLastReimbursementResult() {
    setIsParsing(true);
    try {
      const response = await fetch(`/reimbursement-results/${encodeURIComponent(lastReimbursementResultFile)}`);
      if (!response.ok) throw new Error('没有找到上一次报销结果文件');
      const blob = await response.blob();
      const file = new File([blob], lastReimbursementResultFile);
      await importReimbursementFiles([file], '已恢复上一次', 'result');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '恢复上一次报销结果失败');
      setIsParsing(false);
    }
  }

  async function importReimbursementFiles(
    files: File[],
    successPrefix: string,
    targetTab: 'filter' | 'result',
  ) {
    setIsParsing(true);
    try {
      const result = await parseReimbursementResultFiles(files);
      setResultExcludeHistory(createEmptyResultExcludeHistory());
      setRecords((current) => mergeReimbursementRecords(current, result.records.map(fillMissingClassification)));
      setSummaries((current) => [...current, ...result.summaries]);
      setActiveTab(targetTab);
      toast.success(`${successPrefix} ${result.records.length} 条报销结果`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '报销结果导入失败');
    } finally {
      setIsParsing(false);
    }
  }

  async function importFiles(files: File[]) {
    setIsParsing(true);
    try {
      const result = await parseBillFiles(files);
      setResultExcludeHistory(createEmptyResultExcludeHistory());
      setRecords((current) => [...current, ...result.records]);
      setSummaries((current) => [...current, ...result.summaries]);
      setActiveTab('filter');
      toast.success(`已导入 ${result.records.length} 条消费记录`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '账单导入失败');
    } finally {
      setIsParsing(false);
    }
  }

  function createMatchKey(record: ExpenseRecord) {
    return [
      getDateOnly(record.dateTime),
      record.amount.toFixed(2),
      record.sourcePlatform,
      record.counterparty.trim(),
      record.productName.trim(),
      record.paymentAccount.trim(),
    ].join('|');
  }

  function mergeReimbursementRecords(current: ExpenseRecord[], imported: ExpenseRecord[]) {
    if (!current.length) return imported;

    const importedByKey = new Map<string, ExpenseRecord[]>();
    imported.forEach((record) => {
      const key = createMatchKey(record);
      importedByKey.set(key, [...(importedByKey.get(key) ?? []), record]);
    });

    const usedImportedIds = new Set<string>();
    const updated = current.map((record) => {
      const match = importedByKey.get(createMatchKey(record))?.find((item) => !usedImportedIds.has(item.id));
      if (!match) return record;
      usedImportedIds.add(match.id);
      return {
        ...record,
        isCompanyExpense: true,
        reimbursementMonth: match.reimbursementMonth || record.reimbursementMonth || getMonth(record.dateTime),
        reimburser: match.reimburser || record.reimburser || 'Musk',
        project: match.project,
        category: match.category,
        note: match.note,
      };
    });

    return [...updated, ...imported.filter((record) => !usedImportedIds.has(record.id))];
  }

  function updateRecord(id: string, patch: Partial<ExpenseRecord>) {
    setRecords((current) =>
      current.map((record) => (record.id === id ? { ...record, ...patch } : record)),
    );
  }

  function updateRecordTableDate(id: string, value: string, fallback: string) {
    const dateTime = fromTableDateValue(value, fallback);
    updateRecord(id, { dateTime, reimbursementMonth: getMonth(dateTime) });
  }

  function updateRecordAmount(id: string, value: string) {
    updateRecord(id, { amount: parseAmount(value) });
  }

  function addManualReimbursementRecord() {
    const record = createManualCreditCardRecord(true);
    clearResultFilters();
    setRecords((current) => [record, ...current]);
    setActiveTab('result');
    toast.success('已新增一条报销记录');
  }

  function deleteRecord(recordId: string) {
    if (!window.confirm('确定删除这条记录吗？删除后会从消费筛选和报销结果中同时移除。')) return;
    setRecords((current) => current.filter((record) => record.id !== recordId));
    setResultExcludeHistory(createEmptyResultExcludeHistory());
    toast.success('已删除 1 条记录');
  }

  function updateSelectedReimburser(reimburser: string) {
    setRecords((current) =>
      current.map((record) =>
        record.isCompanyExpense ? { ...record, reimburser } : record,
      ),
    );
    setIsBulkReimburserMenuOpen(false);
    toast.success(`已将报销人批量设置为 ${reimburser}`);
  }

  function removeFromReimbursement(recordId: string) {
    setRecords((current) =>
      current.map((record) =>
        record.id === recordId ? { ...record, isCompanyExpense: false } : record,
      ),
    );
    toast.info('已移出报销结果');
  }

  function scrollAutoRuleListToTop() {
    autoRuleListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scrollAutoRuleListToBottom() {
    autoRuleListRef.current?.scrollTo({ top: autoRuleListRef.current.scrollHeight, behavior: 'smooth' });
  }

  function deleteSelectedFiltered() {
    const selectedIds = new Set(selectedRecords.map((r) => r.id));
    if (!selectedIds.size || !filteredRecords.length) return;
    if (
      !window.confirm(
        `确定删除已选的 ${selectedIds.size} 条记录吗？删除后会从消费筛选和报销结果中同时移除。`,
      )
    )
      return;
    setRecords((current) => current.filter((record) => !selectedIds.has(record.id)));
    setResultExcludeHistory(createEmptyResultExcludeHistory());
    toast.success(`已删除 ${selectedIds.size} 条记录`);
  }

  function invertSelectedFiltered() {
    const selectedIds = new Set(selectedRecords.map((r) => r.id));
    setRecords((current) =>
      current.map((record) =>
        filteredRecords.some((f) => f.id === record.id)
          ? { ...record, isCompanyExpense: !selectedIds.has(record.id) }
          : record,
      ),
    );
    toast.success('已反转当前筛选结果的选中状态');
  }

  function applyBatchRemark() {
    const value = batchRemarkValue.trim();
    if (!value) {
      toast.error('请输入要填入的备注内容');
      return;
    }
    if (!filteredRecords.length) {
      toast.error('当前筛选结果为空');
      return;
    }
    const updatedIds = filteredRecords.map((r) => r.id);
    setRecords((current) =>
      current.map((record) => (updatedIds.includes(record.id) ? { ...record, billRemark: value } : record)),
    );
    toast.success(`已为 ${filteredRecords.length} 条记录批量填入备注`);
    setBatchRemarkValue('');
  }

  // 报销结果行级选择
  function selectAllResultRows() {
    const ids = new Set(sortedResultRecords.map((r) => r.id));
    setSelectedResultRowIds(ids);
  }

  function invertResultSelection() {
    const allIds = new Set(sortedResultRecords.map((r) => r.id));
    const next = new Set<string>();
    for (const id of allIds) {
      if (!selectedResultRowIds.has(id)) next.add(id);
    }
    setSelectedResultRowIds(next);
  }

  function toggleResultRowSelection(id: string) {
    setSelectedResultRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function batchRemoveSelectedResults() {
    if (!selectedResultRowIds.size) {
      toast.error('请先勾选要移出的记录');
      return;
    }
    const ids = Array.from(selectedResultRowIds);
    setRecords((current) =>
      current.map((record) => (ids.includes(record.id) ? { ...record, isCompanyExpense: false } : record)),
    );
    setSelectedResultRowIds(new Set());
    toast.success(`已将 ${ids.length} 条记录移出报销结果`);
  }

  function shouldIgnoreRowClick(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest('input, button, select, textarea, a, label, [role="button"], .filter-menu'),
    );
  }

  function handleExpenseRowClick(event: React.MouseEvent<HTMLTableRowElement>, record: ExpenseRecord) {
    if (shouldIgnoreRowClick(event.target)) return;
    updateRecord(record.id, { isCompanyExpense: !record.isCompanyExpense });
  }

  function moveExpenseColumn(draggedKey: ExpenseColumnKey, targetKey: ExpenseColumnKey) {
    if (draggedKey === targetKey) return;
    setExpenseColumnOrder((current) => {
      const next = current.filter((key) => key !== draggedKey);
      const targetIndex = next.indexOf(targetKey);
      if (targetIndex < 0) return current;
      next.splice(targetIndex, 0, draggedKey);
      return next;
    });
  }

  function handleColumnDragStart(event: React.DragEvent<HTMLTableCellElement>, columnKey: ExpenseColumnKey) {
    setDraggedColumnKey(columnKey);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnKey);
  }

  function handleColumnDrop(event: React.DragEvent<HTMLTableCellElement>, targetKey: ExpenseColumnKey) {
    event.preventDefault();
    const draggedKey = event.dataTransfer.getData('text/plain') as ExpenseColumnKey;
    if (defaultExpenseColumnOrder.includes(draggedKey)) moveExpenseColumn(draggedKey, targetKey);
    setDraggedColumnKey(null);
  }

  function handleColumnPointerDown(event: React.PointerEvent<HTMLTableCellElement>, columnKey: ExpenseColumnKey) {
    if (shouldIgnoreRowClick(event.target)) return;
    setDraggedColumnKey(columnKey);
  }

  function handleColumnPointerUp(targetKey: ExpenseColumnKey) {
    if (draggedColumnKey) moveExpenseColumn(draggedColumnKey, targetKey);
    setDraggedColumnKey(null);
  }

  function getSortableHeaderProps(columnKey: ExpenseColumnKey) {
    return {
      draggable: true,
      onPointerDown: (event: React.PointerEvent<HTMLTableCellElement>) =>
        handleColumnPointerDown(event, columnKey),
      onPointerUp: () => handleColumnPointerUp(columnKey),
      onDragStart: (event: React.DragEvent<HTMLTableCellElement>) => handleColumnDragStart(event, columnKey),
      onDragOver: (event: React.DragEvent<HTMLTableCellElement>) => event.preventDefault(),
      onDrop: (event: React.DragEvent<HTMLTableCellElement>) => handleColumnDrop(event, columnKey),
      onDragEnd: () => setDraggedColumnKey(null),
    };
  }

  function moveResultColumn(draggedKey: ResultColumnKey, targetKey: ResultColumnKey) {
    if (draggedKey === targetKey) return;
    setResultColumnOrder((current) => {
      const next = insertAfter(current, 'date', 'weekday').filter((key) => key !== draggedKey);
      const targetIndex = next.indexOf(targetKey);
      if (targetIndex < 0) return current;
      next.splice(targetIndex, 0, draggedKey);
      return next;
    });
  }

  function handleResultColumnDragStart(
    event: React.DragEvent<HTMLTableCellElement>,
    columnKey: ResultColumnKey,
  ) {
    setDraggedResultColumnKey(columnKey);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnKey);
  }

  function handleResultColumnDrop(
    event: React.DragEvent<HTMLTableCellElement>,
    targetKey: ResultColumnKey,
  ) {
    event.preventDefault();
    const draggedKey = event.dataTransfer.getData('text/plain') as ResultColumnKey;
    if (defaultResultColumnOrder.includes(draggedKey)) moveResultColumn(draggedKey, targetKey);
    setDraggedResultColumnKey(null);
  }

  function handleResultColumnPointerDown(
    event: React.PointerEvent<HTMLTableCellElement>,
    columnKey: ResultColumnKey,
  ) {
    if (shouldIgnoreRowClick(event.target)) return;
    setDraggedResultColumnKey(columnKey);
  }

  function handleResultColumnPointerUp(targetKey: ResultColumnKey) {
    if (draggedResultColumnKey) moveResultColumn(draggedResultColumnKey, targetKey);
    setDraggedResultColumnKey(null);
  }

  function getSortableResultHeaderProps(columnKey: ResultColumnKey) {
    return {
      draggable: true,
      onPointerDown: (event: React.PointerEvent<HTMLTableCellElement>) =>
        handleResultColumnPointerDown(event, columnKey),
      onPointerUp: () => handleResultColumnPointerUp(columnKey),
      onDragStart: (event: React.DragEvent<HTMLTableCellElement>) =>
        handleResultColumnDragStart(event, columnKey),
      onDragOver: (event: React.DragEvent<HTMLTableCellElement>) => event.preventDefault(),
      onDrop: (event: React.DragEvent<HTMLTableCellElement>) => handleResultColumnDrop(event, columnKey),
      onDragEnd: () => setDraggedResultColumnKey(null),
    };
  }

  function toggleAutoRule(ruleId: AutoReimbursementRuleId) {
    setSelectedAutoRuleIds((current) =>
      current.includes(ruleId)
        ? current.filter((id) => id !== ruleId)
        : [...current, ruleId],
    );
  }

  function selectAllAutoRules() {
    setSelectedAutoRuleIds(autoReimbursementRules.map((r) => r.id));
  }

  function invertAutoRules() {
    setSelectedAutoRuleIds((current) =>
      autoReimbursementRules.map((r) => r.id).filter((id) => !current.includes(id)),
    );
  }

  function applyAutoRulesToFiltered() {
    if (!selectedAutoRuleIds.length) return;
    const matchedIds = new Set(
      filteredRecords
        .filter((record) => recordMatchesAnyAutoReimbursementRule(record, selectedAutoRuleIds, customRules))
        .map((record) => record.id),
    );
    if (!matchedIds.size) return;
    setRecords((current) =>
      current.map((record) =>
        matchedIds.has(record.id)
          ? applyAutoReimbursementRules(record, selectedAutoRuleIds, customRules)
          : record,
      ),
    );
    setShowOnlySelected(true);
    toast.success(`已筛入 ${matchedIds.size} 条报销结果`);
  }

  function toggleResultExcludeRule(ruleId: ResultExcludeRuleId) {
    setSelectedResultExcludeRuleIds((current) =>
      current.includes(ruleId)
        ? current.filter((id) => id !== ruleId)
        : [...current, ruleId],
    );
  }

  function excludeResultRecordsByRule(ruleId: ResultExcludeRuleId) {
    const matchedIds = filteredSelectedRecords
      .filter((record) => recordMatchesResultExcludeRule(record, ruleId))
      .map((record) => record.id);
    if (!matchedIds.length) return;
    const matchedIdSet = new Set(matchedIds);
    setResultExcludeHistory((current) => ({
      ...current,
      [ruleId]: [...(current[ruleId] ?? []), matchedIds],
    }));
    setRecords((current) =>
      current.map((record) => (matchedIdSet.has(record.id) ? { ...record, isCompanyExpense: false } : record)),
    );
    toast.success(`已筛除 ${matchedIds.length} 条`);
  }

  function excludeResultRecordsBySelectedRules() {
    if (!selectedResultExcludeRuleIds.length) return;
    const usedIds = new Set<string>();
    const batches = resultExcludeRules.reduce(
      (next, rule) => ({
        ...next,
        [rule.id]: [],
      }),
      {} as Record<ResultExcludeRuleId, string[]>,
    );

    selectedResultExcludeRuleIds.forEach((ruleId) => {
      filteredSelectedRecords.forEach((record) => {
        if (usedIds.has(record.id) || !recordMatchesResultExcludeRule(record, ruleId)) return;
        usedIds.add(record.id);
        batches[ruleId].push(record.id);
      });
    });

    if (!usedIds.size) return;
    setResultExcludeHistory((current) => {
      const next = { ...current };
      resultExcludeRules.forEach((rule) => {
        if (batches[rule.id].length) next[rule.id] = [...(next[rule.id] ?? []), batches[rule.id]];
      });
      return next;
    });
    setRecords((current) =>
      current.map((record) => (usedIds.has(record.id) ? { ...record, isCompanyExpense: false } : record)),
    );
    toast.success(`已筛除 ${usedIds.size} 条`);
  }

  function restoreResultExcludeByRule(ruleId: ResultExcludeRuleId) {
    const history = resultExcludeHistory[ruleId] ?? [];
    const lastExcludedIds = history[history.length - 1];
    if (!lastExcludedIds?.length) return;
    const restoreIds = new Set(lastExcludedIds);
    setRecords((current) =>
      current.map((record) => (restoreIds.has(record.id) ? { ...record, isCompanyExpense: true } : record)),
    );
    setResultExcludeHistory((current) => ({
      ...current,
      [ruleId]: (current[ruleId] ?? []).slice(0, -1),
    }));
    toast.success(`已复原 ${lastExcludedIds.length} 条`);
  }

  function setCompanyExpenseForFiltered(checked: boolean) {
    const filteredIds = new Set(filteredRecords.map((record) => record.id));
    setRecords((current) =>
      current.map((record) =>
        filteredIds.has(record.id) ? { ...record, isCompanyExpense: checked } : record,
      ),
    );
    toast.success(`${checked ? '已全选' : '已取消'}当前筛选结果 ${filteredIds.size} 条`);
  }

  function classifySelectedReimbursements() {
    const selectedIds = new Set(selectedRecords.map((record) => record.id));
    setRecords((current) =>
      current.map((record) =>
        selectedIds.has(record.id) ? fillMissingClassification(record) : record,
      ),
    );
    toast.success(`已重新分类 ${selectedIds.size} 条报销结果`);
  }

  async function syncSelectedRecordsToFeishu() {
    if (!selectedRecords.length) return;
    setIsSyncingFeishu(true);
    setFeishuSyncResult(null);
    setFeishuSyncError('');

    try {
      const payload = {
        records: selectedRecords.map((record) => toFeishuSyncItem(record)),
      };
      const response = await fetch('/api/feishu/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as FeishuSyncResult & { message?: string };
      if (!response.ok) {
        throw new Error(result.message || '同步到飞书失败');
      }
      setFeishuSyncResult(result);
      if (!result.ok) {
        setFeishuSyncError(result.failures?.[0]?.message || result.message || '同步到飞书失败');
        toast.warning(`飞书同步完成，但有 ${result.failed} 条失败`);
        return;
      }
      setFeishuSyncResult(result);
      toast.success(`飞书同步完成：新增 ${result.created} 条，更新 ${result.updated} 条`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步到飞书失败';
      setFeishuSyncError(message);
      toast.error(message);
    } finally {
      setIsSyncingFeishu(false);
    }
  }

  function clearExpenseData() {
    setRecords([]);
    setSummaries([]);
    clearFilters();
    clearResultFilters();
    setFeishuSyncResult(null);
    setFeishuSyncError('');
    setResultExcludeHistory(createEmptyResultExcludeHistory());
    setActiveTab('upload');
    toast.success('已清空消费筛选数据');
  }

  function clearReimbursementData() {
    setRecords((current) =>
      current.map((record) =>
        record.isCompanyExpense
          ? { ...record, isCompanyExpense: false, project: '', category: '', note: '' }
          : record,
      ),
    );
    clearResultFilters();
    setFeishuSyncResult(null);
    setFeishuSyncError('');
    setResultExcludeHistory(createEmptyResultExcludeHistory());
    toast.success('已清空报销结果数据');
  }

  function clearCurrentPageData() {
    const message = activeTab === 'filter' ? '确定清空消费筛选里的所有数据吗？' : '确定清空报销结果里的所有内容吗？';
    if (!window.confirm(message)) return;
    if (activeTab === 'filter') {
      clearExpenseData();
      return;
    }
    if (activeTab === 'result') clearReimbursementData();
  }

  const canClearCurrentPage =
    (activeTab === 'filter' && records.length > 0) ||
    (activeTab === 'result' && selectedRecords.length > 0);

  function clearFilters() {
    setMonthFilter({ mode: 'include', values: [] });
    setMonthQuery('');
    setColumnFilters(createEmptyColumnFilters());
    setFilterQueries(createEmptyFilterQueries());
    setAmountSort('none');
    setHideBankWalletRecords(true);
    setOpenFilterKey(null);
  }

  function clearResultFilters() {
    setResultFilters(createEmptyResultFilters());
    setResultFilterQueries(createEmptyResultFilterQueries());
    setResultAmountSort('none');
    setOpenResultFilterKey(null);
  }

  function updateColumnFilter(key: ColumnFilterKey, patch: Partial<ColumnFilterValue>) {
    setColumnFilters((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }));
  }

  function updateFilterQuery(key: ColumnFilterKey, query: string) {
    setFilterQueries((current) => ({ ...current, [key]: query }));
  }

  function updateResultFilter(key: ResultFilterKey, patch: Partial<ColumnFilterValue>) {
    setResultFilters((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? { mode: 'include', values: [] }),
        ...patch,
      },
    }));
  }

  function updateResultFilterQuery(key: ResultFilterKey, query: string) {
    setResultFilterQueries((current) => ({ ...current, [key]: query }));
  }

  function saveLocalProgress(kind: ProgressVersion['kind'] = 'manual') {
    if (!records.length) return;
    const draft: LocalProgressDraft = {
      savedAt: new Date().toISOString(),
      records,
      summaries,
      activeTab,
      monthFilter,
      monthQuery,
      columnFilters,
      filterQueries,
      amountSort,
      expenseColumnOrder,
      hiddenExpenseColumnKeys,
      resultColumnOrder,
      hiddenResultColumnKeys,
      resultAmountSort,
      resultFilters,
      resultFilterQueries,
      hideBankWalletRecords,
      selectedAutoRuleIds,
      selectedResultExcludeRuleIds,
      resultExcludeHistory,
      customRules,
    };
    try {
      window.localStorage.setItem(localProgressDraftKey, JSON.stringify(draft));

      const selectedCount = records.filter((record) => record.isCompanyExpense).length;
      const version = createProgressVersion(kind, records.length, selectedCount);
      const nextVersions = pushVersion(progressVersions, version, MAX_PROGRESS_VERSIONS);
      writeProgressVersions(nextVersions);
      setProgressVersions(nextVersions);
      setLocalProgressInfo(getLocalProgressDraftInfo());
      const message = kind === 'auto' ? '已自动保存' : '已保存本地进度';
      setLocalProgressMessage(message);
      if (kind === 'manual') toast.success(message);
    } catch {
      setLocalProgressMessage('保存失败，本地存储空间不足');
      toast.error('保存失败，本地存储空间不足');
    }
  }

  function restoreLocalProgress() {
    const draft = readLocalProgressDraft();
    if (!draft) {
      setLocalProgressMessage('没有找到可恢复的本地进度');
      setLocalProgressInfo(null);
      toast.info('没有找到可恢复的本地进度');
      return;
    }

    setRecords(draft.records);
    setSummaries(draft.summaries);
    setActiveTab(draft.activeTab === 'upload' ? 'filter' : draft.activeTab);
    setMonthFilter(draft.monthFilter);
    setMonthQuery(draft.monthQuery);
    setColumnFilters({ ...createEmptyColumnFilters(), ...draft.columnFilters });
    setFilterQueries({ ...createEmptyFilterQueries(), ...draft.filterQueries });
    setAmountSort(draft.amountSort);
    setExpenseColumnOrder(draft.expenseColumnOrder);
    setHiddenExpenseColumnKeys(draft.hiddenExpenseColumnKeys ?? []);
    setResultColumnOrder(draft.resultColumnOrder);
    setHiddenResultColumnKeys(draft.hiddenResultColumnKeys ?? []);
    setResultAmountSort(draft.resultAmountSort);
    setResultFilters({ ...createEmptyResultFilters(), ...draft.resultFilters });
    setResultFilterQueries({ ...createEmptyResultFilterQueries(), ...draft.resultFilterQueries });
    setHideBankWalletRecords(draft.hideBankWalletRecords);
    setSelectedAutoRuleIds(draft.selectedAutoRuleIds);
    setSelectedResultExcludeRuleIds(draft.selectedResultExcludeRuleIds);
    setResultExcludeHistory({ ...createEmptyResultExcludeHistory(), ...draft.resultExcludeHistory });
    if (draft.customRules) {
      setCustomRules(draft.customRules);
      writeCustomRules(draft.customRules);
    }
    setOpenFilterKey(null);
    setOpenResultFilterKey(null);
    setIsAutoRuleMenuOpen(false);
    setIsResultExcludeRuleMenuOpen(false);
    setIsBulkReimburserMenuOpen(false);
    setFeishuSyncResult(null);
    setFeishuSyncError('');
    setLocalProgressInfo(getLocalProgressDraftInfo());
    setLocalProgressMessage('已恢复本地进度');
    toast.success('已恢复本地进度');
  }

  function exportReimbursementsToXlsx() {
    exportReimbursementsAsXlsx(reimbursements);
    toast.success(`已导出 Excel：${reimbursements.length} 条`);
  }

  function exportReimbursementsToCsv() {
    exportReimbursementsAsCsv(reimbursements);
    toast.success(`已导出 CSV：${reimbursements.length} 条`);
  }

  // 等级三①：结构化报销单
  function openFormBuilder() {
    if (!reimbursements.length) {
      toast.error('暂无可报销记录，请先勾选或一键筛入公司消费');
      return;
    }
    setShowFormBuilder(true);
  }

  function applyFormTemplate(templateId: string) {
    const template = formTemplates.find((t) => t.id === templateId);
    if (!template) return;
    setActiveTemplateId(template.id);
    setFormGroupBy([...template.groupBy]);
    setFormColumns([...template.columns]);
  }

  function toggleFormDim(dim: FormGroupDim) {
    setFormGroupBy((current) =>
      current.includes(dim) ? current.filter((d) => d !== dim) : [...current, dim],
    );
  }

  function toggleFormColumn(key: FormColumnKey) {
    setFormColumns((current) =>
      current.includes(key) ? current.filter((c) => c !== key) : [...current, key],
    );
  }

  function saveCurrentAsTemplate() {
    const name = newTemplateName.trim();
    if (!name) {
      toast.error('请填写模板名称');
      return;
    }
    const template: ReimbursementFormTemplate = {
      id: `custom-${Date.now()}`,
      name,
      groupBy: [...formGroupBy],
      columns: [...formColumns],
      title: name,
    };
    const next = [...formTemplates, template];
    setFormTemplates(next);
    writeFormTemplates(next);
    setActiveTemplateId(template.id);
    setNewTemplateName('');
    toast.success(`已保存模板「${name}」`);
  }

  function deleteFormTemplate(templateId: string) {
    if (formTemplates.length <= 1) {
      toast.error('至少保留一个模板');
      return;
    }
    const next = formTemplates.filter((t) => t.id !== templateId);
    setFormTemplates(next);
    writeFormTemplates(next);
    if (activeTemplateId === templateId) {
      setActiveTemplateId(next[0].id);
      setFormGroupBy([...next[0].groupBy]);
      setFormColumns([...next[0].columns]);
    }
    toast.success('已删除模板');
  }

  function exportStructuredForm() {
    if (!reimbursements.length) {
      toast.error('暂无可报销记录');
      return;
    }
    exportStructuredFormAsXlsx(formModel, formColumns);
    toast.success(`已导出结构化报销单：${formModel.totalCount} 条`);
  }

  function printStructuredForm() {
    if (typeof window === 'undefined') return;
    window.print();
  }

  function toggleExpenseColumnVisibility(columnKey: ExpenseColumnKey) {
    if (columnKey === 'company') return;
    setHiddenExpenseColumnKeys((current) =>
      current.includes(columnKey)
        ? current.filter((key) => key !== columnKey)
        : [...current, columnKey],
    );
  }

  function reorderExpenseColumn(
    draggedColumnKey: ExpenseColumnKey,
    targetColumnKey: ExpenseColumnKey,
    placement: 'before' | 'after',
  ) {
    setExpenseColumnOrder((current) => reorderItem(current, draggedColumnKey, targetColumnKey, placement));
  }

  function toggleResultColumnVisibility(columnKey: ResultColumnKey) {
    if (columnKey === 'remove') return;
    setHiddenResultColumnKeys((current) =>
      current.includes(columnKey)
        ? current.filter((key) => key !== columnKey)
        : [...current, columnKey],
    );
  }

  function reorderResultColumn(
    draggedColumnKey: ResultColumnKey,
    targetColumnKey: ResultColumnKey,
    placement: 'before' | 'after',
  ) {
    setResultColumnOrder((current) =>
      reorderItem(insertAfter(current, 'date', 'weekday'), draggedColumnKey, targetColumnKey, placement),
    );
  }

  function renderStaticHeader(columnKey: ExpenseColumnKey, label: string) {
    return (
      <th
        key={columnKey}
        data-column-key={columnKey}
        className={[
          'sortable-th',
          columnKey === 'amount' ? 'expense-amount-column' : '',
          draggedColumnKey === columnKey ? 'dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...getSortableHeaderProps(columnKey)}
      >
        {label}
      </th>
    );
  }

  function renderAmountHeader(columnKey: ExpenseColumnKey) {
    const sortIcon =
      amountSort === 'asc' ? <ArrowUp size={14} /> : amountSort === 'desc' ? <ArrowDown size={14} /> : <ArrowUpDown size={14} />;
    const sortSummary = amountSort === 'asc' ? '金额升序' : amountSort === 'desc' ? '金额降序' : '';

    return (
      <th
        key={columnKey}
        data-column-key={columnKey}
        className={draggedColumnKey === columnKey ? 'sortable-th dragging' : 'sortable-th'}
        {...getSortableHeaderProps(columnKey)}
      >
        <div className="th-filter-label">
          <span>金额</span>
          <button
            type="button"
            className={amountSort === 'none' ? 'amount-sort-button' : 'amount-sort-button active'}
            aria-label="金额排序"
            title={sortSummary || '金额排序'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() =>
              setAmountSort((current) => (current === 'none' ? 'asc' : current === 'asc' ? 'desc' : 'none'))
            }
          >
            {sortIcon}
          </button>
        </div>
        {sortSummary && <small>{sortSummary}</small>}
      </th>
    );
  }

  function renderResultAmountHeader(columnKey: ResultColumnKey) {
    const sortIcon =
      resultAmountSort === 'asc'
        ? <ArrowUp size={14} />
        : resultAmountSort === 'desc'
          ? <ArrowDown size={14} />
          : <ArrowUpDown size={14} />;
    const sortSummary =
      resultAmountSort === 'asc' ? '金额升序' : resultAmountSort === 'desc' ? '金额降序' : '';

    return (
      <th
        key={columnKey}
        data-result-column-key={columnKey}
        className={[
          'sortable-th',
          getResultColumnClass(columnKey),
          draggedResultColumnKey === columnKey ? 'dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...getSortableResultHeaderProps(columnKey)}
      >
        <div className="th-filter-label">
          <span>报销金额</span>
          <button
            type="button"
            className={resultAmountSort === 'none' ? 'amount-sort-button' : 'amount-sort-button active'}
            aria-label="报销金额排序"
            title={sortSummary || '报销金额排序'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() =>
              setResultAmountSort((current) =>
                current === 'none' ? 'asc' : current === 'asc' ? 'desc' : 'none',
              )
            }
          >
            {sortIcon}
          </button>
        </div>
        {sortSummary && <small>{sortSummary}</small>}
      </th>
    );
  }

  function renderExpenseHeader(columnKey: ExpenseColumnKey) {
    const sortableProps = getSortableHeaderProps(columnKey);

    switch (columnKey) {
      case 'actions':
        return renderStaticHeader(columnKey, '操作');
      case 'company':
        return renderStaticHeader(columnKey, '公司');
      case 'dateTime':
        return (
          <FilterHeader
            key={columnKey}
            columnKey={columnKey}
            label="消费时间"
            filterKey="month"
            className="expense-date-column"
            options={months}
            query={monthQuery}
            value={monthFilter}
            isOpen={openFilterKey === 'month'}
            isDragging={draggedColumnKey === columnKey}
            dragProps={sortableProps}
            onToggle={() => setOpenFilterKey((current) => (current === 'month' ? null : 'month'))}
            onConfirm={() => setOpenFilterKey(null)}
            onQueryChange={setMonthQuery}
            onChange={(patch) => setMonthFilter((current) => ({ ...current, ...patch }))}
          />
        );
      case 'weekday':
        return (
          <FilterHeader
            key={columnKey}
            columnKey={columnKey}
            label="星期"
            filterKey="weekday"
            className="weekday-column"
            options={columnFilterOptions.weekday}
            query={filterQueries.weekday}
            value={columnFilters.weekday}
            isOpen={openFilterKey === 'weekday'}
            isDragging={draggedColumnKey === columnKey}
            dragProps={sortableProps}
            onToggle={() => setOpenFilterKey((current) => (current === 'weekday' ? null : 'weekday'))}
            onConfirm={() => setOpenFilterKey(null)}
            onQueryChange={(query) => updateFilterQuery('weekday', query)}
            onChange={(patch) => updateColumnFilter('weekday', patch)}
          />
        );
      case 'amount':
        return renderAmountHeader(columnKey);
      case 'transactionType':
        return (
          <FilterHeader
            key={columnKey}
            columnKey={columnKey}
            label="交易类型/来源"
            filterKey="transactionType"
            className="expense-transaction-column"
            options={columnFilterOptions.transactionType}
            query={filterQueries.transactionType}
            value={columnFilters.transactionType}
            isOpen={openFilterKey === 'transactionType'}
            isDragging={draggedColumnKey === columnKey}
            dragProps={sortableProps}
            onToggle={() => setOpenFilterKey((current) => (current === 'transactionType' ? null : 'transactionType'))}
            onConfirm={() => setOpenFilterKey(null)}
            onQueryChange={(query) => updateFilterQuery('transactionType', query)}
            onChange={(patch) => updateColumnFilter('transactionType', patch)}
          />
        );
      case 'counterparty':
        return (
          <FilterHeader
            key={columnKey}
            columnKey={columnKey}
            label="交易对方"
            filterKey="counterparty"
            className="expense-counterparty-column"
            options={columnFilterOptions.counterparty}
            query={filterQueries.counterparty}
            value={columnFilters.counterparty}
            isOpen={openFilterKey === 'counterparty'}
            isDragging={draggedColumnKey === columnKey}
            dragProps={sortableProps}
            onToggle={() => setOpenFilterKey((current) => (current === 'counterparty' ? null : 'counterparty'))}
            onConfirm={() => setOpenFilterKey(null)}
            onQueryChange={(query) => updateFilterQuery('counterparty', query)}
            onChange={(patch) => updateColumnFilter('counterparty', patch)}
          />
        );
      case 'productName':
        return (
          <FilterHeader
            key={columnKey}
            columnKey={columnKey}
            label="商品名称"
            filterKey="productName"
            className="product-column"
            options={columnFilterOptions.productName}
            query={filterQueries.productName}
            value={columnFilters.productName}
            isOpen={openFilterKey === 'productName'}
            isDragging={draggedColumnKey === columnKey}
            dragProps={sortableProps}
            onToggle={() => setOpenFilterKey((current) => (current === 'productName' ? null : 'productName'))}
            onConfirm={() => setOpenFilterKey(null)}
            onQueryChange={(query) => updateFilterQuery('productName', query)}
            onChange={(patch) => updateColumnFilter('productName', patch)}
          />
        );
      case 'billRemark':
        return (
          <FilterHeader
            key={columnKey}
            columnKey={columnKey}
            label="备注"
            filterKey="billRemark"
            options={columnFilterOptions.billRemark}
            query={filterQueries.billRemark}
            value={columnFilters.billRemark}
            isOpen={openFilterKey === 'billRemark'}
            isDragging={draggedColumnKey === columnKey}
            dragProps={sortableProps}
            onToggle={() => setOpenFilterKey((current) => (current === 'billRemark' ? null : 'billRemark'))}
            onConfirm={() => setOpenFilterKey(null)}
            onQueryChange={(query) => updateFilterQuery('billRemark', query)}
            onChange={(patch) => updateColumnFilter('billRemark', patch)}
          />
        );
      case 'paymentAccount':
        return (
          <FilterHeader
            key={columnKey}
            columnKey={columnKey}
            label="支付账户"
            filterKey="paymentAccount"
            className="expense-account-column"
            options={columnFilterOptions.paymentAccount}
            query={filterQueries.paymentAccount}
            value={columnFilters.paymentAccount}
            isOpen={openFilterKey === 'paymentAccount'}
            isDragging={draggedColumnKey === columnKey}
            dragProps={sortableProps}
            onToggle={() => setOpenFilterKey((current) => (current === 'paymentAccount' ? null : 'paymentAccount'))}
            onConfirm={() => setOpenFilterKey(null)}
            onQueryChange={(query) => updateFilterQuery('paymentAccount', query)}
            onChange={(patch) => updateColumnFilter('paymentAccount', patch)}
          />
        );
      case 'sourcePlatform':
        return (
          <FilterHeader
            key={columnKey}
            columnKey={columnKey}
            label="平台"
            filterKey="sourcePlatform"
            className="expense-platform-column"
            options={columnFilterOptions.sourcePlatform}
            query={filterQueries.sourcePlatform}
            value={columnFilters.sourcePlatform}
            isOpen={openFilterKey === 'sourcePlatform'}
            isDragging={draggedColumnKey === columnKey}
            dragProps={sortableProps}
            onToggle={() => setOpenFilterKey((current) => (current === 'sourcePlatform' ? null : 'sourcePlatform'))}
            onConfirm={() => setOpenFilterKey(null)}
            onQueryChange={(query) => updateFilterQuery('sourcePlatform', query)}
            onChange={(patch) => updateColumnFilter('sourcePlatform', patch)}
          />
        );
      case 'project':
        return renderStaticHeader(columnKey, '报销项目');
      case 'category':
        return renderStaticHeader(columnKey, '费用类别');
      case 'note':
        return renderStaticHeader(columnKey, '报销备注');
      default:
        return null;
    }
  }

  function renderExpenseCell(columnKey: ExpenseColumnKey, record: ExpenseRecord) {
    switch (columnKey) {
      case 'actions':
        return (
          <td key={columnKey} className="expense-action-column">
            <button
              type="button"
              className="ghost-button row-delete-button"
              onClick={() => deleteRecord(record.id)}
            >
              删除
            </button>
          </td>
        );
      case 'company': {
        const insight = insightById[record.id];
        const confidence = insight?.confidence;
        return (
          <td key={columnKey} className="company-check-cell">
            <label>
              <input
                type="checkbox"
                checked={record.isCompanyExpense}
                onChange={(event) => updateRecord(record.id, { isCompanyExpense: event.target.checked })}
                aria-label="勾选为公司消费"
              />
            </label>
            {confidence && (
              <div className="record-insight">
                <span
                  className={`confidence-dot confidence-${confidence.level}`}
                  title={`判定置信度 ${confidence.score}（${confidence.level === 'high' ? '高' : confidence.level === 'medium' ? '中' : '低'}）`}
                />
                {insight.autoHits.length > 0 && (
                  <div className="reason-tags">
                    {insight.autoHits.slice(0, 2).map((hit) => (
                      <span key={hit.id} className="reason-tag">{hit.label}</span>
                    ))}
                  </div>
                )}
                {insight.isManualSelected && <span className="reason-tag manual-tag">人工</span>}
                {insight.isRuleMissed && <span className="reason-tag missed-tag" title={insight.reason}>建议</span>}
              </div>
            )}
          </td>
        );
      }
      case 'dateTime':
        return (
          <td key={columnKey} className="expense-date-column">
            <input
              key={`${record.id}-${record.dateTime}`}
              className="table-cell-input table-date-input"
              defaultValue={formatDateForTable(record.dateTime)}
              placeholder="2026/05/30"
              onBlur={(event) => updateRecordTableDate(record.id, event.currentTarget.value, record.dateTime)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </td>
        );
      case 'weekday':
        return <td key={columnKey} className="weekday-column">{renderWeekdayContent(record.dateTime)}</td>;
      case 'amount':
        return (
          <td key={columnKey} className="expense-amount-column">
            <span className="amount-readonly">{formatCurrency(record.amount)}</span>
          </td>
        );
      case 'transactionType':
        return (
          <td key={columnKey} className="expense-transaction-column">
            <input
              className="table-cell-input"
              value={record.transactionType}
              placeholder="交易类型"
              onChange={(event) => updateRecord(record.id, { transactionType: event.target.value })}
            />
          </td>
        );
      case 'counterparty':
        return (
          <td key={columnKey} className="expense-counterparty-column">
            <input
              className="table-cell-input"
              value={record.counterparty}
              placeholder="交易对方"
              onChange={(event) => updateRecord(record.id, { counterparty: event.target.value, merchant: event.target.value })}
            />
          </td>
        );
      case 'productName':
        return (
          <td key={columnKey} className="product-column">
            <input
              className="table-cell-input"
              value={record.productName}
              placeholder="商品名称"
              onChange={(event) => updateRecord(record.id, { productName: event.target.value })}
            />
          </td>
        );
      case 'billRemark':
        return (
          <td key={columnKey}>
            <input
              className="table-cell-input"
              value={record.billRemark}
              placeholder="备注"
              onChange={(event) => updateRecord(record.id, { billRemark: event.target.value })}
            />
          </td>
        );
      case 'paymentAccount':
        return (
          <td key={columnKey} className="expense-account-column">
            <input
              className="table-cell-input"
              value={record.paymentAccount}
              placeholder="支付账户"
              onChange={(event) => updateRecord(record.id, { paymentAccount: event.target.value })}
            />
          </td>
        );
      case 'sourcePlatform':
        return (
          <td key={columnKey} className="expense-platform-column">
            <select
              className="table-cell-input"
              value={record.sourcePlatform}
              onChange={(event) => updateRecord(record.id, { sourcePlatform: event.target.value as ExpenseRecord['sourcePlatform'] })}
            >
              <option value="微信">微信</option>
              <option value="支付宝">支付宝</option>
              <option value="银行卡">银行卡</option>
              <option value="信用卡">信用卡</option>
              <option value="未知">未知</option>
            </select>
          </td>
        );
      case 'project':
        return (
          <td key={columnKey}>
            <input
              className="table-cell-input"
              list="project-options"
              value={record.project}
              placeholder="项目"
              onChange={(event) => updateRecord(record.id, { project: event.target.value })}
            />
          </td>
        );
      case 'category':
        return (
          <td key={columnKey}>
            <input
              className="table-cell-input"
              list="category-options"
              value={record.category}
              placeholder="类别"
              onChange={(event) => updateRecord(record.id, { category: event.target.value })}
            />
          </td>
        );
      case 'note':
        return (
          <td key={columnKey}>
            <input
              className="table-cell-input"
              value={record.note}
              placeholder="报销备注"
              onChange={(event) => updateRecord(record.id, { note: event.target.value })}
            />
          </td>
        );
      default:
        return null;
    }
  }

  function renderResultHeader(columnKey: ResultColumnKey) {
    const label = resultColumnLabels[columnKey];
    if (columnKey === 'amount') return renderResultAmountHeader(columnKey);
    if (resultFilterKeys.includes(columnKey as ResultFilterKey)) {
      const filterKey = columnKey as ResultFilterKey;
      return (
        <FilterHeader
          key={columnKey}
          columnKey={columnKey}
          label={label}
          filterKey={filterKey}
          options={resultFilterOptions[filterKey]}
          query={resultFilterQueries[filterKey] ?? ''}
          value={resultFilters[filterKey] ?? { mode: 'include', values: [] }}
          isOpen={openResultFilterKey === filterKey}
          isDragging={draggedResultColumnKey === columnKey}
          dragProps={getSortableResultHeaderProps(columnKey)}
          onToggle={() => setOpenResultFilterKey((current) => (current === filterKey ? null : filterKey))}
          onConfirm={() => setOpenResultFilterKey(null)}
          onQueryChange={(query) => updateResultFilterQuery(filterKey, query)}
          onChange={(patch) => updateResultFilter(filterKey, patch)}
        />
      );
    }

    return (
      <th
        key={columnKey}
        data-result-column-key={columnKey}
        className={[
          'sortable-th',
          getResultColumnClass(columnKey),
          draggedResultColumnKey === columnKey ? 'dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...getSortableResultHeaderProps(columnKey)}
      >
        {columnKey === 'reimburser' ? (
          <div className="th-filter-label reimburser-header-control">
            <span>{label}</span>
            <Popover.Root open={isBulkReimburserMenuOpen} onOpenChange={setIsBulkReimburserMenuOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className={bulkReimburserValue ? 'filter-trigger active' : 'filter-trigger'}
                  aria-label="批量设置报销人"
                  disabled={!selectedRecords.length}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Filter size={14} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content className="bulk-menu" align="start" sideOffset={6}>
                  <span>批量设置</span>
                  <div className="bulk-menu-options">
                    {reimburserOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={bulkReimburserValue === option ? 'active' : ''}
                        onClick={() => updateSelectedReimburser(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        ) : (
          columnKey === 'remove' ? (
            <div className="th-filter-label">
              <input
                type="checkbox"
                checked={selectedResultRowIds.size > 0 && selectedResultRowIds.size === sortedResultRecords.length}
                ref={(el) => {
                  if (el) el.indeterminate = selectedResultRowIds.size > 0 && selectedResultRowIds.size < sortedResultRecords.length;
                }}
                onChange={() => {
                  if (selectedResultRowIds.size === sortedResultRecords.length) setSelectedResultRowIds(new Set());
                  else selectAllResultRows();
                }}
              />
              <span>{label}</span>
            </div>
          ) : (
            label
          )
        )}
      </th>
    );
  }

  function getResultColumnClass(columnKey: ResultColumnKey) {
    if (columnKey === 'remove') return 'result-action-column';
    if (columnKey === 'date') return 'result-date-column';
    if (columnKey === 'amount') return 'result-amount-column';
    if (columnKey === 'month' || columnKey === 'weekday') {
      return 'result-compact-column';
    }
    if (columnKey === 'reimburser') return 'result-person-column';
    if (columnKey === 'project' || columnKey === 'category') return 'result-choice-column';
    if (columnKey === 'sourcePlatform') return 'result-platform-column';
    if (columnKey === 'paymentAccount') return 'result-account-column';
    if (columnKey === 'description') return 'result-description-column';
    if (columnKey === 'productName') return 'product-column';
    return 'result-text-column';
  }

  function buildResultDescription(record: ExpenseRecord) {
    return (
      Array.from(new Set([record.counterparty, record.productName].filter(Boolean))).join(' - ') ||
      record.merchant
    );
  }

  function renderResultCell(columnKey: ResultColumnKey, record: ExpenseRecord) {
    switch (columnKey) {
      case 'remove':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <div className="row-action-stack">
              <input
                type="checkbox"
                checked={selectedResultRowIds.has(record.id)}
                onChange={() => toggleResultRowSelection(record.id)}
                className="result-row-checkbox"
              />
              <button
                type="button"
                className="ghost-button result-remove-button"
                onClick={() => removeFromReimbursement(record.id)}
              >
                移出
              </button>
              <button
                type="button"
                className="ghost-button row-delete-button"
                onClick={() => deleteRecord(record.id)}
              >
                删除
              </button>
            </div>
          </td>
        );
      case 'month':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <select
              className="result-cell-input"
              value={getRecordReimbursementMonth(record)}
              onChange={(event) => updateRecord(record.id, { reimbursementMonth: event.target.value })}
            >
              {resultMonthOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </td>
        );
      case 'date':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              key={`${record.id}-${record.dateTime}`}
              className="result-cell-input table-date-input"
              defaultValue={formatDateForTable(record.dateTime)}
              placeholder="2026/05/30"
              onBlur={(event) => updateRecordTableDate(record.id, event.currentTarget.value, record.dateTime)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </td>
        );
      case 'weekday':
        return <td key={columnKey} className={getResultColumnClass(columnKey)}>{renderWeekdayContent(record.dateTime)}</td>;
      case 'reimburser':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <select
              className="result-cell-input"
              value={record.reimburser || 'Musk'}
              onChange={(event) => updateRecord(record.id, { reimburser: event.target.value })}
            >
              {reimburserOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </td>
        );
      case 'project':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              list="project-options"
              value={record.project}
              placeholder="未填写项目"
              onChange={(event) => updateRecord(record.id, { project: event.target.value })}
            />
          </td>
        );
      case 'category':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              list="category-options"
              value={record.category}
              placeholder="未分类"
              onChange={(event) => updateRecord(record.id, { category: event.target.value })}
            />
          </td>
        );
      case 'transactionType':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              value={record.transactionType}
              placeholder="交易类型"
              onChange={(event) => updateRecord(record.id, { transactionType: event.target.value })}
            />
          </td>
        );
      case 'counterparty':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              value={record.counterparty}
              placeholder="交易对方"
              onChange={(event) => updateRecord(record.id, { counterparty: event.target.value, merchant: event.target.value })}
            />
          </td>
        );
      case 'productName':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              value={record.productName}
              placeholder="商品名称"
              onChange={(event) => updateRecord(record.id, { productName: event.target.value })}
            />
          </td>
        );
      case 'billRemark':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              value={record.billRemark}
              placeholder="备注"
              onChange={(event) => updateRecord(record.id, { billRemark: event.target.value })}
            />
          </td>
        );
      case 'description':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              value={buildResultDescription(record)}
              placeholder="报销摘要"
              onChange={(event) =>
                updateRecord(record.id, {
                  counterparty: '',
                  merchant: event.target.value,
                  productName: event.target.value,
                })
              }
            />
            <div className="result-reason-line">
              <span
                className={`confidence-dot confidence-${(insightById[record.id]?.confidence.level) ?? 'high'}`}
                title={`判定置信度 ${(insightById[record.id]?.confidence.score) ?? 100}`}
              />
              <span className="result-reason-text">{insightById[record.id]?.reason}</span>
            </div>
          </td>
        );
      case 'amount':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input amount-input"
              value={record.amount || ''}
              placeholder="0.00"
              onChange={(event) => updateRecordAmount(record.id, event.target.value)}
            />
          </td>
        );
      case 'paymentAccount':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              value={record.paymentAccount}
              placeholder="支付账户"
              onChange={(event) => updateRecord(record.id, { paymentAccount: event.target.value })}
            />
          </td>
        );
      case 'sourcePlatform':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <select
              className="result-cell-input"
              value={record.sourcePlatform}
              onChange={(event) => updateRecord(record.id, { sourcePlatform: event.target.value as ExpenseRecord['sourcePlatform'] })}
            >
              <option value="微信">微信</option>
              <option value="支付宝">支付宝</option>
              <option value="银行卡">银行卡</option>
              <option value="信用卡">信用卡</option>
              <option value="未知">未知</option>
            </select>
          </td>
        );
      case 'note':
        return (
          <td key={columnKey} className={getResultColumnClass(columnKey)}>
            <input
              className="result-cell-input"
              value={record.note}
              placeholder="报销备注"
              onChange={(event) => updateRecord(record.id, { note: event.target.value })}
            />
          </td>
        );
      default:
        return null;
    }
  }

  return (
    <>
      <main className="app-shell">
      <Toaster position="top-center" richColors closeButton />
      <header className="topbar">
        <div>
          <p className="eyebrow">本地 MVP</p>
          <h1>个人报销自动化小工具</h1>
        </div>
        <div className="summary-strip">
          <Stat label="已导入" value={`${records.length} 条`} />
          <Stat label="公司消费" value={`${selectedRecords.length} 条`} />
          <Stat label="待报销金额" value={`¥${formatCurrency(totalAmount)}`} />
          <button
            type="button"
            className="ghost-button summary-clear-button"
            disabled={!records.length}
            onClick={() => saveLocalProgress()}
          >
            {records.length > 0 && (localProgressMessage === '已保存本地进度' || localProgressMessage === '已自动保存') ? '已保存进度' : '保存进度'}
          </button>
          {(activeTab === 'filter' || activeTab === 'result') && (
            <button
              type="button"
              className="ghost-button summary-clear-button"
              disabled={!canClearCurrentPage}
              onClick={clearCurrentPageData}
            >
              清空数据
            </button>
          )}
        </div>
      </header>

      <nav className="tabs" aria-label="页面模块">
        <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>
          <Upload size={18} /> 上传账单
        </button>
        <button className={activeTab === 'filter' ? 'active' : ''} onClick={() => setActiveTab('filter')}>
          <Filter size={18} /> 消费筛选
        </button>
        <button className={activeTab === 'result' ? 'active' : ''} onClick={() => setActiveTab('result')}>
          <FileSpreadsheet size={18} /> 报销结果
        </button>
      </nav>

      {activeTab === 'upload' && (
        <section className="panel upload-panel">
          <div className="upload-box">
            <Upload size={34} />
            <h2>上传 Excel / CSV 账单</h2>
            <p>支持上传原始账单，也可以上传上次导出的报销结果来恢复勾选和编辑进度。</p>
            <label className="primary-button">
              选择账单文件
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                onChange={(event) => handleFiles(event.target.files)}
              />
            </label>
            <label className="ghost-button upload-file-button">
              上传上次报销结果
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                onChange={(event) => handleReimbursementFiles(event.target.files)}
              />
            </label>
            <button
              type="button"
              className="ghost-button"
              disabled={isParsing}
              onClick={restoreLastReimbursementResult}
            >
              恢复上一次报销结果
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!localProgressInfo}
              onClick={restoreLocalProgress}
            >
              恢复本地进度
            </button>
            {localProgressInfo && (
              <span className="draft-status">
                上次保存 {formatSavedAt(localProgressInfo.savedAt)}，{localProgressInfo.recordCount} 条，已选{' '}
                {localProgressInfo.selectedCount} 条
              </span>
            )}
            {localProgressMessage && <span className="draft-status">{localProgressMessage}</span>}
            {isParsing && <span className="muted">正在解析...</span>}
            {progressVersions.length > 0 && (
              <div className="version-history">
                <div className="version-history-head">
                  <span>保存版本（{progressVersions.length}）</span>
                  <span className="version-history-hint">每 5 分钟自动保存</span>
                </div>
                <ul className="version-history-list">
                  {progressVersions.map((version) => (
                    <li key={version.id}>
                      <span className="version-time">{formatSavedAt(version.savedAt)}</span>
                      <span className={`version-tag ${version.kind}`}>
                        {version.kind === 'auto' ? '自动' : '手动'}
                      </span>
                      <span className="version-count">
                        {version.recordCount} 条 · 选 {version.selectedCount}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="result-grid">
            {summaries.map((summary) => (
              <article className="mini-card" key={`${summary.fileName}-${summary.imported}`}>
                <strong>{summary.fileName}</strong>
                <span>{summary.platform}</span>
                <small>
                  原始 {summary.rows} 行，导入 {summary.imported} 行
                </small>
              </article>
            ))}
            {!summaries.length && (
              <article className="empty-state">还没有导入文件。可以先用 `sample-data` 里的模拟账单测试。</article>
            )}
          </div>
        </section>
      )}

      {activeTab === 'filter' && (
        <section className="panel">
          <div className="toolbar filter-toolbar">
            <label className="inline-toggle">
              <input
                type="checkbox"
                checked={hideBankWalletRecords}
                onChange={(event) => setHideBankWalletRecords(event.target.checked)}
              />
              <span>隐藏银行卡财付通/支付宝</span>
              {hiddenBankWalletCount > 0 && <small>{hiddenBankWalletCount} 条</small>}
            </label>
            <Popover.Root open={isAutoRuleMenuOpen} onOpenChange={setIsAutoRuleMenuOpen}>
              <div className="auto-rule-control">
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className={selectedAutoRuleIds.length ? 'filter-chip active' : 'filter-chip'}
                    aria-label="一键筛入规则"
                  >
                    <Filter size={14} />
                    筛入规则
                    {selectedAutoRuleIds.length > 0 && <small>{selectedAutoRuleIds.length}</small>}
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className="auto-rule-menu" align="start" sideOffset={7}>
                  <div className="auto-rule-menu-title">
                    <div className="auto-rule-menu-title-left">
                      <strong>一键筛入规则</strong>
                      <span>只作用于当前筛选结果</span>
                    </div>
                    <button
                      type="button"
                      className="auto-rule-goto-custom-btn"
                      onClick={() => {
                        const list = autoRuleListRef.current;
                        if (list) list.scrollTop = list.scrollHeight;
                      }}
                    >
                      + 自定义规则
                    </button>
                  </div>
                  <div className="auto-rule-actions">
                    <button type="button" onClick={selectAllAutoRules}>全选</button>
                    <button type="button" onClick={invertAutoRules}>反选</button>
                  </div>
                  <div className="auto-rule-list" ref={autoRuleListRef}>
                    {displayRules.map((rule) => {
                      const isCustom = !isBuiltinRuleId(rule.id);
                      return (
                        <label key={rule.id} className={`auto-rule-option${isCustom ? ' custom-rule' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedAutoRuleIds.includes(rule.id)}
                            onChange={() => toggleAutoRule(rule.id)}
                          />
                          <span>
                            <strong>{rule.label}</strong>
                            <small>{rule.description}</small>
                          </span>
                          <em>{autoRuleMatchCounts[rule.id] ?? 0} 条</em>
                          {isCustom && (
                            <button
                              type="button"
                              className="custom-rule-delete-btn"
                              title="删除自定义规则"
                              onClick={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                deleteCustomRule(rule.id);
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </label>
                      );
                    })}
                    <div className="custom-rule-add-form">
                      <div className="custom-rule-add-title">自定义规则</div>
                      <input
                        type="text"
                        placeholder="规则名称（如：星巴克）"
                        value={newCustomLabel}
                        onChange={(e) => setNewCustomLabel(e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="关键词，逗号分隔（如：星巴克,STARBUCKS）"
                        value={newCustomKeywords}
                        onChange={(e) => setNewCustomKeywords(e.target.value)}
                      />
                      <button
                        type="button"
                        className="primary-button compact"
                        disabled={!newCustomLabel.trim() || !newCustomKeywords.trim()}
                        onClick={(event) => {
                          event.preventDefault();
                          addCustomRule();
                        }}
                      >
                        添加规则
                      </button>
                    </div>
                  </div>
                  <div className="auto-rule-scroll-buttons">
                    <button type="button" onClick={scrollAutoRuleListToTop} title="到顶">
                      <ChevronUp size={14} />
                    </button>
                    <button type="button" onClick={scrollAutoRuleListToBottom} title="到底">
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  </Popover.Content>
                </Popover.Portal>
              </div>
            </Popover.Root>
            <button
              type="button"
              className={showBoundaryReview ? 'ghost-button compact-secondary-action active' : 'ghost-button compact-secondary-action'}
              disabled={!boundaryCases.length}
              onClick={() => setShowBoundaryReview((prev) => !prev)}
              title="挑出最可能误判的记录，请你确认"
            >
              边界复核 {boundaryCases.length}
            </button>
            <button
              type="button"
              className="primary-button compact-action"
              disabled={!filteredRecords.length || !selectedAutoRuleIds.length || !autoRuleMatchedCount}
              onClick={applyAutoRulesToFiltered}
              title={
                autoRuleImpact.addCount > 0
                  ? `将新增 ${autoRuleImpact.addCount} 条 · 涉及 ¥${formatCurrency(autoRuleImpact.addAmount)}`
                  : '当前筛选结果中没有可被规则筛入的记录'
              }
            >
              一键筛入 {autoRuleMatchedCount}
            </button>
            {autoRuleImpact.addCount > 0 && (
              <span className="impact-preview">
                影响预览：+{autoRuleImpact.addCount} 条 · ¥{formatCurrency(autoRuleImpact.addAmount)}
              </span>
            )}
            <ColumnVisibilityMenu
              columns={expenseColumnOrder}
              labels={expenseColumnLabels}
              hiddenKeys={hiddenExpenseColumnKeys}
              lockedKeys={['actions', 'company']}
              onToggle={toggleExpenseColumnVisibility}
              onReorder={reorderExpenseColumn}
            />
            <button
              type="button"
              className="ghost-button compact-secondary-action"
              disabled={!filteredRecords.length}
              onClick={() => setCompanyExpenseForFiltered(true)}
            >
              全选
            </button>
            <button
              type="button"
              className="ghost-button compact-secondary-action"
              disabled={!filteredRecords.length}
              onClick={invertSelectedFiltered}
            >
              反选
            </button>
            <button
              type="button"
              className="ghost-button compact-secondary-action danger-action"
              disabled={!selectedRecords.length}
              onClick={deleteSelectedFiltered}
            >
              <Trash2 size={14} />
              删除
            </button>
            <span className="batch-remark-group">
              <input
                type="text"
                className="table-cell-input batch-remark-input"
                placeholder="批量填入备注…"
                value={batchRemarkValue}
                onChange={(event) => setBatchRemarkValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyBatchRemark(); } }}
              />
              <button
                type="button"
                className="ghost-button compact-secondary-action"
                disabled={!batchRemarkValue.trim() || !filteredRecords.length}
                onClick={applyBatchRemark}
              >
                批量填备注
              </button>
            </span>
          </div>

          <div className="selection-tools">
            <div className="selection-summary">
              <span>
                显示 {displayExpenseRecords.length} / {filteredRecords.length}
                {showOnlySelected && selectedRecords.length > 0
                  ? `（仅已选 ${selectedRecords.length} 条）`
                  : ` 条，当前筛选结果已选 ${filteredSelectedCount} / ${filteredRecords.length} 条`}
              </span>
              <label className={`only-selected-toggle${showOnlySelected ? ' active' : ''}`}>
                <input
                  type="checkbox"
                  checked={showOnlySelected}
                  onChange={(event) => setShowOnlySelected(event.target.checked)}
                />
                仅显示已选
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  className={`ghost-button compact-secondary-action reset-filters-btn${!filteredRecords.length ? ' reset-filters-btn-urgent' : ''}`}
                  onClick={clearFilters}
                >
                  重置筛选
                </button>
              )}
              <div className="action-row">
                <button
                  type="button"
                  className="ghost-button compact-secondary-action"
                  disabled={!filteredRecords.length}
                  onClick={() => setCompanyExpenseForFiltered(true)}
                >
                  全选当前筛选结果
                </button>
                <button
                  type="button"
                  className="ghost-button compact-secondary-action"
                  disabled={!filteredRecords.length}
                  onClick={() => setCompanyExpenseForFiltered(false)}
                >
                  取消当前筛选结果
                </button>
              </div>
            </div>
          </div>

          {behaviorSuggestions.length > 0 && (
            <div className="suggestion-banner">
              <div className="suggestion-banner-head">
                <strong>发现候选规则</strong>
                <span>根据你的勾选习惯归纳，{behaviorSuggestions.length} 个关键词可能值得设为自动筛入规则</span>
              </div>
              <ul className="suggestion-list">
                {behaviorSuggestions.map((suggestion) => (
                  <li key={suggestion.keyword} className="suggestion-item">
                    <span className="suggestion-keyword">含「{suggestion.keyword}」</span>
                    <span className="suggestion-meta">
                      你在 {suggestion.selectedCount} 条选中记录里用到，未选中里仅 {suggestion.unselectedCount} 条 · 置信度{' '}
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                    <span className="suggestion-actions">
                      <button
                        type="button"
                        className="primary-button compact"
                        onClick={() => saveBehaviorSuggestion(suggestion)}
                      >
                        存为规则
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-secondary-action"
                        onClick={() =>
                          setDismissedSuggestionKeywords((prev) => new Set(prev).add(suggestion.keyword))
                        }
                      >
                        忽略
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showBoundaryReview && boundaryCases.length > 0 && (
            <div className="boundary-panel">
              <div className="boundary-panel-head">
                <strong>边界主动复核</strong>
                <span>以下 {boundaryCases.length} 条最可能需要你确认（按风险排序），点「采纳」即按建议处理</span>
              </div>
              <ul className="boundary-list">
                {boundaryCases.map((item) => {
                  const insight = insightById[item.record.id];
                  return (
                    <li key={item.record.id} className={`boundary-case boundary-${item.kind}`}>
                      <span className="boundary-kind" title={item.kind}>
                        {item.kind === 'missed' ? '可能漏选' : item.kind === 'over-included' ? '可能多选' : '低置信度'}
                      </span>
                      <span className="boundary-info">
                        <span className="boundary-reason">{item.reason}</span>
                        <span className="boundary-detail">
                          {item.record.counterparty || item.record.productName || item.record.transactionType || '—'} · ¥
                          {formatCurrency(item.record.amount)}
                          {insight && (
                            <span className={`confidence-dot confidence-${insight.confidence.level}`} title={`置信度 ${insight.confidence.score}`} />
                          )}
                        </span>
                      </span>
                      <span className="boundary-actions">
                        <button
                          type="button"
                          className="primary-button compact"
                          onClick={() => applyBoundaryCase(item)}
                        >
                          采纳{item.suggestedAction === 'select' ? '勾选' : '移出'}
                        </button>
                        <button
                          type="button"
                          className="ghost-button compact-secondary-action"
                          onClick={() => dismissBoundaryCase(item)}
                        >
                          忽略
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="table-wrap table-density-compact">
            <table>
              <thead>
                <tr>
                  {visibleExpenseColumnOrder.map((columnKey) => renderExpenseHeader(columnKey))}
                </tr>
              </thead>
              <tbody>
                {displayExpenseRecords.map((record) => (
                  <tr
                    key={record.id}
                    className={[
                      'expense-row',
                      record.isCompanyExpense ? 'selected-row' : '',
                      isLegalHolidayDate(record.dateTime) ? 'holiday-row' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={(event) => handleExpenseRowClick(event, record)}
                  >
                    {visibleExpenseColumnOrder.map((columnKey) => renderExpenseCell(columnKey, record))}
                  </tr>
                ))}
              </tbody>
            </table>
            {showOnlySelected && !displayExpenseRecords.length && filteredRecords.length > 0 && (
              <div className="empty-state empty-state-with-action">
                <span>当前没有已选中的记录，{filteredRecords.length} 条未选中记录被隐藏。</span>
                <button type="button" className="primary-button compact" onClick={() => setShowOnlySelected(false)}>
                  显示全部记录
                </button>
              </div>
            )}
            {!filteredRecords.length && records.length > 0 && !showOnlySelected && (
              <div className="empty-state empty-state-with-action">
                <span>当前筛选条件下没有消费记录，剩余 {records.length} 条未显示。</span>
                {hasActiveFilters && (
                  <button type="button" className="primary-button compact" onClick={clearFilters}>
                    重置所有筛选条件
                  </button>
                )}
              </div>
            )}
            {!records.length && <div className="empty-state">当前筛选条件下没有消费记录。</div>}
          </div>

          <div className="bottom-actions">
            <span>
              已选择 {selectedRecords.length} 条，合计 ¥{formatCurrency(totalAmount)}
            </span>
            <button type="button" className="primary-button compact" onClick={() => setActiveTab('result')}>
              生成报销表
            </button>
          </div>
        </section>
      )}

      {activeTab === 'result' && (
        <section className="panel">
          <div className="toolbar result-toolbar">
            <h2>报销结果</h2>
            <div className="action-row result-toolbar-actions">
              <Popover.Root open={isResultExcludeRuleMenuOpen} onOpenChange={setIsResultExcludeRuleMenuOpen}>
                <div className="auto-rule-control">
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className={selectedResultExcludeRuleIds.length ? 'filter-chip compact-filter-chip active' : 'filter-chip compact-filter-chip'}
                      aria-label="筛除规则"
                    >
                      <Filter size={14} />
                      筛除规则
                      {selectedResultExcludeRuleIds.length > 0 && <small>{selectedResultExcludeRuleIds.length}</small>}
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content className="auto-rule-menu result-exclude-menu" align="start" sideOffset={7}>
                    <div className="auto-rule-menu-title">
                      <strong>筛除规则</strong>
                      <span>只作用于当前报销结果</span>
                    </div>
                    <div className="auto-rule-list result-exclude-rule-list">
                      {resultExcludeRules.map((rule) => (
                        <div key={rule.id} className="auto-rule-option result-exclude-rule-option">
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedResultExcludeRuleIds.includes(rule.id)}
                              onChange={() => toggleResultExcludeRule(rule.id)}
                            />
                            <span>
                              <strong>{rule.label}</strong>
                              <small>{rule.description}</small>
                            </span>
                            <em>{resultExcludeRuleMatchCounts[rule.id]} 条</em>
                          </label>
                          <div className="rule-inline-actions">
                            <button
                              type="button"
                              className="ghost-button compact-danger-action rule-action-button"
                              disabled={!resultExcludeRuleMatchCounts[rule.id]}
                              onClick={() => excludeResultRecordsByRule(rule.id)}
                            >
                              筛除
                            </button>
                            <button
                              type="button"
                              className="ghost-button compact-restore-action rule-action-button"
                              disabled={!resultExcludeHistory[rule.id]?.length}
                              onClick={() => restoreResultExcludeByRule(rule.id)}
                            >
                              复原 {resultExcludeHistory[rule.id]?.[resultExcludeHistory[rule.id].length - 1]?.length ?? 0}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ghost-button compact-danger-action result-exclude-all-button"
                      disabled={!filteredSelectedRecords.length || !selectedResultExcludeRuleIds.length || !resultExcludeMatchedCount}
                      onClick={excludeResultRecordsBySelectedRules}
                    >
                      一键全部筛除 {resultExcludeMatchedCount}
                    </button>
                    </Popover.Content>
                  </Popover.Portal>
                </div>
              </Popover.Root>
              <button
                type="button"
                className="ghost-button result-toolbar-button"
                disabled={!reimbursements.length}
                onClick={openFormBuilder}
                title="按维度分组生成结构化报销单，可保存模板并导出"
              >
                结构化报销单
              </button>
              <button
                type="button"
                className="ghost-button result-toolbar-button"
                disabled={!selectedRecords.length}
                onClick={classifySelectedReimbursements}
              >
                自动分类
              </button>
              <button
                type="button"
                className="ghost-button result-toolbar-button"
                onClick={addManualReimbursementRecord}
              >
                新增记录
              </button>
              <button
                type="button"
                className="primary-button compact result-toolbar-button"
                disabled={!selectedRecords.length || isSyncingFeishu}
                onClick={syncSelectedRecordsToFeishu}
              >
                {isSyncingFeishu ? '同步中...' : '同步到飞书'}
              </button>
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="ghost-button result-toolbar-button"
                    disabled={!reimbursements.length}
                  >
                    <Download size={17} /> 导出
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className="export-menu" align="start" sideOffset={7}>
                    <button type="button" onClick={exportReimbursementsToXlsx}>
                      Excel
                    </button>
                    <button type="button" onClick={exportReimbursementsToCsv}>
                      CSV
                    </button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <button
                type="button"
                className="ghost-button compact-secondary-action"
                disabled={!sortedResultRecords.length}
                onClick={selectAllResultRows}
              >
                全选
              </button>
              <button
                type="button"
                className="ghost-button compact-secondary-action"
                disabled={!sortedResultRecords.length}
                onClick={invertResultSelection}
              >
                反选
              </button>
              <button
                type="button"
                className="ghost-button compact-secondary-action danger-action"
                disabled={!selectedResultRowIds.size}
                onClick={batchRemoveSelectedResults}
              >
                <Trash2 size={14} />
                删除选中
              </button>
              <ColumnVisibilityMenu
                columns={resultColumnOrder}
                labels={resultColumnLabels}
                hiddenKeys={hiddenResultColumnKeys}
                lockedKeys={['remove']}
                onToggle={toggleResultColumnVisibility}
                onReorder={reorderResultColumn}
              />
            </div>
          </div>
          {(feishuSyncResult || feishuSyncError) && (
            <div className={feishuSyncError ? 'sync-status error' : 'sync-status'}>
              {feishuSyncError ? (
                <span>{feishuSyncError}</span>
              ) : (
                <span>
                  飞书同步完成：新增 {feishuSyncResult?.created ?? 0} 条，更新 {feishuSyncResult?.updated ?? 0} 条，失败{' '}
                  {feishuSyncResult?.failed ?? 0} 条
                </span>
              )}
              {!!feishuSyncResult?.failures?.length && (
                <details>
                  <summary>查看失败明细</summary>
                  <ul>
                    {feishuSyncResult.failures.map((failure) => (
                      <li key={failure.syncId}>
                        {failure.syncId}: {failure.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="table-wrap table-density-compact">
            <table>
              <thead>
                <tr>
                  {visibleResultColumnOrder.map((columnKey) => renderResultHeader(columnKey))}
                </tr>
              </thead>
              <tbody>
                {sortedResultRecords.map((record) => (
                  <tr
                    key={record.id}
                    className={isLegalHolidayDate(record.dateTime) ? 'holiday-row' : ''}
                  >
                    {visibleResultColumnOrder.map((columnKey) => renderResultCell(columnKey, record))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!selectedRecords.length && <div className="empty-state">请先在消费筛选页勾选公司消费。</div>}
            {!!selectedRecords.length && !sortedResultRecords.length && (
              <div className="empty-state">当前报销结果筛选条件下没有记录。</div>
            )}
          </div>
        </section>
      )}

      <datalist id="project-options">
        {projectOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="category-options">
        {categoryOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </main>
    <Footer
      version={__APP_VERSION__}
      buildTime={__APP_BUILD_TIME__}
      onShowChangelog={() => setShowChangelog(true)}
      onExportBackup={exportLocalBackup}
      onImportFile={importLocalBackup}
      onImportFromClipboard={importFromClipboard}
      onShareProgress={shareProgress}
      onExportEncrypted={exportEncrypted}
      onImportEncryptedFile={importEncryptedFile}
    />
    <div className="page-scroll-buttons">
      <button type="button" title="回到顶部" onClick={() => window.scrollTo({ top: 0 })}>
        <ChevronUp />
      </button>
      <button type="button" title="滚动到底部" onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight })}>
        <ChevronDown />
      </button>
    </div>
    {showChangelog && (
      <div className="changelog-overlay" onClick={() => setShowChangelog(false)}>
        <div className="changelog-modal" onClick={(event) => event.stopPropagation()}>
          <div className="changelog-header">
            <h2>版本说明</h2>
            <button type="button" className="changelog-close" onClick={() => setShowChangelog(false)}>
              ✕
            </button>
          </div>
          <div className="changelog-body">
            {changelog.map((entry) => (
              <section key={entry.version} className="changelog-entry">
                <div className="changelog-entry-head">
                  <span className="changelog-version">v{entry.version}</span>
                  <span className="changelog-date">{entry.date}</span>
                  <span className="changelog-title">{entry.title}</span>
                </div>
                <ul className="changelog-changes">
                  {entry.changes.map((change, index) => (
                    <li key={index}>{change}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    )}

    {showFormBuilder && (
      <div className="changelog-overlay form-builder-overlay" onClick={() => setShowFormBuilder(false)}>
        <div className="changelog-modal form-builder-modal" onClick={(event) => event.stopPropagation()}>
          <div className="changelog-header">
            <h2>结构化报销单</h2>
            <button type="button" className="changelog-close" onClick={() => setShowFormBuilder(false)}>
              ✕
            </button>
          </div>
          <div className="form-builder-body">
            <div className="form-template-bar">
              <label className="form-field">
                <span>模板</span>
                <select value={activeTemplateId} onChange={(event) => applyFormTemplate(event.target.value)}>
                  {formTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="ghost-button compact"
                onClick={() => deleteFormTemplate(activeTemplateId)}
                disabled={formTemplates.length <= 1}
              >
                删除模板
              </button>
              <span className="form-template-save">
                <input
                  type="text"
                  placeholder="模板名称"
                  value={newTemplateName}
                  onChange={(event) => setNewTemplateName(event.target.value)}
                />
                <button type="button" className="primary-button compact" onClick={saveCurrentAsTemplate}>
                  另存为模板
                </button>
              </span>
            </div>

            <div className="form-picker-group">
              <div className="form-picker">
                <strong>分组维度（勾选即层级顺序）</strong>
                <div className="form-chip-row">
                  {(Object.keys(FORM_DIM_LABELS) as FormGroupDim[]).map((dim) => (
                    <label key={dim} className={formGroupBy.includes(dim) ? 'form-chip active' : 'form-chip'}>
                      <input type="checkbox" checked={formGroupBy.includes(dim)} onChange={() => toggleFormDim(dim)} />
                      {FORM_DIM_LABELS[dim]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-picker">
                <strong>明细列</strong>
                <div className="form-chip-row">
                  {(Object.keys(FORM_COLUMN_LABELS) as FormColumnKey[]).map((key) => (
                    <label key={key} className={formColumns.includes(key) ? 'form-chip active' : 'form-chip'}>
                      <input type="checkbox" checked={formColumns.includes(key)} onChange={() => toggleFormColumn(key)} />
                      {FORM_COLUMN_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-preview" id="form-preview-area">
              <div className="form-preview-title">{formModel.title}</div>
              <div className="form-preview-meta">
                合计 ¥{formatCurrency(formModel.totalAmount)} · 共 {formModel.totalCount} 条
              </div>
              {flattenFormRows(formModel, formColumns).map((row, index) => {
                if (row.kind === 'title') return null;
                if (row.kind === 'group') {
                  return (
                    <div key={index} className="form-group-head" style={{ marginLeft: row.depth * 16 }}>
                      {row.dim ? FORM_DIM_LABELS[row.dim] : '全部'}：{row.value}
                      <span className="form-group-amount">
                        （{row.count} 条 · ¥{formatCurrency(row.amount)}）
                      </span>
                    </div>
                  );
                }
                if (row.kind === 'detail') {
                  return (
                    <div key={index} className="form-detail-row" style={{ marginLeft: row.depth * 16 }}>
                      {row.cells.map((cell) => (
                        <span key={cell.key} className={cell.key === 'amount' ? 'form-cell amount' : 'form-cell'}>
                          <em>{cell.label}</em>
                          {cell.key === 'amount' ? formatCurrency(Number(cell.value)) : cell.value}
                        </span>
                      ))}
                    </div>
                  );
                }
                if (row.kind === 'subtotal') {
                  return (
                    <div key={index} className="form-subtotal" style={{ marginLeft: row.depth * 16 }}>
                      小计（{row.count} 条） · ¥{formatCurrency(row.amount)}
                    </div>
                  );
                }
                return (
                  <div key={index} className="form-grandtotal">
                    合计 · ¥{formatCurrency(row.amount)}（{row.count} 条）
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-builder-footer">
            <button type="button" className="ghost-button" onClick={() => setShowFormBuilder(false)}>
              关闭
            </button>
            <button type="button" className="ghost-button" onClick={printStructuredForm}>
              打印 / 导出 PDF
            </button>
            <button type="button" className="primary-button" onClick={exportStructuredForm}>
              导出 Excel（结构化）
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ColumnVisibilityMenu<T extends string>({
  columns,
  labels,
  hiddenKeys,
  lockedKeys,
  onToggle,
  onReorder,
}: {
  columns: T[];
  labels: Record<T, string>;
  hiddenKeys: T[];
  lockedKeys: T[];
  onToggle: (columnKey: T) => void;
  onReorder: (draggedColumnKey: T, targetColumnKey: T, placement: 'before' | 'after') => void;
}) {
  const [draggedColumnKey, setDraggedColumnKey] = useState<T | null>(null);
  const [pointerDraggedColumnKey, setPointerDraggedColumnKey] = useState<T | null>(null);
  const [dropTarget, setDropTarget] = useState<{ columnKey: T; placement: 'before' | 'after' } | null>(null);
  const activeDraggedColumnKey = pointerDraggedColumnKey ?? draggedColumnKey;

  useEffect(() => {
    if (!pointerDraggedColumnKey) return;
    function clearPointerDrag() {
      setPointerDraggedColumnKey(null);
      setDropTarget(null);
    }
    document.addEventListener('pointerup', clearPointerDrag);
    return () => document.removeEventListener('pointerup', clearPointerDrag);
  }, [pointerDraggedColumnKey]);

  function handleColumnDrop(event: React.DragEvent<HTMLDivElement>, targetColumnKey: T) {
    event.preventDefault();
    if (!activeDraggedColumnKey || activeDraggedColumnKey === targetColumnKey) {
      setDraggedColumnKey(null);
      setPointerDraggedColumnKey(null);
      setDropTarget(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    onReorder(activeDraggedColumnKey, targetColumnKey, placement);
    setDraggedColumnKey(null);
    setPointerDraggedColumnKey(null);
    setDropTarget(null);
  }

  function handlePointerDrop(event: React.PointerEvent<HTMLDivElement>, targetColumnKey: T) {
    if (!pointerDraggedColumnKey || pointerDraggedColumnKey === targetColumnKey || !dropTarget) return;
    event.preventDefault();
    onReorder(pointerDraggedColumnKey, targetColumnKey, dropTarget.placement);
    setPointerDraggedColumnKey(null);
    setDropTarget(null);
  }

  function updateDropTarget(event: React.DragEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>, columnKey: T) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget({ columnKey, placement });
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="ghost-button compact-secondary-action">
          列显示
          {!!hiddenKeys.length && <small>{columns.length - hiddenKeys.length}/{columns.length}</small>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="column-visibility-menu" align="start" sideOffset={7}>
          <strong>显示列</strong>
          <div className="checkbox-list compact-checkbox-list">
            {columns.map((columnKey) => {
              const isLocked = lockedKeys.includes(columnKey);
              const isDragging = activeDraggedColumnKey === columnKey;
              const dropPlacement = dropTarget?.columnKey === columnKey ? dropTarget.placement : null;
              return (
                <div
                  key={columnKey}
                  className={[
                    'column-visibility-row',
                    isDragging ? 'dragging' : '',
                    dropPlacement ? `drop-${dropPlacement}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onDragOver={(event) => updateDropTarget(event, columnKey)}
                  onPointerMove={(event) => {
                    if (pointerDraggedColumnKey) updateDropTarget(event, columnKey);
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => handleColumnDrop(event, columnKey)}
                  onPointerUp={(event) => handlePointerDrop(event, columnKey)}
                >
                  <button
                    type="button"
                    className="column-drag-handle"
                    draggable
                    aria-label={`拖动${labels[columnKey]}调整列顺序`}
                    title="拖动调整列顺序"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setPointerDraggedColumnKey(columnKey);
                    }}
                    onDragStart={(event) => {
                      setDraggedColumnKey(columnKey);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', columnKey);
                    }}
                    onDragEnd={() => {
                      setDraggedColumnKey(null);
                      setDropTarget(null);
                    }}
                  >
                    <span />
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={!hiddenKeys.includes(columnKey)}
                      disabled={isLocked}
                      onChange={() => onToggle(columnKey)}
                    />
                    <span>{labels[columnKey]}{isLocked ? '（固定）' : ''}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function FilterHeader({
  label,
  filterKey,
  columnKey,
  className,
  options,
  query,
  value,
  isOpen,
  isDragging,
  dragProps,
  onToggle,
  onConfirm,
  onQueryChange,
  onChange,
}: {
  label: string;
  filterKey: ColumnFilterKey | ResultFilterKey | 'month';
  columnKey: ExpenseColumnKey | ResultColumnKey;
  className?: string;
  options: string[];
  query: string;
  value: ColumnFilterValue;
  isOpen: boolean;
  isDragging: boolean;
  dragProps: React.HTMLAttributes<HTMLTableCellElement>;
  onToggle: () => void;
  onConfirm: () => void;
  onQueryChange: (query: string) => void;
  onChange: (patch: Partial<ColumnFilterValue>) => void;
}) {
  const { refs, floatingStyles } = useFloating({
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const setReferenceRef = (node: HTMLButtonElement | null) => refs.setReference(node);
  const setFloatingRef = (node: HTMLDivElement | null) => refs.setFloating(node);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = options.filter((option) => option.toLowerCase().includes(normalizedQuery));
  const selectedSet = new Set(value.values);

  function toggleOption(option: string) {
    const next = selectedSet.has(option)
      ? value.values.filter((item) => item !== option)
      : [...value.values, option];
    onChange({ values: next });
  }

  function selectVisible() {
    onChange({ values: Array.from(new Set([...value.values, ...visibleOptions])) });
  }

  function invertVisible() {
    const visibleSet = new Set(visibleOptions);
    const kept = value.values.filter((item) => !visibleSet.has(item));
    const added = visibleOptions.filter((item) => !selectedSet.has(item));
    onChange({ values: [...kept, ...added] });
  }

  const summary = value.values.length ? `${value.mode === 'include' ? '正选' : '反选'} ${value.values.length}` : '';

  return (
    <th
      className={[className, 'filter-th', isDragging ? 'dragging' : ''].filter(Boolean).join(' ')}
      data-column-key={columnKey}
      {...dragProps}
    >
      <div className="th-filter-label">
        <span>{label}</span>
        <button
          ref={setReferenceRef}
          type="button"
          className={value.values.length ? 'filter-trigger active' : 'filter-trigger'}
          aria-label={`${label}筛选`}
          aria-expanded={isOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <Filter size={14} />
        </button>
      </div>
      {summary && <small>{summary}</small>}
      {isOpen && (
        <FloatingPortal>
          <div
            ref={setFloatingRef}
            className="filter-menu"
            data-filter-key={filterKey}
            style={floatingStyles}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="mode-toggle" role="group" aria-label={`${label}筛选模式`}>
              <button
                type="button"
                className={value.mode === 'include' ? 'active' : ''}
                onClick={() => onChange({ mode: 'include' })}
              >
                正选
              </button>
              <button
                type="button"
                className={value.mode === 'exclude' ? 'active' : ''}
                onClick={() => onChange({ mode: 'exclude' })}
              >
                反选
              </button>
            </div>
            <input
              value={query}
              placeholder="搜索选项"
              onChange={(event) => onQueryChange(event.target.value)}
            />
            <div className="filter-menu-actions">
              <button type="button" onClick={selectVisible}>
                全选结果
              </button>
              <button type="button" onClick={invertVisible}>
                反转结果
              </button>
              <button type="button" onClick={() => onChange({ values: [] })}>
                清空
              </button>
            </div>
            <div className="checkbox-list">
              {visibleOptions.map((option) => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(option)}
                    onChange={() => toggleOption(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
              {!visibleOptions.length && <p>没有匹配选项</p>}
            </div>
            <button type="button" className="filter-confirm-button" onClick={onConfirm}>
              确定
            </button>
          </div>
        </FloatingPortal>
      )}
    </th>
  );
}

export default App;
