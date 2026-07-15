import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type SyncRecord = {
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
  sourcePlatform: string;
  note: string;
};

type SyncRequest = {
  records: SyncRecord[];
};

type FeishuConfig = {
  appId: string;
  appSecret: string;
  appToken: string;
  tableId: string;
  tableName: string;
};

type FeishuField = {
  field_id: string;
  field_name: string;
  type: number;
};

type FeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

type FeishuTable = {
  table_id: string;
  name: string;
};

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const JSON_LIMIT_BYTES = 120 * 1024 * 1024;
const BATCH_SIZE = 500;

const requiredFields = [
  { name: '同步ID', type: 1 },
  { name: '报销摘要', type: 1 },
  { name: '报销金额', type: 2 },
  { name: '消费时间', type: 5 },
  { name: '报销人', type: 1 },
  { name: '报销备注', type: 1 },
  { name: '报销项目', type: 1 },
  { name: '费用类别', type: 1 },
  { name: '来源平台', type: 1 },
  { name: '支付账户', type: 1 },
  { name: '交易对方', type: 1 },
  { name: '商品名称', type: 1 },
  { name: '交易类型/来源', type: 1 },
  { name: '月份', type: 1 },
];

export function startFeishuServer(port = Number(process.env.FEISHU_PROXY_PORT || 8787)) {
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response);
    } catch (error) {
      writeJson(response, 500, {
        ok: false,
        message: error instanceof Error ? error.message : '未知服务错误',
      });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Feishu sync server listening on http://127.0.0.1:${port}`);
  });

  return server;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'GET' && request.url === '/api/feishu/health') {
    const config = await loadConfig();
    writeJson(response, 200, {
      ok: true,
      configured: Boolean(config.appId && config.appSecret && config.appToken && (config.tableId || config.tableName)),
      missing: missingConfigKeys(config),
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/feishu/sync') {
    const body = (await readJsonBody(request)) as SyncRequest;
    const result = await syncToFeishu(body);
    writeJson(response, 200, result);
    return;
  }

  writeJson(response, 404, { ok: false, message: '接口不存在' });
}

async function syncToFeishu(body: SyncRequest) {
  if (!Array.isArray(body.records)) throw new Error('同步数据格式错误：records 必须是数组');
  if (!body.records.length) return { ok: true, created: 0, updated: 0, failed: 0, failures: [] };

  const config = await loadConfig();
  const missing = missingConfigKeys(config);
  if (missing.length) throw new Error(`飞书配置缺失：${missing.join(', ')}`);

  const token = await getTenantAccessToken(config);
  const resolvedConfig = await resolveTableConfig(config, token);
  const fields = await ensureFields(resolvedConfig, token);
  const existingRecords = await listExistingRecords(resolvedConfig, token);
  const existingBySyncId = new Map<string, string>();
  existingRecords.forEach((record) => {
    const syncId = String(record.fields['同步ID'] ?? '').trim();
    if (syncId) existingBySyncId.set(syncId, record.record_id);
  });

  const failures: Array<{ syncId: string; message: string }> = [];

  const createPayload: Array<{ fields: Record<string, unknown> }> = [];
  const updatePayload: Array<{ record_id: string; fields: Record<string, unknown> }> = [];

  body.records.forEach((record) => {
    const recordFields = buildFeishuFields(record, fields);
    const recordId = existingBySyncId.get(record.syncId);
    if (recordId) {
      updatePayload.push({ record_id: recordId, fields: recordFields });
    } else {
      createPayload.push({ fields: recordFields });
    }
  });

  const created = await batchCreateRecords(resolvedConfig, token, createPayload);
  const updated = await batchUpdateRecords(resolvedConfig, token, updatePayload);

  return {
    ok: failures.length === 0,
    created,
    updated,
    failed: failures.length,
    failures,
  };
}

async function loadConfig(): Promise<FeishuConfig> {
  const envPath = resolve(process.cwd(), '.env.local');
  const env = existsSync(envPath) ? parseEnvFile(await readFile(envPath, 'utf-8')) : {};
  return {
    appId: env.FEISHU_APP_ID || process.env.FEISHU_APP_ID || '',
    appSecret: env.FEISHU_APP_SECRET || process.env.FEISHU_APP_SECRET || '',
    appToken: env.FEISHU_BITABLE_APP_TOKEN || process.env.FEISHU_BITABLE_APP_TOKEN || '',
    tableId: env.FEISHU_TABLE_ID || process.env.FEISHU_TABLE_ID || '',
    tableName: env.FEISHU_TABLE_NAME || process.env.FEISHU_TABLE_NAME || '报销记录',
  };
}

function parseEnvFile(text: string) {
  const env: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index < 0) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  });
  return env;
}

