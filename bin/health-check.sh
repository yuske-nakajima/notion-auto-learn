#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ERRORS=()

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1: $2"; }
log_ok()   { log "OK" "$1"; }
log_fail() { log "FAIL" "$1"; ERRORS+=("$1"); }

echo "=== health-check ==="

# --- 1. .env ファイルの存在 ---
if [ -f "$ROOT_DIR/.env" ]; then
  source "$ROOT_DIR/.env"
  log_ok ".env ファイルが存在"
else
  log_fail ".env が見つかりません → cp .env.example .env して設定してください"
  echo "=== ${#ERRORS[@]} 件のエラー ==="
  exit 1
fi

# --- 2. 必須環境変数 ---
[ -n "${NOTION_API_KEY:-}" ]  && log_ok "NOTION_API_KEY が設定済み" \
                              || log_fail "NOTION_API_KEY が未設定"
[ -n "${NOTION_DB_URL:-}" ]   && log_ok "NOTION_DB_URL が設定済み" \
                              || log_fail "NOTION_DB_URL が未設定"

# --- 3. 必須コマンド ---
for cmd in curl jq claude; do
  command -v "$cmd" > /dev/null 2>&1 \
    && log_ok "$cmd コマンドが利用可能" \
    || log_fail "$cmd が見つかりません → インストールしてください"
done

# --- 4. Notion API 疎通 ---
if [ -n "${NOTION_API_KEY:-}" ]; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://api.notion.com/v1/users/me" \
    -H "Authorization: Bearer ${NOTION_API_KEY}" \
    -H "Notion-Version: 2022-06-28")
  if [ "$HTTP_STATUS" = "200" ]; then
    log_ok "Notion API 疎通OK（200）"
  else
    log_fail "Notion API 疎通NG（HTTP $HTTP_STATUS）→ NOTION_API_KEY を確認"
  fi
fi

# --- 5. DB アクセス確認 ---
if [ -n "${NOTION_DB_URL:-}" ] && [ -n "${NOTION_API_KEY:-}" ]; then
  DB_ID=$(echo "$NOTION_DB_URL" | sed -E 's|.*/([a-f0-9]{32}).*|\1|' | sed 's/-//g')
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://api.notion.com/v1/databases/${DB_ID}" \
    -H "Authorization: Bearer ${NOTION_API_KEY}" \
    -H "Notion-Version: 2022-06-28")
  if [ "$HTTP_STATUS" = "200" ]; then
    log_ok "Notion DB アクセスOK（DB ID: ${DB_ID:0:8}...）"
  else
    log_fail "Notion DB アクセスNG（HTTP $HTTP_STATUS）→ URL と Integration の共有設定を確認"
  fi
fi

# --- 6. claude -p 動作確認 ---
if command -v claude > /dev/null 2>&1; then
  CLAUDE_OUT=$(claude -p "ping" 2>/dev/null || true)
  if [ -n "$CLAUDE_OUT" ]; then
    log_ok "claude -p 動作OK"
  else
    log_fail "claude -p が応答しません → Claude Code の認証状態を確認"
  fi
fi

# --- 結果 ---
echo "====================="
if [ ${#ERRORS[@]} -eq 0 ]; then
  log_ok "全チェック通過"
  exit 0
else
  echo "${#ERRORS[@]} 件のエラー:"
  for e in "${ERRORS[@]}"; do echo "  - $e"; done
  exit 1
fi
