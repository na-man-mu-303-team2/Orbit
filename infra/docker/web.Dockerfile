FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/editor-core/package.json packages/editor-core/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/job-queue/package.json packages/job-queue/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/realtime/package.json packages/realtime/package.json

RUN pnpm install --frozen-lockfile=false

COPY . .
RUN pnpm --filter "./packages/*" build

EXPOSE 5173

CMD ["pnpm", "--filter", "@orbit/web", "dev"]

