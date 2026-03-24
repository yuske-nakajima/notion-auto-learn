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
#    NOTION_DB_URL=https://www.notion.so/...

# 3. DB がまだ無い場合 → Claude に任せる
claude -p "$(cat prompts/init-db.md)"

# 4. DB URL を .env に貼る

# 5. 再度 init（ヘルスチェックが走る）
./bin/init.sh
```

## 使い方

### 手動実行

```bash
./bin/process.sh
```

### cron で定期実行

```bash
crontab -e
# 毎時実行
0 * * * * /path/to/notion-auto-learn/bin/process.sh >> /tmp/notion-auto-learn.log 2>&1
```

### macOS launchd で定期実行

`examples/launchd.plist` を参考に設定してください。

```bash
# plist を編集（パスを書き換え）
cp examples/launchd.plist ~/Library/LaunchAgents/com.notion.auto-learn.plist
# 編集後
launchctl load ~/Library/LaunchAgents/com.notion.auto-learn.plist
```

## 日常の使い方

1. Notion のデータベースに知らない用語を追加（ステータス: 未処理）
2. 次の cron 実行で Claude が自動的に解説を生成
3. 解説を読んで理解したら「理解済み」に変更

## Notion データベースのプロパティ

| プロパティ名 | 型 | 説明 |
|-------------|------|------|
| 用語 | Title | 調べたい用語 |
| ステータス | Select | 未処理 / 処理中 / 完了 / 理解済み |
| カテゴリ | Select | 技術 / 一般 / ビジネス |
| 処理日 | Date | 自動処理された日付 |
| メモ | Rich Text | 自分用のメモ |

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `NOTION_API_KEY` | Yes | Notion Integration トークン |
| `NOTION_DB_URL` | Yes | Notion データベースの URL |
| `WAIT_SECONDS` | No | 処理間の待機秒数（デフォルト: 1） |
| `LOG_LEVEL` | No | debug / info / warn / error（デフォルト: info） |

## ファイル構成

```
├── bin/
│   ├── health-check.sh   # 前提条件チェック
│   ├── init.sh            # 初期セットアップ
│   └── process.sh         # メイン処理
├── prompts/
│   ├── init-db.md         # DB作成用プロンプト
│   └── explain-term.md    # 用語解説生成用プロンプト
├── examples/
│   └── launchd.plist      # macOS 定期実行テンプレート
├── .env.example           # 環境変数テンプレート
└── README.md
```

## ライセンス

MIT
