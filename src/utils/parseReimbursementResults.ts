import Papa from 'papaparse';
import * as XLSX from '@e965/xlsx';
import type { ExpenseRecord, ParseSummary, SourcePlatform } from '../types/expense';
import { getDateOnly, getMonth, normalizeDateInput, parseAmount } from './format';

type ReimbursementFieldKey =
  | 'month'
  | 'date'
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

type ParsedResultSheet = {
  rows: Record<string, unknown>[];
  headers: string[];
  headerRowNumber: number;
};

const reimbursementFieldAliases: Record<ReimbursementFieldKey, string[]> = {
  month: ['月份', '报销月份', '月'],
  date: ['日期', '消费日期', '交易日期', '消费时间', '时间'],
  reimburser: ['报销人', '申请人', '经办人'],
  project: ['报销项目', '项目'],
  category: ['费用类别', '报销类别', '类别'],
  transactionType: ['交易类型/来源', '交易类型', '交易来源地', '类型'],
  counterparty: ['交易对方', '对方', '商户', '商户名称'],
  productName: ['商品名称', '商品', '交易名称'],
  billRemark: ['备注', '账单备注', '原始备注'],
  description: ['报销摘要', '消费说明', '说明', '摘要', '交易说明'],
  amount: ['金额', '消费金额', '报销金额', '支出金额'],
  paymentAccount: ['支付账户', '支付方式', '扣款账户', '账户'],
  sourcePlatform: ['来源平台', '平台', '账单来源'],
  note: ['报销备注', '备注说明', '个人备注'],
};

function normalizeHeader(header: string) {
  return header.replace(/\s/g, '').replace(/[：:]/g, '').toLowerCase();
}

function findHeader(headers: string[], aliases: string[]) {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const exact = normalizedHeaders.find((header) => header.normalized === normalizedAlias);
    if (exact) return exact.original;
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const partial = normalizedHeaders.find(
      (header) =>
        header.normalized.includes(normalizedAlias) ||
        normalizedAlias.includes(header.normalized),
    );
    if (partial) return partial.original;
  }

  return '';
}

function readCell(row: Record<string, unknown>, header: string) {
  return header ? String(row[header] ?? '').trim() : '';
}

function toSourcePlatform(value: string): SourcePlatform {
  if (value.includes('微信')) return '微信';
  if (value.includes('支付宝')) return '支付宝';
  if (value.includes('信用卡')) return '信用卡';
  if (value.includes('银行') || value.includes('银行卡')) return '银行卡';
  return '未知';
}

