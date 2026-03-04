# Marketplace 公開手順

## 前提

- Publisher: `orange-creatives`
- PAT 取得元: Azure DevOps → User Settings → Personal Access Tokens
- PAT はセッションログに残っている（下記「PAT の探し方」参照）

## 手順

```bash
cd /c/dev/terminal-session-recall

# 1. ソース修正が main にマージ済みであることを確認
git checkout main && git pull

# 2. バージョンを上げる（package.json の version フィールド）
# 例: "version": "0.1.4" → "0.1.5"

# 3. コミット & プッシュ
git add package.json
git commit -m "chore: bump version to 0.1.5"
git push origin main

# 4. ビルド & 公開（PAT は --pat オプションで渡す）
npm run compile
npx @vscode/vsce publish --pat <PAT>
```

## PAT の探し方

セッションログに過去の publish コマンドが残っている:

```bash
grep -o 'npx @vscode/vsce publish[^"\\]*' \
  ~/.claude/projects/c--dev-quantum-scribe/*.jsonl \
  2>/dev/null | head -1
```

サブエージェントログにもある場合:

```bash
grep -ro 'npx @vscode/vsce publish[^"\\]*' \
  ~/.claude/projects/c--dev-quantum-scribe/*/subagents/*.jsonl \
  2>/dev/null | head -1
```

## 注意

- `npx vsce publish`（`@vscode/` なし）だと古い vsce が使われて PAT 認証に失敗する場合がある。必ず `npx @vscode/vsce publish` を使う
- **ビルド忘れ注意**: ソース修正後は `npm run compile` を必ず実行してから publish すること。0.1.3 でビルド忘れ事故あり
- PAT が期限切れの場合は Azure DevOps で再発行（スコープ: Marketplace → Publish）
