# notion-auto-learn

Notion + `claude -p` + cron で「知らないことリスト」の自動処理を実現するツール。

## 技術スタック

- Shell (bash) 完結
- 依存: curl, jq, claude CLI
- Notion API (2022-06-28)

## リポジトリ構成

```
├── bin/
│   ├── health-check.sh   # 前提条件チェック
│   ├── init.sh            # 初期セットアップ
│   └── process.sh         # メイン処理（cron から実行）
├── lib/
│   └── md-to-notion.sh    # Markdown → Notion ブロック変換
├── prompts/
│   ├── init-db.md         # DB作成用プロンプト
│   └── explain-term.md    # 用語解説生成用プロンプト
├── test/
│   └── test-md-to-notion.sh  # 変換ライブラリのテスト
├── .env.example           # 環境変数テンプレート
└── README.md
```

## 開発ルール

- シェルスクリプトは `set -euo pipefail` を先頭に記述
- Notion API バージョンは `2022-06-28` を使用
- `.env` は `.gitignore` で除外済み、コミットしない
- ログ出力は `[timestamp] LEVEL: message` 形式
- 日本語でコメント・ドキュメントを記述
