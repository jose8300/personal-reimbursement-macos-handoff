export type SourcePlatform = '微信' | '支付宝' | '银行卡' | '信用卡' | '未知';

export type ExpenseRecord = {
  id: string;
  sourceFile: string;
  sourcePlatform: SourcePlatform;
  originalRowNumber: number;
  raw: Record<string, unknown>;
  dateTime: string;
  amount: number;
  merchant: string;
  transactionType: string;
  counterparty: string;
  productName: string;
  billRemark: string;
  paymentAccount: string;
  isCompanyExpense: boolean;
  reimbursementMonth: string;
  reimburser: string;
  project: string;
  category: string;
  note: string;
};

export type ReimbursementRecord = {
  syncId: string;
  month: string;
  date: string;
  reimburser: string;
  project: string;
  category: string;
  transactionType: string;
  counterparty: string;
  productName: string;
  billRemark: string;
  description: string;
  amount: number;
  paymentAccount: string;
  sourcePlatform: SourcePlatform;
  note: string;
};

export type ParseSummary = {
  fileName: string;
  platform: SourcePlatform | '报销结果';
  rows: number;
  imported: number;
};
