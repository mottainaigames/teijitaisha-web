#!/usr/bin/env bash
# GitHub Environment に FLY_API_TOKEN を登録する
# 使い方:
#   ./scripts/set-github-fly-secret.sh              # staging（既定）
#   GITHUB_ENV=production ./scripts/set-github-fly-secret.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${GITHUB_REPO:-mottainaigames/teijitaisha-web}"
ENV_NAME="${GITHUB_ENV:-staging}"
SECRET_NAME="FLY_API_TOKEN"

case "$ENV_NAME" in
  staging)    TOKEN_KEY="FLY_API_TOKEN_STAGING" ;;
  production) TOKEN_KEY="FLY_API_TOKEN_PRODUCTION" ;;
  *) echo "GITHUB_ENV は staging または production"; exit 1 ;;
esac

if ! command -v gh &>/dev/null; then
  echo "gh がありません: brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "GitHub にログインしてください（mottainaigames で）:"
  echo "  gh auth login --hostname github.com --git-protocol ssh --web"
  exit 1
fi

if [ ! -f .secrets.local ]; then
  echo ".secrets.local がありません"
  exit 1
fi

TOKEN="$(grep "^${TOKEN_KEY}=" .secrets.local | cut -d= -f2-)"
if [ -z "$TOKEN" ]; then
  echo "${TOKEN_KEY} が .secrets.local にありません"
  exit 1
fi

echo "==> $REPO / Environment: $ENV_NAME / Secret: $SECRET_NAME"
gh secret set "$SECRET_NAME" \
  --env "$ENV_NAME" \
  --repo "$REPO" \
  --body "$TOKEN"

echo "Done."
