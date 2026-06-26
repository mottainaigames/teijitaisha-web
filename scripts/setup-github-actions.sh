#!/usr/bin/env bash
# GitHub Actions 自動デプロイの初回セットアップ補助スクリプト
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> GitHub Actions セットアップ"
echo ""

# --- Cloudflare ---
echo "[Cloudflare]"
if command -v pnpm &>/dev/null && [ -d node_modules ]; then
  echo "  Account ID (wrangler whoami):"
  pnpm exec wrangler whoami 2>/dev/null | grep -A1 "Account ID" || true
else
  echo "  pnpm install 後に: pnpm exec wrangler whoami"
fi
echo ""
echo "  API トークン作成: https://dash.cloudflare.com/profile/api-tokens"
echo "  推奨権限:"
echo "    - Account / Cloudflare Pages — Edit"
echo "    - Account / Account Settings — Read"
echo ""

# --- Fly.io ---
echo "[Fly.io] deploy トークンは手動で作成してください:"
echo "  staging:     fly tokens create deploy -a teijitaisha-web-api-staging"
echo "  production:  fly tokens create deploy -a teijitaisha-web-api"
echo ""

# --- GitHub ---
echo "[GitHub] 登録する Secrets"
echo "  リポジトリ共通（Repository secrets）:"
echo "    CLOUDFLARE_API_TOKEN"
echo "    CLOUDFLARE_ACCOUNT_ID"
echo ""
echo "  Environment secrets（staging / production それぞれに FLY_API_TOKEN）:"
echo "    staging     → teijitaisha-web-api-staging 用トークン"
echo "    production  → teijitaisha-web-api 用トークン（本番アプリ作成後）"
echo ""
echo "  Environments 作成:"
echo "    Settings → Environments → staging（Deployment branches: develop のみ推奨）"
echo "    Settings → Environments → production（Deployment branches: main のみ推奨）"
echo ""

# --- Git init ---
if [ ! -d .git ]; then
  echo "[Git] リポジトリ未初期化。以下を実行:"
  echo ""
  cat <<'EOF'
  git init
  git checkout -b develop
  git add .
  git commit -m "Initial monorepo with staging deploy config"
  # GitHub でリポジトリ作成後:
  git remote add origin git@github.com:YOUR_ORG/teijitaisha-web.git
  git push -u origin develop
EOF
else
  echo "[Git] .git は既に存在します。"
  git status -sb 2>/dev/null || true
fi

echo ""
echo "詳細: DEPLOY_STAGING.md の「D. GitHub Actions 自動デプロイ」"
