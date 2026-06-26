# Staging 初回デプロイ手順

> 対象 URL
>
> - Web: https://teijitaisha-web-staging.mottainaigames.com
> - API: https://api.teijitaisha-web-staging.mottainaigames.com

---

## 前提

- Cloudflare で `mottainaigames.com` を管理中
- Node.js 20+、pnpm 9+
- Fly.io アカウント（無料枠可）
- GitHub リポジトリ（CI 自動デプロイ用・推奨）

---

## A. 初回のみ（アカウント・CLI）

### 1. Fly.io CLI

```bash
curl -L https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"
fly auth login
```

### 2. Fly.io アプリ作成（staging）

```bash
cd /path/to/定時退社web
fly apps create teijitaisha-web-api-staging
```

> **すでに存在する場合**（`Name has already been taken`）はスキップして OK。  
> 確認: `fly apps list | grep teijitaisha-web-api-staging`

### 3. Cloudflare API トークン（Pages 手動デプロイ or CI 用）

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens
2. 「Edit Cloudflare Workers」テンプレート or Pages 編集権限付きカスタムトークン
3. Account ID を控える（ダッシュボード右サイドバー）

```bash
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."
```

### 4. Wrangler ログイン（任意・手動デプロイ時）

```bash
pnpm install
pnpm exec wrangler login
```

### 5. Pages プロジェクト作成（初回のみ）

```bash
pnpm exec wrangler pages project create teijitaisha-web-staging --production-branch=develop
```

> **すでに存在する場合**（`A project with this name already exists`）はスキップして OK。  
> 確認: Cloudflare ダッシュボード → Workers & Pages → `teijitaisha-web-staging`

---

## B. 手動デプロイ（いちばん早い）

```bash
chmod +x scripts/deploy-staging.sh
./scripts/deploy-staging.sh
```

または個別に:

```bash
# サーバー
fly deploy --config fly.staging.toml --remote-only --buildkit

# フロント（ビルド時に WS URL を埋め込む）
VITE_WS_URL=wss://api.teijitaisha-web-staging.mottainaigames.com \
VITE_ENV=staging \
pnpm build:web

pnpm exec wrangler pages deploy apps/web/dist \
  --project-name=teijitaisha-web-staging \
  --branch=develop
```

---

## C. DNS・カスタムドメイン（初回のみ）

### Cloudflare Pages（Web）

1. Pages → `teijitaisha-web-staging` → Custom domains
2. `teijitaisha-web-staging.mottainaigames.com` を追加
3. **DNS は自動追加**される（手動不要のことが多い）

### Fly.io（API）

```bash
fly certs add api.teijitaisha-web-staging.mottainaigames.com -a teijitaisha-web-api-staging
```

`fly certs add` の出力に従い、**Cloudflare DNS**（mottainaigames.com）に手動で追加する。

**A / AAAA が表示された場合（いまのケース）:**

| タイプ | 名前                          | 向き先                                           | プロキシ               |
| ------ | ----------------------------- | ------------------------------------------------ | ---------------------- |
| A      | `api.teijitaisha-web-staging` | `66.241.124.187`（fly が表示した IPv4）          | **DNS only（灰色雲）** |
| AAAA   | `api.teijitaisha-web-staging` | `2a09:8280:1::135:22cc:0`（fly が表示した IPv6） | **DNS only（灰色雲）** |

> IP はデプロイごとに変わることがある。必ず `fly certs add` の出力をそのまま使う。

**CNAME が表示された場合**（`fly certs setup` 参照時）:

| タイプ | 名前                          | 向き先           |
| ------ | ----------------------------- | ---------------- |
| CNAME  | `api.teijitaisha-web-staging` | fly が表示する値 |

証明書の状態確認:

```bash
fly certs check api.teijitaisha-web-staging.mottainaigames.com -a teijitaisha-web-api-staging
```

`Status = Ready` になるまで HTTPS は使えない（`SSL_ERROR_SYSCALL` の原因）。

**すぐに証明書を発行したい場合** — `fly certs setup` の **ACME DNS Challenge** を Cloudflare に追加:

