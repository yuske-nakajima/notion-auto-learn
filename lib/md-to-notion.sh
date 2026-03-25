#!/bin/bash
# Markdown → Notion ブロック変換ライブラリ
# 対応: 見出し(h2,h3), 太字, リンク, 生URL, 箇条書き, 番号付きリスト, テーブル

# 正規表現パターン（変数に格納してエスケープ問題を回避）
_RE_BOLD='^\*\*([^*]+)\*\*'
_RE_LINK='^\[([^]]+)\]\(([^)]+)\)'
_RE_URL='^https?://[^[:space:])>]+'
_RE_PLAIN='^([^*\[]+)'
_RE_TABLE_SEP='^\|[[:space:]:|-]+\|$'

# --- インライン書式パーサー ---
# テキスト中の **太字**, [text](url), 生URL を Notion rich_text 配列に変換
parse_rich_text() {
  local text="$1"
  local segments="[]"

  while [ -n "$text" ]; do
    if [[ "$text" =~ $_RE_BOLD ]]; then
      local content="${BASH_REMATCH[1]}"
      segments=$(echo "$segments" | jq --arg t "$content" \
        '. + [{"type":"text","text":{"content":$t},"annotations":{"bold":true}}]')
      text="${text:${#BASH_REMATCH[0]}}"

    elif [[ "$text" =~ $_RE_LINK ]]; then
      local content="${BASH_REMATCH[1]}"
      local url="${BASH_REMATCH[2]}"
      segments=$(echo "$segments" | jq --arg t "$content" --arg u "$url" \
        '. + [{"type":"text","text":{"content":$t,"link":{"url":$u}}}]')
      text="${text:${#BASH_REMATCH[0]}}"

    elif [[ "$text" =~ $_RE_URL ]]; then
      local url="${BASH_REMATCH[0]}"
      segments=$(echo "$segments" | jq --arg u "$url" \
        '. + [{"type":"text","text":{"content":$u,"link":{"url":$u}}}]')
      text="${text:${#BASH_REMATCH[0]}}"

    elif [[ "$text" =~ $_RE_PLAIN ]]; then
      local plain="${BASH_REMATCH[0]}"
      # プレーンテキスト中にURLが含まれていればその手前で分割
      if [[ "$plain" == *"https://"* ]] || [[ "$plain" == *"http://"* ]]; then
        local before_https="${plain%%https://*}"
        local before_http="${plain%%http://*}"
        # 短い方（=先に出現する方）を採用
        if [ ${#before_https} -le ${#before_http} ]; then
          plain="$before_https"
        else
          plain="$before_http"
        fi
        # 空の場合は1文字だけ消費（URLチェックに戻す）
        if [ -z "$plain" ]; then
          plain="${text:0:1}"
        fi
      fi
      segments=$(echo "$segments" | jq --arg t "$plain" \
        '. + [{"type":"text","text":{"content":$t}}]')
      text="${text:${#plain}}"

    else
      # 単一文字 fallback（*, [, h 等）
      segments=$(echo "$segments" | jq --arg t "${text:0:1}" \
        '. + [{"type":"text","text":{"content":$t}}]')
      text="${text:1}"
    fi
  done

  echo "$segments"
}

# --- テーブル行パーサー ---
# "| cell1 | cell2 | cell3 |" → Notion table_row のcells配列
parse_table_row() {
  local line="$1"
  # 先頭・末尾の | を除去し、| で分割
  line="${line#|}"
  line="${line%|}"

  local cells="[]"
  IFS='|' read -ra parts <<< "$line"
  for part in "${parts[@]}"; do
    # 前後の空白をトリム
    part="$(echo "$part" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    local rich_text
    rich_text=$(parse_rich_text "$part")
    cells=$(echo "$cells" | jq --argjson rt "$rich_text" '. + [$rt]')
  done

  echo "$cells"
}

# --- テーブル区切り行判定 ---
is_separator_row() {
  local line="$1"
  [[ "$line" =~ $_RE_TABLE_SEP ]]
}

# --- メイン変換: Markdown → Notion blocks JSON ---
md_to_notion_blocks() {
  local markdown="$1"
  local blocks="[]"
  local current_text=""
  local in_table=false
  local table_rows="[]"
  local table_width=0

  # 溜まったテキストを paragraph として flush
  flush_paragraph() {
    if [ -n "$current_text" ]; then
      local rich_text
      rich_text=$(parse_rich_text "$current_text")
      blocks=$(echo "$blocks" | jq --argjson rt "$rich_text" '. + [{
        "object": "block", "type": "paragraph",
        "paragraph": {"rich_text": $rt}
      }]')
      current_text=""
    fi
  }

  # テーブルバッファを flush
  flush_table() {
    if [ "$in_table" = true ] && [ "$(echo "$table_rows" | jq 'length')" -gt 0 ]; then
      blocks=$(echo "$blocks" | jq \
        --argjson rows "$table_rows" \
        --argjson w "$table_width" \
        '. + [{
          "object": "block",
          "type": "table",
          "table": {
            "table_width": $w,
            "has_column_header": true,
            "children": [$rows[] | {
              "object": "block",
              "type": "table_row",
              "table_row": {"cells": .}
            }]
          }
        }]')
    fi
    in_table=false
    table_rows="[]"
    table_width=0
  }

  while IFS= read -r line || [ -n "$line" ]; do
    # テーブル行の検出（| で始まり | で終わる）
    if [[ "$line" =~ ^\|.+\|$ ]]; then
      # 区切り行はスキップ
      if is_separator_row "$line"; then
        continue
      fi

      # テーブルモード開始
      if [ "$in_table" = false ]; then
        flush_paragraph
        in_table=true
        table_rows="[]"
      fi

      local cells
      cells=$(parse_table_row "$line")
      table_width=$(echo "$cells" | jq 'length')
      table_rows=$(echo "$table_rows" | jq --argjson c "$cells" '. + [$c]')
      continue
    fi

    # テーブル外の行が来たらテーブルを flush
    if [ "$in_table" = true ]; then
      flush_table
    fi

    # 見出し h3
    if [[ "$line" =~ ^###\  ]]; then
      flush_paragraph
      local heading_text="${line#\#\#\# }"
      local rich_text
      rich_text=$(parse_rich_text "$heading_text")
      blocks=$(echo "$blocks" | jq --argjson rt "$rich_text" '. + [{
        "object": "block", "type": "heading_3",
        "heading_3": {"rich_text": $rt}
      }]')

    # 見出し h2
    elif [[ "$line" =~ ^##\  ]]; then
      flush_paragraph
      local heading_text="${line#\#\# }"
      local rich_text
      rich_text=$(parse_rich_text "$heading_text")
      blocks=$(echo "$blocks" | jq --argjson rt "$rich_text" '. + [{
        "object": "block", "type": "heading_2",
        "heading_2": {"rich_text": $rt}
      }]')

    # 箇条書き（- または * で始まる）
    elif [[ "$line" =~ ^[-*]\  ]]; then
      flush_paragraph
      local item_text="${line#- }"
      item_text="${item_text#\* }"
      local rich_text
      rich_text=$(parse_rich_text "$item_text")
      blocks=$(echo "$blocks" | jq --argjson rt "$rich_text" '. + [{
        "object": "block", "type": "bulleted_list_item",
        "bulleted_list_item": {"rich_text": $rt}
      }]')

    # 番号付きリスト
    elif [[ "$line" =~ ^[0-9]+\.\  ]]; then
      flush_paragraph
      local item_text
      item_text=$(echo "$line" | sed 's/^[0-9]*\. //')
      local rich_text
      rich_text=$(parse_rich_text "$item_text")
      blocks=$(echo "$blocks" | jq --argjson rt "$rich_text" '. + [{
        "object": "block", "type": "numbered_list_item",
        "numbered_list_item": {"rich_text": $rt}
      }]')

    # 空行
    elif [ -z "$line" ]; then
      flush_paragraph

    # 通常テキスト
    else
      if [ -n "$current_text" ]; then
        current_text="${current_text}
${line}"
      else
        current_text="$line"
      fi
    fi
  done <<< "$markdown"

  # 残りを flush
  flush_table
  flush_paragraph

  echo "$blocks"
}
