export function Footer({
  version,
  buildTime,
  onShowChangelog,
}: {
  version: string;
  buildTime: string;
  onShowChangelog: () => void;
}) {
  return (
    <footer className="app-footer">
      <span>版本 v{version}</span>
      <span className="footer-sep">·</span>
      <span>更新于 {buildTime}</span>
      <span className="footer-sep">·</span>
      <button type="button" className="footer-link" onClick={onShowChangelog}>
        版本说明
      </button>
    </footer>
  );
}
