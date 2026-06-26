# 定時退社 Web

ボードゲーム「定時退社」のオンラインプレイ用モノレポ。

## 構成

```
apps/web      … フロント（Vite + React）→ Cloudflare Pages
apps/server   … ゲームサーバー（WebSocket）→ Fly.io
packages/shared … 共有型・カード定義
```

## 必要環境

- Node.js 20+
- pnpm 9+

## セットアップ

```bash
pnpm install
pnpm build
```

## 開発

ターミナル1（サーバー）:

```bash
pnpm dev:server
```

ターミナル2（フロント）:

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm dev:web
```

- フロント: http://localhost:5173
- API health: http://localhost:8080/health

## ドキュメント

- [RULES_RECOGNITION.md](./RULES_RECOGNITION.md) — ゲームルール
- [STATE_DIAGRAM.md](./STATE_DIAGRAM.md) — 状態遷移
- [DEPLOYMENT.md](./DEPLOYMENT.md) — デプロイ方針

## デプロイ

**Staging 初回手順:** [DEPLOY_STAGING.md](./DEPLOY_STAGING.md)  
**GitHub Actions 自動デプロイ:** [DEPLOY_STAGING.md#d-github-actions-自動デプロイ推奨](./DEPLOY_STAGING.md#d-github-actions-自動デプロイ推奨)

手動デプロイ:

```bash
chmod +x scripts/deploy-staging.sh
./scripts/deploy-staging.sh
```
