# リポジトリルートからビルド:
#   fly deploy --config apps/server/fly.toml

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
RUN pnpm install
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN pnpm --filter @teijitaisha/shared build && pnpm --filter @teijitaisha/server build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./node_modules/@teijitaisha/shared/dist
COPY --from=build /app/packages/shared/package.json ./node_modules/@teijitaisha/shared/package.json
EXPOSE 8080
CMD ["node", "dist/index.js"]
