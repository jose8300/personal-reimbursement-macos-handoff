import { useRef } from 'react';

export function Footer({
  version,
  buildTime,
  onShowChangelog,
  onExportBackup,
  onImportBackup,
}: {
  version: string;
  buildTime: string;
  onShowChangelog: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
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
        onClick={() => importInputRef.current?.click()}
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
          if (file) onImportBackup(file);
          event.target.value = '';
        }}
      />
    </footer>
  );
}
