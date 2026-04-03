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
│   ├── index.ts           # エントリポイント
│   ├── process.ts         # メイン処理
│   ├── health-check.ts    # ヘルスチェック
│   ├── notion-client.ts   # Notion API クライアント
│   ├── md-to-notion.ts    # Markdown → Notion ブロック変換
│   ├── setup-db.ts        # DB 作成スクリプト
│   └── logger.ts          # ログ出力
├── prompts/
│   └── explain-term.md    # 用語解説生成用プロンプト
├── test/
│   ├── md-to-notion.test.ts
│   ├── notion-client.test.ts
│   ├── health-check.test.ts
│   └── process.test.ts
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
- テストは Vitest で記述（`npm test`）
- TypeScript + tsx で実行
