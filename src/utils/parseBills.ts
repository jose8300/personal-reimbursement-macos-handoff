import Papa from 'papaparse';
import * as XLSX from '@e965/xlsx';
import { fallbackFields, platformMappings, type FieldKey } from '../config/fieldMappings';
import type { ExpenseRecord, ParseSummary, SourcePlatform } from '../types/expense';
import { getMonth, normalizeDateInput, parseAmount } from './format';

type ParsedSheet = {
  rows: Record<string, unknown>[];
  headers: string[];
  headerRowNumber: number;
  metadata: Record<string, string>;
};

type ParseResult = {
  records: ExpenseRecord[];
  summaries: ParseSummary[];
};

function normalizeHeader(header: string) {
  return header.replace(/\s/g, '').replace(/[：:]/g, '').toLowerCase();
}

function findHeader(headers: string[], candidates: string[]) {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    const exact = normalizedHeaders.find((header) => header.normalized === normalizedCandidate);
    if (exact) return exact.original;
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    const partial = normalizedHeaders.find(
      (header) =>
        header.normalized.includes(normalizedCandidate) ||
        normalizedCandidate.includes(header.normalized),
    );
    if (partial) return partial.original;
  }

  return '';
}

function detectPlatform(fileName: string, headers: string[]): SourcePlatform {
  const lowerFileName = fileName.toLowerCase();
  const normalizedHeaders = headers.map(normalizeHeader);
  const byFileName = platformMappings.find((mapping) =>
    mapping.fileNameHints.some((hint) => lowerFileName.includes(hint.toLowerCase())),
  );
  if (byFileName) return byFileName.platform;

  const byHeaders = platformMappings
    .map((mapping) => ({
      mapping,
      score: mapping.requiredHints.filter((hint) =>
        normalizedHeaders.some((header) => header.includes(normalizeHeader(hint))),
      ).length,
    }))
    .sort((a, b) => b.score - a.score)[0];

  return byHeaders?.score > 0 ? byHeaders.mapping.platform : '未知';
}

function readCell(row: Record<string, unknown>, header: string) {
  return header ? row[header] : '';
}

function isIncomeRow(row: Record<string, unknown>) {
  const directionHeaders = ['收/支', '收入/支出', '收支', '类型'];
  return directionHeaders.some((header) => {
    const value = String(row[header] ?? '').trim();
    return value === '收入' || value === '收' || value.includes('退款');
  });
}

function createRecord(
  row: Record<string, unknown>,
  rowIndex: number,
  fileName: string,
  headers: string[],
  headerRowNumber: number,
  metadata: Record<string, string>,
): ExpenseRecord | null {
  const sourcePlatform = detectPlatform(fileName, headers);
  const platformConfig = platformMappings.find((mapping) => mapping.platform === sourcePlatform);
  const fields = {} as Record<FieldKey, string>;

  ([
    'dateTime',
    'amount',
    'merchant',
    'transactionType',
    'counterparty',
    'productName',
    'billRemark',
    'paymentAccount',
  ] as FieldKey[]).forEach((key) => {
    fields[key] = findHeader(headers, [
      ...(platformConfig?.fields[key] ?? []),
      ...fallbackFields[key],
    ]);
  });

  const dateTime = normalizeDateInput(readCell(row, fields.dateTime));
  const amount = parseAmount(readCell(row, fields.amount));
  const transactionType = String(readCell(row, fields.transactionType) ?? '').trim();
  const counterparty = String(readCell(row, fields.counterparty) ?? '').trim();
  const productName = sourcePlatform === '银行卡' ? '' : String(readCell(row, fields.productName) ?? '').trim();
  const billRemark = String(readCell(row, fields.billRemark) ?? '').trim();
  const merchant = String(readCell(row, fields.merchant) || counterparty || productName || '').trim();
  const paymentAccount = String(
    sourcePlatform === '银行卡'
      ? metadata['账号'] || metadata['账户'] || readCell(row, fields.paymentAccount)
      : readCell(row, fields.paymentAccount) || metadata['账号'] || metadata['账户'] || '',
  ).trim();

  if (!dateTime || !amount || isIncomeRow(row)) return null;

  return {
    id: `${fileName}-${rowIndex}-${dateTime}-${amount}-${merchant}`,
    sourceFile: fileName,
    sourcePlatform,
    originalRowNumber: headerRowNumber + rowIndex + 1,
    raw: row,
    dateTime,
    amount,
    merchant: merchant || '未识别说明',
    transactionType,
    counterparty,
    productName,
    billRemark,
    paymentAccount: paymentAccount || '未识别账户',
    isCompanyExpense: false,
    reimbursementMonth: getMonth(dateTime),
    reimburser: 'Musk',
    project: '',
    category: '',
    note: '',
  };
}

async function parseWorkbook(file: File): Promise<ParsedSheet> {
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
  if (replacementCount < 5) return stripCr(utf8);

  try {
    return stripCr(new TextDecoder('gb18030').decode(buffer));
  } catch {
    return stripCr(utf8);
  }
}

// 去掉回车符，避免 CRLF 账单（如支付宝真实导出）在分隔符检测异常时整表被合并成单列。
function stripCr(text: string) {
  return text.replace(/\r/g, '');
}

function rowsFromMatrix(matrix: unknown[][]): ParsedSheet {
  const normalized = matrix.map((row) => row.map((cell) => cellToText(cell)));
  const headerRowIndex = findHeaderRowIndex(normalized);
  if (headerRowIndex < 0) return { rows: [], headers: [], headerRowNumber: 0, metadata: {} };

  const headers = dedupeHeaders(normalized[headerRowIndex]);
  const metadata = extractMetadata(normalized.slice(0, headerRowIndex));
  const rows = normalized.slice(headerRowIndex + 1).map((row) => {
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
    metadata,
  };
}

function findHeaderRowIndex(matrix: string[][]) {
  const knownHeaders = Array.from(
    new Set(
      Object.values(fallbackFields)
        .flat()
        .concat(platformMappings.flatMap((mapping) => mapping.requiredHints)),
    ),
  );

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

  return bestScore >= 2 ? bestIndex : -1;
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

function extractMetadata(rows: string[][]) {
  const metadata: Record<string, string> = {};
  rows.forEach((row) => {
    row.forEach((cell, index) => {
      const compact = cell.trim();
      if (!compact) return;
      const bracketMatch = compact.match(/^(.+?)[：:]\[(.+)]$/);
      if (bracketMatch) metadata[bracketMatch[1].trim()] = bracketMatch[2].trim();
      const next = row[index + 1]?.trim();
      if ((compact === '账号' || compact === '账户') && next) metadata[compact] = next;
    });
  });
  return metadata;
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return String(value).trim();
}

export async function parseBillFiles(files: File[]): Promise<ParseResult> {
  const allRecords: ExpenseRecord[] = [];
  const summaries: ParseSummary[] = [];

  for (const file of files) {
    const { rows, headers, headerRowNumber, metadata } = await parseWorkbook(file);
    const records = rows
      .map((row, index) => createRecord(row, index, file.name, headers, headerRowNumber, metadata))
      .filter((record): record is ExpenseRecord => Boolean(record));

    allRecords.push(...records);
    summaries.push({
      fileName: file.name,
      platform: detectPlatform(file.name, headers),
      rows: rows.length,
      imported: records.length,
    });
  }

  return { records: allRecords, summaries };
}
