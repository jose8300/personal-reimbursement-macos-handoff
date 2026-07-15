#!/bin/zsh
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "正在启动个人报销系统..."
echo "项目目录：$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "没有检测到 Node.js。请先安装 Node.js LTS："
  echo "https://nodejs.org/"
  echo ""
  read -r "?安装完成后按回车关闭窗口。"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo ""
  echo "没有检测到 npm。请重新安装 Node.js LTS："
  echo "https://nodejs.org/"
  echo ""
  read -r "?安装完成后按回车关闭窗口。"
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); const ok = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22; process.exit(ok ? 0 : 1)'; then
  echo ""
  echo "当前 Node.js 版本不兼容。"
  echo "请安装 Node.js 22.12 或更新的 LTS 版本：https://nodejs.org/"
  echo ""
  read -r "?安装完成后按回车关闭窗口。"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo ""
  echo "第一次启动，正在按锁定版本安装依赖。这个过程可能需要几分钟..."
  npm ci
fi

echo ""
echo "启动完成后请在浏览器打开："
echo "http://127.0.0.1:5173/"
echo ""
echo "关闭本窗口即可停止工具。"
echo ""

npm run dev
