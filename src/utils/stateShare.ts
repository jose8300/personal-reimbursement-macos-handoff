// 进度可分享化：把本地 3 个键序列化、压缩、编码，生成可分享链接或分享码
// 设计目标：纯客户端、零后端，另一台设备打开链接或粘贴分享码即可恢复进度

const SHARE_PREFIX = 'PR1:';
const STATE_HASH_KEY = 'state';

// 与 App.tsx 中的 BACKUP_KEYS 保持一致（避免循环依赖，此处独立声明）
const SHARE_KEYS = [
  'personal-reimbursement-progress-v1',
  'personal-reimbursement-progress-versions-v1',
  'personal-reimbursement-custom-rules-v1',
];

type SharePayload = {
  app: string;
  schema: number;
  exportedAt: string;
  data: Record<string, string | null>;
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// 压缩（优先 gzip，不支持则退化为原始 UTF-8 base64）
async function compress(text: string): Promise<string> {
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!CS) {
    return bytesToBase64(new TextEncoder().encode(text));
  }
  const stream = new Blob([text]).stream().pipeThrough(new CS('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

async function decompress(b64: string): Promise<string> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  const bytes = base64ToBytes(b64);
  if (!DS) {
    return new TextDecoder().decode(bytes);
  }
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([ab]).stream().pipeThrough(new DS('gzip'));
  return await new Response(stream).text();
}

// 收集本地 3 个键，供分享与加密备份复用
export function collectLocalData(): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const k of SHARE_KEYS) {
    data[k] = typeof window !== 'undefined' ? window.localStorage.getItem(k) : null;
  }
  return data;
}

function buildPayload(): SharePayload {
  return {
    app: 'personal-reimbursement',
    schema: 1,
    exportedAt: new Date().toISOString(),
    data: collectLocalData(),
  };
}

// 分享进度：压缩编码后，优先生成 URL（不太长时），否则退化为复制分享码文本
export async function shareState(): Promise<'url' | 'code'> {
  const json = JSON.stringify(buildPayload());
  const code = SHARE_PREFIX + (await compress(json));
  const url = `${location.origin}${location.pathname}#${STATE_HASH_KEY}=${encodeURIComponent(code)}`;
  if (url.length < 60000) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 剪贴板不可用时忽略，仍返回 url 供手动复制
    }
    return 'url';
  }
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    // 忽略
  }
  return 'code';
}

// 解析分享码（PR1: 前缀的 gzip+base64 文本），返回本地键映射；非分享码返回 null
export async function parseSharedCode(raw: string): Promise<Record<string, string | null> | null> {
  const trimmed = raw.trim();
  let body = trimmed;
  if (trimmed.startsWith(SHARE_PREFIX)) {
    body = trimmed.slice(SHARE_PREFIX.length);
  } else {
    return null;
  }
  try {
    const json = await decompress(body);
    const payload = JSON.parse(json) as Partial<SharePayload>;
    if (payload?.app !== 'personal-reimbursement' || !payload.data) return null;
    return payload.data as Record<string, string | null>;
  } catch {
    return null;
  }
}

// 读取地址栏 hash 中的分享数据（#state=PR1:xxx），无则返回 null
export function getStateFromHash(): string | null {
  const m = location.hash.match(/[#&]state=([^&]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

// 清空 hash 中的分享数据（恢复后调用，避免刷新重复恢复 / 泄露在地址栏）
export function clearStateHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}
