#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1: $2"; }

# .env 読み込み
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo ".env が見つかりません。先に bin/init.sh を実行してください。"
  exit 1
fi
source "$ROOT_DIR/.env"

# 必須変数チェック
if [ -z "${NOTION_API_KEY:-}" ]; then
  echo "NOTION_API_KEY が未設定です。"
  exit 1
fi
if [ -z "${NOTION_PARENT_PAGE_URL:-}" ]; then
  echo "NOTION_PARENT_PAGE_URL が未設定です。"
  exit 1
fi

# 親ページ ID を URL から抽出（末尾32文字の hex）
PARENT_PAGE_ID=$(echo "$NOTION_PARENT_PAGE_URL" | grep -oE '[a-f0-9]{32}' | tail -1)
if [ -z "$PARENT_PAGE_ID" ]; then
  # ハイフン付き UUID 形式の場合
  PARENT_PAGE_ID=$(echo "$NOTION_PARENT_PAGE_URL" | grep -oE '[a-f0-9-]{36}' | tail -1 | tr -d '-')
fi
if [ -z "$PARENT_PAGE_ID" ]; then
  echo "NOTION_PARENT_PAGE_URL から親ページ ID を抽出できませんでした。"
  echo "URL: $NOTION_PARENT_PAGE_URL"
  exit 1
fi

# UUID 形式に変換（8-4-4-4-12）
PARENT_PAGE_UUID="${PARENT_PAGE_ID:0:8}-${PARENT_PAGE_ID:8:4}-${PARENT_PAGE_ID:12:4}-${PARENT_PAGE_ID:16:4}-${PARENT_PAGE_ID:20:12}"
log "INFO" "親ページ ID: $PARENT_PAGE_UUID"

# --- 1. データベース作成 ---
log "INFO" "データベースを作成中..."

DB_RESPONSE=$(curl -s -X POST "https://api.notion.com/v1/databases" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": { "type": "page_id", "page_id": "'"$PARENT_PAGE_UUID"'" },
    "title": [
      { "type": "text", "text": { "content": "知らないことリスト" } }
    ],
    "properties": {
      "用語": { "title": {} },
      "ステータス": {
        "select": {
          "options": [
            { "name": "登録", "color": "red" },
            { "name": "調査中", "color": "yellow" },
            { "name": "調査完了", "color": "green" },
            { "name": "理解済", "color": "blue" }
          ]
        }
      },
      "カテゴリ": {
        "select": {
          "options": [
            { "name": "技術", "color": "purple" },
            { "name": "一般", "color": "gray" },
            { "name": "ビジネス", "color": "orange" }
          ]
        }
      },
      "処理日": { "date": {} },
      "メモ": { "rich_text": {} }
    }
  }')

# エラーチェック
if echo "$DB_RESPONSE" | jq -e '.object == "error"' > /dev/null 2>&1; then
  log "FAIL" "データベース作成に失敗しました"
  echo "$DB_RESPONSE" | jq .
  exit 1
fi

DB_ID=$(echo "$DB_RESPONSE" | jq -r '.id')
DB_URL=$(echo "$DB_RESPONSE" | jq -r '.url')
log "OK" "データベース作成完了"
log "INFO" "DB ID: $DB_ID"
log "INFO" "DB URL: $DB_URL"

# --- 2. テストデータ追加 ---
add_page() {
  local term="$1"
  local category="$2"

  local RESPONSE=$(curl -s -X POST "https://api.notion.com/v1/pages" \
    -H "Authorization: Bearer ${NOTION_API_KEY}" \
    -H "Notion-Version: 2022-06-28" \
    -H "Content-Type: application/json" \
    -d '{
      "parent": { "database_id": "'"$DB_ID"'" },
      "properties": {
        "用語": {
          "title": [
            { "type": "text", "text": { "content": "'"$term"'" } }
          ]
        },
        "ステータス": {
          "select": { "name": "登録" }
        },
        "カテゴリ": {
          "select": { "name": "'"$category"'" }
        }
      }
    }')

  if echo "$RESPONSE" | jq -e '.object == "error"' > /dev/null 2>&1; then
    log "FAIL" "「$term」の追加に失敗"
    echo "$RESPONSE" | jq .
    return 1
  fi
  log "OK" "テストデータ追加: $term"
}

log "INFO" "テストデータを追加中..."
add_page "CRDT" "技術"
add_page "量子コンピュータ" "技術"

# --- 3. 案内表示 ---
echo ""
echo "=========================================="
echo "  データベース作成完了！"
echo "=========================================="
echo ""
echo "DB URL: $DB_URL"
echo ""
echo "この URL を .env の NOTION_DB_URL に貼ってください:"
echo "  NOTION_DB_URL=$DB_URL"
echo ""
