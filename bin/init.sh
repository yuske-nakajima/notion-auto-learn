#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== 知らないことリスト — 初期セットアップ ==="

# .env の存在チェック
if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo ".env.example → .env をコピーしました"
  echo ""
  echo "以下を設定してから再実行してください:"
  echo "  1. NOTION_API_KEY        — https://www.notion.so/my-integrations で取得"
  echo "  2. NOTION_PARENT_PAGE_URL — DB を配置したい Notion ページの URL"
  echo "  3. NOTION_DB_URL          — 下の手順で DB を作成後に設定"
  echo ""
  echo "=== DB セットアップ方法 ==="
  echo ""
  echo "[方法A] Claude に任せる:"
  echo "  ./bin/init-db.sh"
  echo ""
  echo "[方法B] 手動で作る:"
  echo "  Notion で新規データベースを作成し、以下のプロパティを追加:"
  echo "    用語(Title), ステータス(Select), カテゴリ(Select), 処理日(Date), メモ(Rich Text)"
  echo "  ステータスの選択肢: 未処理, 処理中, 完了, 理解済み"
  echo "  カテゴリの選択肢: 技術, 一般, ビジネス"
  echo ""
  echo "DB 作成後、ブラウザのアドレスバーから URL をコピーして .env の NOTION_DB_URL に貼ってください。"
  exit 0
fi

source "$ROOT_DIR/.env"

# ヘルスチェック実行
"$SCRIPT_DIR/health-check.sh"
if [ $? -ne 0 ]; then
  echo ""
  echo "ヘルスチェックに失敗しました。上記のエラーを修正してください。"
  exit 1
fi

echo ""
echo "セットアップ完了！"
echo ""
echo "=== 使い方 ==="
echo "  手動実行:   ./bin/process.sh"
echo "  cron登録:   crontab -e → 0 * * * * $(cd "$ROOT_DIR" && pwd)/bin/process.sh >> /tmp/notion-terms.log 2>&1"
echo "  launchd:    examples/launchd.plist を参照"
