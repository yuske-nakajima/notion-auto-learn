#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# .env 読み込み + export
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "ERROR: .env が見つかりません → ./bin/init.sh を先に実行してください"
  exit 1
fi

source "$ROOT_DIR/.env"
export NOTION_API_KEY="${NOTION_API_KEY:?NOTION_API_KEY が未設定です}"
export NOTION_PARENT_PAGE_URL="${NOTION_PARENT_PAGE_URL:?NOTION_PARENT_PAGE_URL が未設定です}"

# 親ページ ID を抽出してプロンプトに埋め込む
PARENT_PAGE_ID=$(echo "$NOTION_PARENT_PAGE_URL" | sed -E 's|.*/([a-f0-9]{32}).*|\1|' | sed 's/-//g')

PROMPT=$(sed "s|{{NOTION_API_KEY}}|${NOTION_API_KEY}|g; s|{{PARENT_PAGE_ID}}|${PARENT_PAGE_ID}|g" "$ROOT_DIR/prompts/init-db.md")

echo "=== DB 作成を開始 ==="
echo "親ページ ID: ${PARENT_PAGE_ID:0:8}..."
echo ""

claude -p "$PROMPT" --verbose