function normalizeResultDate(value: string, month: string) {
  const clean = value.replace(/\s*周[日一二三四五六]\s*$/, '').trim();
  const normalized = normalizeDateInput(clean || month).replace(/\//g, '-');
  const dateTimeMatch = normalized.match(
    /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
  );
  if (!dateTimeMatch) return getDateOnly(normalized);

  const [, year, rawMonth, rawDay = '01', rawHour, rawMinute, rawSecond = '00'] = dateTimeMatch;
  const date = `${year}-${rawMonth.padStart(2, '0')}-${rawDay.padStart(2, '0')}`;
  if (!rawHour || !rawMinute) return date;
  return `${date} ${rawHour.padStart(2, '0')}:${rawMinute.padStart(2, '0')}:${rawSecond.padStart(2, '0')}`;
}

function normalizeResultMonth(value: string, date: string) {
  const clean = value.trim();
  const directMatch = clean.match(/^(\d{4})[-/](\d{1,2})$/);
  if (directMatch) return `${directMatch[1]}-${directMatch[2].padStart(2, '0')}`;
  const normalized = getMonth(normalizeDateInput(clean));
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
  return getMonth(date);
}

function createRecordFromResult(
  row: Record<string, unknown>,
  rowIndex: number,
  fileName: string,
  headers: string[],
  headerRowNumber: number,
): ExpenseRecord | null {
  const fields = {} as Record<ReimbursementFieldKey, string>;
  Object.entries(reimbursementFieldAliases).forEach(([key, aliases]) => {
    fields[key as ReimbursementFieldKey] = findHeader(headers, aliases);
  });

  const amount = parseAmount(readCell(row, fields.amount));
  const month = readCell(row, fields.month);
  const date = normalizeResultDate(readCell(row, fields.date), month);
  const reimbursementMonth = normalizeResultMonth(month, date);
  const reimburser = readCell(row, fields.reimburser);
  const project = readCell(row, fields.project);
  const category = readCell(row, fields.category);
  const transactionType = readCell(row, fields.transactionType);
  const counterparty = readCell(row, fields.counterparty);
  const productName = readCell(row, fields.productName);
  const billRemark = readCell(row, fields.billRemark);
  const description = readCell(row, fields.description);
  const paymentAccount = readCell(row, fields.paymentAccount);
  const sourcePlatform = toSourcePlatform(readCell(row, fields.sourcePlatform));
  const note = readCell(row, fields.note);
  const merchant = counterparty || productName || description;

  if (!amount || !date || (!merchant && !transactionType)) return null;

  return {
    id: `${fileName}-reimbursement-${rowIndex}-${date}-${amount}-${merchant}`,
    sourceFile: fileName,
    sourcePlatform,
    originalRowNumber: headerRowNumber + rowIndex + 1,
    raw: row,
    dateTime: date,
    amount,
    merchant: merchant || '导入报销记录',
    transactionType,
    counterparty,
    productName,
    billRemark,
    paymentAccount: paymentAccount || '未识别账户',
    isCompanyExpense: true,
    reimbursementMonth,
    reimburser: reimburser || 'Musk',
    project: project === '未填写项目' ? '' : project,
    category: category === '未分类' ? '' : category,
    note,
  };
}

async function parseResultWorkbook(file: File): Promise<ParsedResultSheet> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await decodeCsv(file);
    const result = Papa.parse<unknown[]>(text, {
      header: false,
      skipEmptyLines: true,
    });
    return rowsFromMatrix(result.data);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rowsFromMatrix(matrix);
}

async function decodeCsv(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacementCount < 5) return utf8;

  try {
    return new TextDecoder('gb18030').decode(buffer);
  } catch {
    return utf8;
  }
}

function rowsFromMatrix(matrix: unknown[][]): ParsedResultSheet {
  const normalized = matrix.map((row) => row.map((cell) => cellToText(cell)));
  const headerRowIndex = findHeaderRowIndex(normalized);
  if (headerRowIndex < 0) return { rows: [], headers: [], headerRowNumber: 0 };

  const headers = dedupeHeaders(normalized[headerRowIndex]);
  const rows = normalized
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const item: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header) item[header] = row[index] ?? '';
      });
      return item;
    });

  return {
    rows,
    headers: headers.filter(Boolean),
    headerRowNumber: headerRowIndex + 1,
  };
}

function findHeaderRowIndex(matrix: string[][]) {
  const knownHeaders = Object.values(reimbursementFieldAliases).flat();
  let bestIndex = -1;
  let bestScore = 0;

  matrix.forEach((row, index) => {
    const normalizedRow = row.map(normalizeHeader).filter(Boolean);
    const score = knownHeaders.filter((hint) =>
      normalizedRow.some((cell) => cell === normalizeHeader(hint)),
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 3 ? bestIndex : -1;
}

function dedupeHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const clean = header.trim();
    if (!clean) return '';
    const count = seen.get(clean) ?? 0;
    seen.set(clean, count + 1);
    return count ? `${clean}_${count + 1}` : clean;
  });
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export async function parseReimbursementResultFiles(files: File[]) {
  const allRecords: ExpenseRecord[] = [];
  const summaries: ParseSummary[] = [];

  for (const file of files) {
    const parsed = await parseResultWorkbook(file);
    const records = parsed.rows
      .map((row, index) =>
        createRecordFromResult(row, index, file.name, parsed.headers, parsed.headerRowNumber),
      )
      .filter(Boolean) as ExpenseRecord[];

    allRecords.push(...records);
    summaries.push({
      fileName: file.name,
      platform: '报销结果',
      rows: parsed.rows.length,
      imported: records.length,
    });
  }

  return { records: allRecords, summaries };
}
