import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ExpenseRecord, ReimbursementRecord } from '../types/expense';
import { toReimbursementRecord } from './reimbursementSync';

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
