# notion-auto-learn

Notion + `claude -p` + cron で「知らないことリスト」の自動処理を実現するツール。

知らない用語を Notion データベースに追加するだけで、Claude が自動的に解説を生成してページに書き込みます。

## 必要なもの

- [Notion Integration](https://www.notion.so/my-integrations)（API トークン）
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)（`claude -p` コマンド）
- `curl`, `jq`

## セットアップ

```bash
git clone https://github.com/yuske-nakajima/notion-auto-learn.git
cd notion-auto-learn

# 1. 初期化（.env コピー + 案内表示）
./bin/init.sh

# 2. .env を編集
#    NOTION_API_KEY=ntn_xxx
#    NOTION_PARENT_PAGE_URL=https://www.notion.so/...  ← DB を配置するページ

# 3. DB がまだ無い場合 → スクリプトで自動作成
./bin/create-db.sh

# 4. DB URL を .env に貼る

# 5. 再度 init（ヘルスチェックが走る）
./bin/init.sh
```

## 使い方

```bash
./bin/process.sh
```

> 未処理アイテムがなければ `claude -p` は呼ばれないため、Claude の消費はありません。

## 日常の使い方

1. Notion のデータベースに知らない用語を追加（ステータスは空のまま）
2. `./bin/process.sh` を実行（手動 or トリガー）
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
| `NOTION_PARENT_PAGE_URL` | Yes* | DB を配置する親ページの URL（初回DB作成時に使用） |
| `NOTION_DB_URL` | Yes | Notion データベースの URL |
| `WAIT_SECONDS` | No | 処理間の待機秒数（デフォルト: 1） |
| `LOG_LEVEL` | No | debug / info / warn / error（デフォルト: info） |

## ファイル構成

```
├── bin/
│   ├── health-check.sh   # 前提条件チェック
│   ├── init.sh            # 初期セットアップ
│   ├── create-db.sh       # DB 自動作成（curl 直接）
│   └── process.sh         # メイン処理
├── prompts/
│   └── explain-term.md    # 用語解説生成用プロンプト
├── .env.example           # 環境変数テンプレート
└── README.md
```

## ライセンス

MIT
