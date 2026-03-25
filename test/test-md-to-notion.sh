#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
source "$ROOT_DIR/lib/md-to-notion.sh"

PASS=0
FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL + 1))
  fi
}

# === parse_rich_text テスト ===
echo "=== parse_rich_text ==="

# プレーンテキスト
result=$(parse_rich_text "hello world")
count=$(echo "$result" | jq 'length')
content=$(echo "$result" | jq -r '.[0].text.content')
assert_eq "プレーンテキスト: セグメント数" "1" "$count"
assert_eq "プレーンテキスト: 内容" "hello world" "$content"

# 太字
result=$(parse_rich_text "これは**重要**です")
count=$(echo "$result" | jq 'length')
bold=$(echo "$result" | jq -r '.[1].annotations.bold')
bold_text=$(echo "$result" | jq -r '.[1].text.content')
assert_eq "太字: セグメント数" "3" "$count"
assert_eq "太字: bold=true" "true" "$bold"
assert_eq "太字: 内容" "重要" "$bold_text"

# Markdownリンク
result=$(parse_rich_text "詳細は[公式ドキュメント](https://example.com)を参照")
count=$(echo "$result" | jq 'length')
link_text=$(echo "$result" | jq -r '.[1].text.content')
link_url=$(echo "$result" | jq -r '.[1].text.link.url')
assert_eq "リンク: セグメント数" "3" "$count"
assert_eq "リンク: テキスト" "公式ドキュメント" "$link_text"
assert_eq "リンク: URL" "https://example.com" "$link_url"

# 生URL
result=$(parse_rich_text "参照: https://example.com/path です")
link_url=$(echo "$result" | jq -r '.[1].text.link.url')
assert_eq "生URL: リンク変換" "https://example.com/path" "$link_url"

# === md_to_notion_blocks テスト ===
echo ""
echo "=== md_to_notion_blocks ==="

# 見出し
result=$(md_to_notion_blocks "## 概要")
type=$(echo "$result" | jq -r '.[0].type')
assert_eq "h2見出し" "heading_2" "$type"

result=$(md_to_notion_blocks "### 詳細")
type=$(echo "$result" | jq -r '.[0].type')
assert_eq "h3見出し" "heading_3" "$type"

# 箇条書き
result=$(md_to_notion_blocks "- アイテム1")
type=$(echo "$result" | jq -r '.[0].type')
assert_eq "箇条書き" "bulleted_list_item" "$type"

# 番号付きリスト
result=$(md_to_notion_blocks "1. 最初の項目")
type=$(echo "$result" | jq -r '.[0].type')
content=$(echo "$result" | jq -r '.[0].numbered_list_item.rich_text[0].text.content')
assert_eq "番号付きリスト: タイプ" "numbered_list_item" "$type"
assert_eq "番号付きリスト: 内容" "最初の項目" "$content"

# テーブル
TABLE_MD="| 名前 | 説明 |
|------|------|
| A | Aの説明 |
| B | Bの説明 |"
result=$(md_to_notion_blocks "$TABLE_MD")
type=$(echo "$result" | jq -r '.[0].type')
width=$(echo "$result" | jq '.[0].table.table_width')
rows=$(echo "$result" | jq '.[0].table.children | length')
assert_eq "テーブル: タイプ" "table" "$type"
assert_eq "テーブル: 幅" "2" "$width"
assert_eq "テーブル: 行数(ヘッダ+データ)" "3" "$rows"

# 太字入り箇条書き
result=$(md_to_notion_blocks "- **キーワード**: 説明テキスト")
bold=$(echo "$result" | jq -r '.[0].bulleted_list_item.rich_text[0].annotations.bold')
assert_eq "箇条書き内太字" "true" "$bold"

# リンク入り箇条書き
result=$(md_to_notion_blocks "- [Wikipedia](https://ja.wikipedia.org)")
link_url=$(echo "$result" | jq -r '.[0].bulleted_list_item.rich_text[0].text.link.url')
assert_eq "箇条書き内リンク" "https://ja.wikipedia.org" "$link_url"

# 複合テスト
COMPLEX="## 概要
**API**は重要な概念です。

## 参考リンク
- [公式ドキュメント](https://docs.example.com)
- https://example.com/raw-url"
result=$(md_to_notion_blocks "$COMPLEX")
block_count=$(echo "$result" | jq 'length')
assert_eq "複合: ブロック数" "5" "$block_count"

echo ""
echo "=== 結果: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
