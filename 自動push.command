#!/bin/bash
set -e

echo "🌿 s-bin 同步開始..."
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [ ! -d ".git" ]; then
  echo "❌ 這不是 git 倉庫：$PROJECT_DIR"
  exit 1
fi

PORT=4444
LOCAL_URL="http://127.0.0.1:${PORT}/career/engineer-1-on-1/"
LOG_FILE="/tmp/s-bin-localhost.log"

echo "🖥️ 檢查 localhost:${PORT} 服務..."
if lsof -iTCP:${PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "ℹ️ localhost:${PORT} 已在運行"
else
  echo "▶️ 啟動 localhost:${PORT}"
  nohup python3 -m http.server ${PORT} > "${LOG_FILE}" 2>&1 &
  sleep 1
fi

echo "🌐 開啟 ${LOCAL_URL}"
open "${LOCAL_URL}" || true

echo "🔄 拉取遠端更新（rebase）..."
git pull --rebase origin main

echo "📦 提交本地變更（如果有）..."
git add -A
if ! git diff --cached --quiet; then
  git commit -m "Update s-bin site files"
else
  echo "ℹ️ 沒有需要提交的變更"
fi

echo "🚀 推送至遠端..."
git push origin main

echo "✅ 已推送至 https://github.com/recdnd/s-bin"
echo "🔍 本地預覽：${LOCAL_URL}"
read -n 1 -s -r -p "按任意鍵退出..."