function missingConfigKeys(config: FeishuConfig) {
  return [
    ['FEISHU_APP_ID', config.appId],
    ['FEISHU_APP_SECRET', config.appSecret],
    ['FEISHU_BITABLE_APP_TOKEN', config.appToken],
    ['FEISHU_TABLE_ID 或 FEISHU_TABLE_NAME', config.tableId || config.tableName],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

async function getTenantAccessToken(config: FeishuConfig) {
  const data = await feishuFetch<{ tenant_access_token: string }>(
    '/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
    },
  );
  return data.tenant_access_token;
}

async function resolveTableConfig(config: FeishuConfig, token: string): Promise<FeishuConfig> {
  if (config.tableId) return config;

  const tables = await listTables(config, token);
  const existingTable = tables.find((table) => table.name === config.tableName);
  if (existingTable) return { ...config, tableId: existingTable.table_id };

  const tableId = await createTable(config, token);
  return { ...config, tableId };
}

async function listTables(config: FeishuConfig, token: string) {
  const tables: FeishuTable[] = [];
  let pageToken = '';
  do {
    const search = new URLSearchParams({ page_size: '100' });
    if (pageToken) search.set('page_token', pageToken);
    const data = await feishuFetch<{ items?: FeishuTable[]; page_token?: string; has_more?: boolean }>(
      `/bitable/v1/apps/${config.appToken}/tables?${search.toString()}`,
      { method: 'GET', token },
    );
    tables.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token || '' : '';
  } while (pageToken);
  return tables;
}

async function createTable(config: FeishuConfig, token: string) {
  const data = await feishuFetch<{ table_id?: string; table?: FeishuTable }>(
    `/bitable/v1/apps/${config.appToken}/tables`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        table: {
          name: config.tableName,
          default_view_name: '表格',
        },
      }),
    },
  );
  const tableId = data.table_id || data.table?.table_id;
  if (!tableId) throw new Error('飞书已创建数据表，但没有返回 table_id');
  return tableId;
}

