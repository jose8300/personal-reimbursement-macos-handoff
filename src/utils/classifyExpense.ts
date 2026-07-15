import type { ExpenseRecord } from '../types/expense';

type Classification = {
  project: string;
  category: string;
};

type Rule = {
  category: string;
  project: string;
  keywords: string[];
};

const classificationRules: Rule[] = [
  {
    category: '交通',
    project: '差旅',
    keywords: [
      '12306',
      '中铁',
      '高铁',
      '火车',
      '机票',
      '航旅',
      '旅行社',
      '携程',
      '滴滴',
      '打车',
      '代驾',
      '货拉拉',
      '高速',
      'etc',
      '停车',
      '车位',
      '顺易通',
      '捷停车',
      '一点停',
      'i车位',
      '停车王',
      '通行费',
    ],
  },
  {
    category: '住宿',
    project: '差旅',
    keywords: ['酒店', '宾馆', '住宿', '民宿', '华住', '亚朵', '全季', '桔子酒店'],
  },
  {
    category: '通讯',
    project: '差旅',
    keywords: ['sim', '天际通', '流量', '话费', '通讯', 'club sim'],
  },
  {
    category: '软件服务',
    project: '内部运营',
    keywords: ['腾讯云', '云费用', '服务器', '软件', '订阅', 'saas', 'openai', 'github', 'notion'],
  },
  {
    category: '办公用品',
    project: '内部运营',
    keywords: ['办公', '文具', '打印', '耗材', '快递', '物流', '顺丰', '京东', '发票'],
  },
  {
    category: '餐饮',
    project: '客户招待',
    keywords: [
      '餐',
      '饭',
      '菜',
      '粉',
      '汤包',
      '点餐',
      '美团',
      '大众点评',
      '收银',
      '酒小二',
      'bonfire',
      '绿树红莲',
      '金稻园',
      '红荔村',
      '沃歌斯',
      '醉鹅',
      '油焖大虾',
      '咖啡',
      '茶',
    ],
  },
  {
    category: '其他',
    project: '内部运营',
    keywords: ['保险', '保费', '医保', '健康保险'],
  },
  {
    category: '其他',
    project: '市场活动',
    keywords: ['活动', '会务', '展会', '广告', '宣传', '物料', '礼品'],
  },
];

export function classifyExpenseRecord(record: ExpenseRecord): Classification {
  const text = [
    record.transactionType,
    record.counterparty,
    record.productName,
    record.billRemark,
    record.merchant,
    record.note,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const matchedRule = classificationRules.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword.toLowerCase())),
  );

  return matchedRule
    ? { project: matchedRule.project, category: matchedRule.category }
    : { project: '其他', category: '其他' };
}

export function fillMissingClassification(record: ExpenseRecord): ExpenseRecord {
  const classification = classifyExpenseRecord(record);
  return {
    ...record,
    project: record.project || classification.project,
    category: record.category || classification.category,
  };
}
