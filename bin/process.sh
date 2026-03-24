#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# --- ヘルスチェック（失敗したら即終了） ---
"$SCRIPT_DIR/health-check.sh" || exit 1

source "$ROOT_DIR/.env"
export NOTION_API_KEY NOTION_DB_URL

LOG_LEVEL="${LOG_LEVEL:-info}"
WAIT_SECONDS="${WAIT_SECONDS:-1}"

log() {
  local level="$1" msg="$2"
  case "$LOG_LEVEL" in
    debug) ;;
    info)  [ "$level" = "DEBUG" ] && return ;;
    warn)  [ "$level" = "DEBUG" ] || [ "$level" = "INFO" ] && return ;;
    error) [ "$level" != "ERROR" ] && return ;;
  esac
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $level: $msg"
}

# DB ID 抽出
DB_ID=$(echo "$NOTION_DB_URL" | sed -E 's|.*[-/]([a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}).*|\1|' | sed 's/-//g')

# 1. 未処理アイテム取得
log "INFO" "未処理アイテムを取得中..."
PENDING_ITEMS=$(curl -s "https://api.notion.com/v1/databases/${DB_ID}/query" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"filter":{"property":"ステータス","select":{"equals":"未処理"}}}')

COUNT=$(echo "$PENDING_ITEMS" | jq '.results | length')
if [ "$COUNT" -eq 0 ]; then
  log "INFO" "未処理アイテムなし — 終了"
  exit 0
fi
log "INFO" "${COUNT} 件の未処理アイテムを検出"

# 2. 各アイテムを処理（プロセス置換で stdin を分離し claude -p の干渉を防ぐ）
while read -r item; do
  PAGE_ID=$(echo "$item" | jq -r '.id')
  TERM=$(echo "$item" | jq -r '.properties["用語"].title[0].plain_text')

  log "INFO" "処理開始 — $TERM"

  # ステータス → 処理中
  curl -s -X PATCH "https://api.notion.com/v1/pages/${PAGE_ID}" \
    -H "Authorization: Bearer ${NOTION_API_KEY}" \
    -H "Notion-Version: 2022-06-28" \
    -H "Content-Type: application/json" \
    -d '{"properties":{"ステータス":{"select":{"name":"処理中"}}}}' > /dev/null

  # claude -p で解説生成（< /dev/null で stdin を切断）
  PROMPT=$(sed "s/{{TERM}}/$TERM/g" "$ROOT_DIR/prompts/explain-term.md")
  EXPLANATION=$(claude -p "$PROMPT" < /dev/null 2>/dev/null) || {
    log "ERROR" "claude -p 失敗 — $TERM をスキップ"
    curl -s -X PATCH "https://api.notion.com/v1/pages/${PAGE_ID}" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28" \
      -H "Content-Type: application/json" \
      -d '{"properties":{"ステータス":{"select":{"name":"未処理"}}}}' > /dev/null
    continue
  }

  # Notion ページ本文に書き込み
  curl -s -X PATCH "https://api.notion.com/v1/blocks/${PAGE_ID}/children" \
    -H "Authorization: Bearer ${NOTION_API_KEY}" \
    -H "Notion-Version: 2022-06-28" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg text "$EXPLANATION" '{
      "children": [{
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "rich_text": [{"type": "text", "text": {"content": $text}}]
        }
      }]
    }')" > /dev/null

  # ステータス → 完了 + 処理日
  curl -s -X PATCH "https://api.notion.com/v1/pages/${PAGE_ID}" \
    -H "Authorization: Bearer ${NOTION_API_KEY}" \
    -H "Notion-Version: 2022-06-28" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg date "$(date -u +%Y-%m-%d)" '{
      "properties": {
        "ステータス": {"select": {"name": "完了"}},
        "処理日": {"date": {"start": $date}}
      }
    }')" > /dev/null

  log "INFO" "処理完了 — $TERM"
  sleep "$WAIT_SECONDS"
done < <(echo "$PENDING_ITEMS" | jq -c '.results[]')

log "INFO" "全件処理完了"