async function ensureFields(config: FeishuConfig, token: string) {
  const fields = await listFields(config, token);
  const existingNames = new Set(fields.map((field) => field.field_name));
  for (const field of requiredFields) {
    if (existingNames.has(field.name)) continue;
    await feishuFetch(
      `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({
          field_name: field.name,
          type: field.type,
        }),
      },
    );
  }
  return listFields(config, token);
}

async function listFields(config: FeishuConfig, token: string) {
  const fields: FeishuField[] = [];
  let pageToken = '';
  do {
    const search = new URLSearchParams({ page_size: '100' });
    if (pageToken) search.set('page_token', pageToken);
    const data = await feishuFetch<{ items?: FeishuField[]; page_token?: string; has_more?: boolean }>(
      `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields?${search.toString()}`,
      { method: 'GET', token },
    );
    fields.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token || '' : '';
  } while (pageToken);
  return fields;
}

async function listExistingRecords(config: FeishuConfig, token: string) {
  const records: FeishuRecord[] = [];
  let pageToken = '';
  do {
    const search = new URLSearchParams({ page_size: '500' });
    if (pageToken) search.set('page_token', pageToken);
    const data = await feishuFetch<{ items?: FeishuRecord[]; page_token?: string; has_more?: boolean }>(
      `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records?${search.toString()}`,
      { method: 'GET', token },
    );
    records.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token || '' : '';
  } while (pageToken);
  return records;
}

function buildFeishuFields(record: SyncRecord, fields: FeishuField[]) {
  const fieldByName = new Map(fields.map((field) => [field.field_name, field]));
  const output: Record<string, unknown> = {};
  const dateValue = dateToTimestamp(record.date);

  setFeishuField(output, fieldByName, '同步ID', record.syncId, [1]);
  setFeishuField(output, fieldByName, '报销摘要', record.description, [1]);
  setFeishuField(output, fieldByName, '报销金额', record.amount, [2]);
  setFeishuField(output, fieldByName, '消费时间', dateValue, [5]);
  setFeishuField(output, fieldByName, '日期', dateValue, [5]);
  setFeishuField(output, fieldByName, '时间', dateValue, [5]);
  setFeishuField(output, fieldByName, '报销人', record.reimburser || 'Musk', [1, 3]);
  setFeishuField(output, fieldByName, '报销备注', record.note, [1]);
  setFeishuField(output, fieldByName, '报销项目', record.project, [1, 3]);
  setFeishuField(output, fieldByName, '费用类别', record.category, [1, 3]);
  setFeishuField(output, fieldByName, '来源平台', record.sourcePlatform, [1]);
  setFeishuField(output, fieldByName, '支付账户', record.paymentAccount, [1]);
  setFeishuField(output, fieldByName, '交易对方', record.counterparty, [1]);
  setFeishuField(output, fieldByName, '商品名称', record.productName, [1]);
  setFeishuField(output, fieldByName, '交易类型/来源', record.transactionType, [1]);
  setFeishuField(output, fieldByName, '月份', record.month, [1]);
  setFeishuField(output, fieldByName, '备注', record.billRemark, [1]);
  setFeishuField(output, fieldByName, '金额', record.amount, [2]);

  return output;
}

function setFeishuField(
  output: Record<string, unknown>,
  fieldByName: Map<string, FeishuField>,
  fieldName: string,
  value: unknown,
  allowedTypes: number[],
) {
  const field = fieldByName.get(fieldName);
  if (!field || !allowedTypes.includes(field.type) || value === undefined) return;
  output[fieldName] = value;
}

function dateToTimestamp(date: string) {
  const normalized = String(date || '').trim().replace(/\//g, '-');
  const match = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
  );
  if (!match) return undefined;

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const timestamp = new Date(
    `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}+08:00`,
  ).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

async function batchCreateRecords(
  config: FeishuConfig,
  token: string,
  records: Array<{ fields: Record<string, unknown> }>,
) {
  let count = 0;
  for (const chunk of chunkRecords(records)) {
    if (!chunk.length) continue;
    await feishuFetch(
      `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/batch_create`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ records: chunk }),
      },
    );
    count += chunk.length;
  }
  return count;
}

async function batchUpdateRecords(
  config: FeishuConfig,
  token: string,
  records: Array<{ record_id: string; fields: Record<string, unknown> }>,
) {
  let count = 0;
  for (const chunk of chunkRecords(records)) {
    if (!chunk.length) continue;
    await feishuFetch(
      `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/batch_update`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ records: chunk }),
      },
    );
    count += chunk.length;
  }
  return count;
}

function chunkRecords<T>(records: T[]) {
  const chunks: T[][] = [];
  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    chunks.push(records.slice(index, index + BATCH_SIZE));
  }
  return chunks;
}

async function feishuFetch<T = unknown>(
  path: string,
  options: RequestInit & { token?: string },
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json; charset=utf-8');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  const response = await fetch(`${FEISHU_API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.code !== 0) {
    throw new Error(formatFeishuError(payload, response.status));
  }
  return (payload.data ?? payload) as T;
}

function formatFeishuError(payload: Record<string, unknown>, statusCode: number) {
  const message = String(payload.msg || payload.message || `飞书接口调用失败：HTTP ${statusCode}`);
  const code = Number(payload.code);
  const authUrl = message.match(/https:\/\/open\.feishu\.cn\/app\/\S+/)?.[0];
  if (statusCode === 403 && code === 91403) {
    return '飞书多维表访问被拒绝：应用已有接口凭证，但还没有这份多维表的文档权限。请在目标多维表右上角「分享」里添加文档应用，并授予可编辑权限。';
  }
  if (message.includes('Access denied') || message.includes('尚未开通所需')) {
    const linkText = authUrl ? ` 权限申请链接：${authUrl}` : '';
    return `飞书应用权限不足：请在飞书开放平台给当前应用开通多维表格读写权限，并重新发布/生效应用。${linkText}`;
  }
  return message;
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > JSON_LIMIT_BYTES) throw new Error('同步数据过大，请分批同步');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  });
  response.end(JSON.stringify(payload));
}

if (process.argv[1]?.endsWith('feishuServer.ts')) {
  startFeishuServer();
}
