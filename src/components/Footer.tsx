export function Footer({ version, buildTime }: { version: string; buildTime: string }) {
  return (
    <footer className="app-footer">
      <span>版本 v{version}</span>
      <span className="footer-sep">·</span>
      <span>更新于 {buildTime}</span>
    </footer>
  );
}
