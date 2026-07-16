// 端到端加密备份：PBKDF2 从口令派生 AES-GCM 256 密钥，加密全量本地进度
// 设计目标：备份文件即使泄露，无口令也无法解密；用户持口令，设备丢失/清缓存可恢复

const ENC_PREFIX = 'ENC1:';

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// 把 Uint8Array 转成 BlobPart 友好的 ArrayBuffer（规避 TS5 Uint8Array<ArrayBufferLike> 限制）
function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', toArrayBuffer(enc.encode(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// 加密全量数据，返回可序列化的 ENC1: 字符串（salt|iv|ciphertext 拼接后 base64）
export async function encryptBackup(data: Record<string, string | null>, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext));
  const combined = new Uint8Array(salt.length + iv.length + cipher.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(cipher), salt.length + iv.length);
  return ENC_PREFIX + toB64(combined);
}

// 解密；口令错误或数据损坏返回 null
export async function decryptBackup(payload: string, password: string): Promise<Record<string, string | null> | null> {
  const trimmed = payload.trim();
  if (!trimmed.startsWith(ENC_PREFIX)) return null;
  let combined: Uint8Array;
  try {
    combined = fromB64(trimmed.slice(ENC_PREFIX.length));
  } catch {
    return null;
  }
  if (combined.length < 28) return null;
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const cipher = combined.slice(28);
  try {
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, cipher);
    const data = JSON.parse(new TextDecoder().decode(plain));
    if (!data || typeof data !== 'object') return null;
    return data as Record<string, string | null>;
  } catch {
    return null;
  }
}

// 下载文本为文件
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
