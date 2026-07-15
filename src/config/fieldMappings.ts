import type { SourcePlatform } from '../types/expense';

export type FieldKey =
  | 'dateTime'
  | 'amount'
  | 'merchant'
  | 'transactionType'
  | 'counterparty'
  | 'productName'
  | 'billRemark'
  | 'paymentAccount';

export type PlatformMapping = {
  platform: SourcePlatform;
  fileNameHints: string[];
  requiredHints: string[];
  fields: Record<FieldKey, string[]>;
};

export const platformMappings: PlatformMapping[] = [
  {
    platform: '微信',
    fileNameHints: ['微信', 'wechat', 'weixin'],
    requiredHints: ['交易时间', '交易金额', '商品', '收/付款方式', '当前状态', '交易类型'],
    fields: {
      dateTime: ['交易时间', '支付时间', '消费时间', '时间', '转账时间'],
      amount: ['交易金额(元)', '交易金额', '金额(元)', '金额', '支出金额', '金额(元)'],
      merchant: ['商品', '商户', '交易对方', '摘要', '交易说明', '说明', '商品名称', '备注', '资金去向'],
      transactionType: ['交易类型', '类型'],
      counterparty: ['交易对方', '交易对手名称', '商户', '收款方', '付款方', '对手信息'],
      productName: ['商品', '商品名称', '交易说明', '摘要', '备注'],
      billRemark: ['备注', '附言'],
      paymentAccount: ['收/付款方式', '付款方式', '支付方式', '扣款账户', '账户', '支付方式', '当前状态'],
    },
  },
  {
    platform: '支付宝',
    fileNameHints: ['支付宝', 'alipay'],
    requiredHints: ['交易创建时间', '交易时间', '金额', '交易对方', '付款方式', '收/付款方式', '商品说明', '商品名称', '交易分类'],
    fields: {
      dateTime: ['交易创建时间', '付款时间', '交易时间', '消费时间', '时间'],
      amount: ['金额（元）', '金额(元)', '金额', '支出金额'],
      merchant: ['商品说明', '商品名称', '交易对方', '商户', '摘要', '交易说明', '说明'],
      transactionType: ['交易分类', '交易来源地', '来源地', '交易地点', '类型'],
      counterparty: ['交易对方', '交易对手名称', '商户'],
      productName: ['商品说明', '商品名称', '商品', '交易说明', '摘要'],
      billRemark: ['备注', '附言'],
      paymentAccount: ['付款方式', '收/付款方式', '支付方式', '扣款账户', '账户'],
    },
  },
  {
    platform: '银行卡',
    fileNameHints: ['银行', 'bank', 'debit'],
    requiredHints: ['交易日期', '取出金额', '交易类型', '交易对手名称'],
    fields: {
      dateTime: ['交易日期', '交易时间', '记账日期', '消费时间', '时间'],
      amount: ['取出金额', '支出', '支出金额', '交易金额', '金额', '发生额'],
      merchant: ['交易对手名称', '交易摘要', '交易类型', '摘要', '用途', '交易说明', '商户', '对方户名'],
      transactionType: ['交易类型', '类型', '交易摘要'],
      counterparty: ['交易对手名称', '对方户名', '交易对方', '商户'],
      productName: [],
      billRemark: ['附言', '备注', '用途'],
      paymentAccount: ['账号', '账户', '卡号', '扣款账户', '付款账号'],
    },
  },
  {
    platform: '信用卡',
    fileNameHints: ['信用卡', 'credit', 'visa', 'mastercard'],
    requiredHints: ['入账日期', '消费金额', '交易描述', '卡号'],
    fields: {
      dateTime: ['入账日期', '交易日期', '消费时间', '交易时间', '时间'],
      amount: ['消费金额', '人民币金额', '交易金额', '金额', '支出金额'],
      merchant: ['交易描述', '商户名称', '商户', '摘要', '交易说明'],
      transactionType: ['交易类型', '类型', '交易来源地', '来源地', '交易地点'],
      counterparty: ['商户名称', '商户', '交易对方', '交易对手名称'],
      productName: ['商品名称', '商品', '交易描述', '交易说明', '摘要'],
      billRemark: ['备注', '附言'],
      paymentAccount: ['卡号', '账户', '扣款账户', '支付方式'],
    },
  },
];

export const fallbackFields: Record<FieldKey, string[]> = {
  dateTime: ['消费时间', '交易时间', '交易日期', '日期', '时间', '付款时间', '交易创建时间', '入账日期'],
  amount: ['消费金额', '交易金额', '金额', '支出', '支出金额', '取出金额', '金额(元)', '金额（元）'],
  merchant: ['商户', '摘要', '交易说明', '说明', '交易对方', '交易对手名称', '商品', '商品名称', '交易描述'],
  transactionType: ['交易类型', '类型', '交易摘要', '交易来源地', '来源地', '交易地点'],
  counterparty: ['交易对方', '交易对手名称', '对方户名', '商户', '商户名称'],
  productName: ['商品名称', '商品', '附言', '用途', '交易描述', '交易说明', '摘要'],
  billRemark: ['备注', '附言', '用途'],
  paymentAccount: ['支付方式', '扣款账户', '付款方式', '账户', '账号', '卡号', '收/付款方式'],
};
