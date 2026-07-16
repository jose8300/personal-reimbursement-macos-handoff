import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ExpenseRecord, ReimbursementRecord } from '../types/expense';
import { toReimbursementRecord } from './reimbursementSync';
import { flattenFormRows, FORM_COLUMN_LABELS, FORM_DIM_LABELS, type FormColumnKey, type FormGroupDim, type ReimbursementFormModel } from './reimbursementForm';
import { formatCurrency } from './format';

export function toReimbursementRecords(records: ExpenseRecord[]): ReimbursementRecord[] {
  return records
    .filter((record) => record.isCompanyExpense)
    .map(toReimbursementRecord);
}

function reimbursementToRows(records: ReimbursementRecord[]) {
  return records.map((record) => ({
    报销摘要: record.description,
    报销金额: record.amount,
    消费时间: record.date,
    报销人: record.reimburser,
    报销备注: record.note,
    报销项目: record.project,
    费用类别: record.category,
    来源平台: record.sourcePlatform,
    支付账户: record.paymentAccount,
    '交易对方': record.counterparty,
    '商品名称': record.productName,
    '交易类型/来源': record.transactionType,
    月份: record.month,
  }));
}

export function exportReimbursementsAsXlsx(records: ReimbursementRecord[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('报销表');
  const rows = reimbursementToRows(records);
  worksheet.columns = Object.keys(rows[0] ?? {}).map((key) => ({
    header: key,
    key,
    width: key === '报销摘要' ? 28 : 16,
  }));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };

  workbook.xlsx.writeBuffer().then((buffer) => {
    saveAs(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `个人报销表-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  });
}

export function exportReimbursementsAsCsv(records: ReimbursementRecord[]) {
  const rows = reimbursementToRows(records);
  const headers = Object.keys(rows[0] ?? {});
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header as keyof typeof row] ?? '').replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');
  saveAs(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), '个人报销表.csv');
}

function dimLabel(dim: FormGroupDim | null): string {
  return dim ? FORM_DIM_LABELS[dim] : '全部';
}

export function exportStructuredFormAsXlsx(model: ReimbursementFormModel, columns: FormColumnKey[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('报销单');
  const rows = flattenFormRows(model, columns);
  const colCount = Math.max(columns.length, 2);

  worksheet.mergeCells(1, 1, 1, colCount);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = model.title;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  worksheet.mergeCells(2, 1, 2, colCount);
  const metaCell = worksheet.getCell(2, 1);
  metaCell.value = `合计 ¥${formatCurrency(model.totalAmount)} · 共 ${model.totalCount} 条 · 生成于 ${model.generatedAt.slice(0, 10)}`;
  metaCell.font = { italic: true, color: { argb: 'FF666666' } };
  metaCell.alignment = { horizontal: 'center' };

  const headerRow = 3;
  columns.forEach((key, index) => {
    const cell = worksheet.getCell(headerRow, index + 1);
    cell.value = FORM_COLUMN_LABELS[key];
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
  });

  let rowIndex = headerRow + 1;
  for (const row of rows) {
    if (row.kind === 'title') continue;
    if (row.kind === 'group') {
      worksheet.mergeCells(rowIndex, 1, rowIndex, colCount);
      const cell = worksheet.getCell(rowIndex, 1);
      cell.value = `${dimLabel(row.dim)}：${row.value}（${row.count} 条 · ¥${formatCurrency(row.amount)}）`;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      rowIndex += 1;
    } else if (row.kind === 'detail') {
      row.cells.forEach((cellData, index) => {
        const cell = worksheet.getCell(rowIndex, index + 1);
        cell.value = cellData.value;
        if (cellData.key === 'amount') {
          cell.numFmt = '¥#,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
      rowIndex += 1;
    } else if (row.kind === 'subtotal') {
      worksheet.mergeCells(rowIndex, 1, rowIndex, colCount);
      const cell = worksheet.getCell(rowIndex, 1);
      cell.value = `小计（${row.count} 条） · ¥${formatCurrency(row.amount)}`;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'right' };
      cell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
      rowIndex += 1;
    } else if (row.kind === 'grand') {
      worksheet.mergeCells(rowIndex, 1, rowIndex, colCount);
      const cell = worksheet.getCell(rowIndex, 1);
      cell.value = `合计 · ¥${formatCurrency(row.amount)}（${row.count} 条）`;
      cell.font = { bold: true, size: 12 };
      cell.alignment = { horizontal: 'right' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      rowIndex += 1;
    }
  }

  for (let i = 1; i <= colCount; i += 1) {
    worksheet.getColumn(i).width = i === 1 ? 22 : 16;
  }

  workbook.xlsx.writeBuffer().then((buffer) => {
    saveAs(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `个人报销单-${model.generatedAt.slice(0, 10)}.xlsx`,
    );
  });
}
