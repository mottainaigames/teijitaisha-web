#!/usr/bin/env bash
# production 初回セットアップのチェックリスト表示
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Production セットアップ"
echo ""
echo "詳細: DEPLOY_PRODUCTION.md"
echo ""

echo "[1] Fly アプリ"
if command -v fly &>/dev/null; then
  fly apps list 2>/dev/null | grep teijitaisha-web-api || echo "  未作成 → fly apps create teijitaisha-web-api"
else
  echo "  fly CLI 未インストール"
fi
echo ""

echo "[2] Cloudflare Pages"
if command -v pnpm &>/dev/null && [ -d node_modules ]; then
  pnpm exec wrangler pages project list 2>/dev/null | grep teijitaisha-web || echo "  未作成 → wrangler pages project create teijitaisha-web --production-branch=main"
else
  echo "  pnpm install 後に wrangler pages project list"
fi
echo ""

echo "[3] GitHub Environment production"
echo "  Settings → Environments → production"
echo "  Secret: FLY_API_TOKEN = fly tokens create deploy -a teijitaisha-web-api -x 999999h"
echo ""

echo "[4] main ブランチ"
git branch -a 2>/dev/null | grep -E 'main|develop' || true
echo "  git checkout -b main && git push -u origin main"
echo ""

echo "[5] DNS / 証明書"
echo "  api.teijitaisha-web.mottainaigames.com → fly certs add"
echo "  teijitaisha-web.mottainaigames.com → Pages カスタムドメイン"