| タイプ | 名前                                          | 向き先                                                               | プロキシ |
| ------ | --------------------------------------------- | -------------------------------------------------------------------- | -------- |
| CNAME  | `_acme-challenge.api.teijitaisha-web-staging` | `api.teijitaisha-web-staging.mottainaigames.com.nyn26p9.flydns.net.` | DNS only |

> 向き先は `fly certs setup api.teijitaisha-web-staging.mottainaigames.com -a teijitaisha-web-api-staging` の表示をそのまま使う（`nyn26p9` 部分はアプリごとに異なる）。

**Cloudflare プロキシ（オレンジ雲）を ON にしている場合** — 次も追加:

| タイプ | 名前                                         | コンテンツ                          |
| ------ | -------------------------------------------- | ----------------------------------- |
| TXT    | `_fly-ownership.api.teijitaisha-web-staging` | `app-nyn26p9`（setup の表示どおり） |

`Could not resolve host` → A/AAAA 未登録。  
`SSL_ERROR_SYSCALL` → 証明書が **Not verified**（上記 ACME を追加するか、数分〜30分待つ）。

DNS 設定前の疎通確認は `fly.dev` で可能:

```bash
curl https://teijitaisha-web-api-staging.fly.dev/health
```

### 動作確認

```bash
curl https://api.teijitaisha-web-staging.mottainaigames.com/health
# → {"ok":true,"service":"teijitaisha-web-api"}
```

ブラウザで `https://teijitaisha-web-staging.mottainaigames.com` を開き、ルーム作成を試す。

---

## D. GitHub Actions 自動デプロイ（推奨）

ワークフロー: [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)

| ブランチ  | トリガー     | デプロイ先                 |
| --------- | ------------ | -------------------------- |
| `develop` | push / 手動  | staging（Pages + Fly）     |
| `main`    | push / 手動  | production（Pages + Fly）  |
| どちらも  | pull_request | ビルドのみ（デプロイなし） |

補助スクリプト（トークン取得コマンドの表示）:

```bash
chmod +x scripts/setup-github-actions.sh
./scripts/setup-github-actions.sh
```

### 1. GitHub リポジトリ作成 & push

```bash
cd ~/Desktop/定時退社web
git init
git checkout -b develop
git add .
git commit -m "Initial monorepo with staging deploy config"
```

GitHub で空のリポジトリ `teijitaisha-web` を作成（README 追加なし）後:

```bash
git remote add origin git@github.com:YOUR_ORG/teijitaisha-web.git
git push -u origin develop
```

### 2. GitHub Environments を作成

リポジトリ → **Settings** → **Environments**

| Environment  | Deployment branches（推奨） | 用途                 |
| ------------ | --------------------------- | -------------------- |
| `staging`    | `develop` のみ              | staging 自動デプロイ |
| `production` | `main` のみ                 | 本番自動デプロイ     |

> ワークフローが `environment: staging` / `production` を参照するため、**同名の Environment が必須**です。

### 3. Secrets を登録

#### リポジトリ共通（Settings → Secrets and variables → Actions → Repository secrets）

