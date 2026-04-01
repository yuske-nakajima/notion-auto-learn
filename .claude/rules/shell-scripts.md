---
paths:
  - "bin/**/*.sh"
  - "lib/**/*.sh"
---
# シェルスクリプト開発ルール

- ファイル先頭に `#!/bin/bash` と `set -euo pipefail` を記述する
- ログ出力は `[timestamp] LEVEL: message` 形式に従う
- Notion API バージョンは `2022-06-28` を固定で使用する
- curl の実行結果は必ずエラーチェックを行う
- 環境変数は `.env` から読み込み、スクリプト内にハードコードしない
- jq を使って JSON を安全に構築・パースする（文字列結合で JSON を組み立てない）
