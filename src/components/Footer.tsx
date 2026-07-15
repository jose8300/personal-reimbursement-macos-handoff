import { useRef } from 'react';

export function Footer({
  version,
  buildTime,
  onShowChangelog,
  onExportBackup,
  onImportFile,
  onImportFromClipboard,
}: {
  version: string;
  buildTime: string;
  onShowChangelog: () => void;
  onExportBackup: () => void;
  onImportFile: (file: File) => void;
  onImportFromClipboard: (text: string) => void;
}) {
  const importInputRef = useRef<HTMLInputElement>(null);
  return (
    <footer className="app-footer">
      <span>版本 v{version}</span>
      <span className="footer-sep">·</span>
      <span>更新于 {buildTime}</span>
      <span className="footer-sep">·</span>
      <button type="button" className="footer-link" onClick={onShowChangelog}>
        版本说明
      </button>
      <span className="footer-sep">·</span>
      <button type="button" className="footer-link" onClick={onExportBackup}>
        导出备份
      </button>
      <button
        type="button"
        className="footer-link"
        onClick={async () => {
          // 优先从剪贴板读取（导出时已复制）；读不到再走文件选择
          try {
            const text = await navigator.clipboard.readText();
            if (text && text.includes('personal-reimbursement')) {
              onImportFromClipboard(text);
              return;
            }
          } catch {
            // 剪贴板不可读，回退到文件选择
          }
          importInputRef.current?.click();
        }}
      >
        导入备份
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportFile(file);
          event.target.value = '';
        }}
      />
    </footer>
  );
}
