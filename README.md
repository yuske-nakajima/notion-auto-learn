# notion-auto-learn

Notion + `claude -p` で「知らないことリスト」の自動処理を実現するツール。

知らない用語を Notion データベースに追加するだけで、Claude が自動的に解説を生成してページに書き込みます。

## 技術スタック

- Node.js (ESM)
- Notion API (2022-06-28) — `fetch` で直接呼び出し
- テスト: `node:test`
- リンター/フォーマッター: [Biome](https://biomejs.dev/)
- バージョン管理: [mise](https://mise.jdx.dev/)

## 必要なもの

- [mise](https://mise.jdx.dev/)（Node.js バージョン管理）
- [Notion Integration](https://www.notion.so/my-integrations)（API トークン）
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)（`claude -p` コマンド）

## セットアップ

```bash
git clone https://github.com/yuske-nakajima/notion-auto-learn.git
cd notion-auto-learn

# 1. Node.js をインストール
mise install

# 2. 依存パッケージをインストール
npm install

# 3. 環境変数を設定
cp .env.example .env
# .env を編集して以下を設定:
#   NOTION_API_KEY=ntn_xxx
#   NOTION_DB_URL=https://www.notion.so/...
```

## 使い方

```bash
# ヘルスチェック（環境変数・API接続の確認）
npm run health-check

# 1回だけ処理を実行
npm run run-once

# 定期実行モード（INTERVAL_MINUTES 間隔で繰り返し）
npm start
```

> 未処理アイテムがなければ `claude -p` は呼ばれないため、Claude の消費はありません。

## 日常の使い方

1. Notion のデータベースに知らない用語を追加（ステータスは空のまま）
2. `npm run run-once` を実行（手動 or トリガー）
3. Claude が自動的に解説を生成して Notion に書き込み
4. 解説を読んで理解したら「理解済」に変更

## Notion データベースのプロパティ

| プロパティ名 | 型 | 説明 |
|-------------|------|------|
| 用語 | Title | 調べたい用語 |
| ステータス | Select | 登録 / 調査中 / 調査完了 / 理解済 |
| カテゴリ | Select | 技術 / 一般 / ビジネス |
| 処理日 | Date | 自動処理された日付 |
| メモ | Rich Text | 自分用のメモ |

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `NOTION_API_KEY` | Yes | Notion Integration トークン |
| `NOTION_DB_URL` | Yes | Notion データベースの URL |
| `INTERVAL_MINUTES` | No | 定期実行の間隔（デフォルト: 30） |
| `WAIT_SECONDS` | No | アイテム間の待機秒数（デフォルト: 1） |
| `LOG_LEVEL` | No | debug / info / warn / error（デフォルト: info） |

## 開発

```bash
# テスト実行
npm test

# リント・フォーマットチェック
npx biome check .

# フォーマット適用
npm run format
```

## ファイル構成

```
├── .mise.toml
├── package.json
├── biome.json
├── .npmrc
├── src/
│   ├── index.js           # エントリポイント
│   ├── process.js         # メイン処理
│   ├── health-check.js    # ヘルスチェック
│   ├── notion-client.js   # Notion API クライアント
│   ├── md-to-notion.js    # Markdown → Notion ブロック変換
│   └── logger.js          # ログ出力
├── prompts/
│   └── explain-term.md    # 用語解説生成用プロンプト
├── test/
│   ├── md-to-notion.test.js
│   ├── notion-client.test.js
│   ├── health-check.test.js
│   └── process.test.js
├── .env.example           # 環境変数テンプレート
└── README.md
```

## ライセンス

MIT
