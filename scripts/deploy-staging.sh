#!/usr/bin/env bash
# staging への手動デプロイ（初回セットアップ後）
set -euo pipefail
cd "$(dirname "$0")/.."

export VITE_WS_URL="${VITE_WS_URL:-wss://api.teijitaisha-web-staging.mottainaigames.com}"
export VITE_ENV="${VITE_ENV:-staging}"

echo "==> Sync card icons"
pnpm icons:sync

echo "==> Build"
corepack enable 2>/dev/null || true
pnpm install
pnpm build:web

echo "==> Deploy server (Fly.io)"
if ! command -v fly &>/dev/null; then
  echo "flyctl がありません。インストール: curl -L https://fly.io/install.sh | sh"
  exit 1
fi
# ローカル Docker 未起動時の docker.sock エラー回避（conda 等で DOCKER_HOST が壊れている場合あり）
unset DOCKER_HOST
fly deploy --config fly.staging.toml --remote-only --buildkit

echo "==> Deploy web (Cloudflare Pages)"
pnpm exec wrangler pages deploy apps/web/dist \
  --project-name=teijitaisha-web-staging \
  --branch=develop

echo ""
echo "Done."
echo "  Web:  https://teijitaisha-web-staging.mottainaigames.com"
echo "  API:  https://api.teijitaisha-web-staging.mottainaigames.com/health"
echo ""
echo "初回のみ:"
echo "  1. Cloudflare Pages でカスタムドメイン teijitaisha-web-staging を追加"
echo "  2. fly certs add api.teijitaisha-web-staging.mottainaigames.com"
echo "  3. Cloudflare DNS に api.teijitaisha-web-staging の CNAME を追加"
