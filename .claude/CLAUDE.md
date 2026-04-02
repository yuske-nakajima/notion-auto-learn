# notion-auto-learn

Notion + `claude -p` で「知らないことリスト」の自動処理を実現するツール。

## 技術スタック

- Node.js (ESM)
- Notion API (2022-06-28) — `fetch` で直接呼び出し
- テスト: `node:test`
- リンター/フォーマッター: Biome
- バージョン管理: mise

## リポジトリ構成

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

## 開発ルール

- ESM (`"type": "module"`) を使用
- Biome でリント・フォーマットを統一（`npx biome check .`）
- Notion API バージョンは `2022-06-28` を使用
- `.env` は `.gitignore` で除外済み、コミットしない
- ログ出力は `[timestamp] LEVEL: message` 形式
- 日本語でコメント・ドキュメントを記述
- テストは `node:test` で記述（`npm test`）