| Secret                  | 値の取得方法                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | [API Tokens](https://dash.cloudflare.com/profile/api-tokens) で作成。権限: **Cloudflare Pages — Edit**、**Account Settings — Read** |
| `CLOUDFLARE_ACCOUNT_ID` | `pnpm exec wrangler whoami` の Account ID 欄（例: `882d30c37cca7222dc03546d685169d0`）                                              |

#### Environment ごと（Settings → Environments → 各環境 → Environment secrets）

| Environment  | Secret          | 値                                                                           |
| ------------ | --------------- | ---------------------------------------------------------------------------- |
| `staging`    | `FLY_API_TOKEN` | `fly tokens create deploy -a teijitaisha-web-api-staging` の出力             |
| `production` | `FLY_API_TOKEN` | `fly tokens create deploy -a teijitaisha-web-api` の出力（本番アプリ作成後） |

```bash
# staging 用（今すぐ実行可）
fly tokens create deploy -a teijitaisha-web-api-staging
```

> **重要:** `FLY_API_TOKEN` は Environment ごとに**別の値**を登録してください（staging トークンは本番アプリにデプロイできません）。

### 4. 動作確認

1. `develop` へ push（または Actions タブから **CI / Deploy** → **Run workflow**）
2. **Actions** タブで `build` → `deploy-staging` が緑になることを確認
3. 以下が更新されていること:

```bash
curl https://api.teijitaisha-web-staging.mottainaigames.com/health
curl -sI https://teijitaisha-web-staging.mottainaigames.com | head -3
```

### 5. production について

`main` ブランチへの push で production ジョブが走ります。事前に以下が必要です（[F. production へ上げるとき](#f-production-へ上げるとき) 参照）:

- Fly アプリ `teijitaisha-web-api`
- Pages プロジェクト `teijitaisha-web`
- production 用 `FLY_API_TOKEN`（Environment `production`）

---

## E. トラブルシュート

### Docker エラー回避（`docker.sock` / `missing hostname`）

**`--buildkit` フラグが必要**です。`fly.staging.toml` はリポジトリ**ルート**のものを使ってください。

```bash
unset DOCKER_HOST
cd ~/Desktop/定時退社web
fly deploy --config fly.staging.toml --remote-only --buildkit
```

まだ失敗する場合:

```bash
fly agent stop && fly agent start
fly version update
fly deploy --config fly.staging.toml --remote-only --buildkit --verbose
```

| 症状                               | 対処                                                            |
| ---------------------------------- | --------------------------------------------------------------- |
| `docker.sock` / `missing hostname` | 下記「Docker エラー回避」を参照                                 |
| Web は開くが WS 接続失敗           | `VITE_WS_URL` がビルド時に正しいか確認。Pages を再デプロイ      |
| CORS エラー                        | Fly の `CORS_ORIGIN` が `fly.staging.toml` と一致しているか     |
| API 502 / deploy 失敗              | `fly deploy --config fly.staging.toml --remote-only --buildkit` |
| カスタムドメインが効かない         | DNS 伝播待ち（最大数時間）、Cloudflare プロキシ ON              |
| Fly deploy `unauthorized`          | 下記「Fly unauthorized」を参照                                  |

### Fly deploy `unauthorized`（GitHub Actions）

```
Error: failed to fetch an image or build from source: unauthorized
```

**原因:** `FLY_API_TOKEN` が未設定・名前違い・値が壊れている。

**確認:**

1. GitHub → **Settings → Environments → staging → Environment secrets**
2. 名前が **`FLY_API_TOKEN`** であること（`FLY_API_TOKEN_STAGING` ではない）
3. 値が `FlyV1 ...` で始まる**全文**（改行や空白なし）

**再発行して登録し直す:**

```bash
fly tokens create deploy -a teijitaisha-web-api-staging -x 999999h
```

1. 出力をコピー（1 行丸ごと）
2. GitHub → staging → **FLY_API_TOKEN** を **Update**（または削除して再追加）
3. Actions を **Re-run failed jobs**

**トークンは設定済みなのに `unauthorized` が出る場合:**

Fly のリモートビルダーが停止・削除されていると、deploy 専用トークンではビルダーを再作成できません。ローカルから 1 回デプロイしてビルダーを起動してください:

```bash
fly deploy --config fly.staging.toml --remote-only --buildkit
```

その後 GitHub Actions を Re-run。CI では `--buildkit` は不要（`--remote-only` のみ）。

> Repository secrets ではなく **Environment `staging` の secrets** に入れること。ワークフローは `environment: staging` を参照しています。

---

## F. production へ上げるとき

**詳細手順:** [DEPLOY_PRODUCTION.md](./DEPLOY_PRODUCTION.md)

1. Fly アプリ `teijitaisha-web-api` + Pages `teijitaisha-web` を作成
2. DNS・証明書・カスタムドメインを設定
3. GitHub Environment `production` に `FLY_API_TOKEN` を登録
4. `main` ブランチを作成して push → CI が production へデプロイ

```bash
chmod +x scripts/setup-production.sh
./scripts/setup-production.sh
```
