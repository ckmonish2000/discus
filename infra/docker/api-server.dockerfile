FROM oven/bun:1.2.21

WORKDIR /app

# Dependencies install from the manifests alone, before the source copy, so
# native optional dependencies resolve against this image's platform rather
# than inheriting the host's darwin build through the bind mount.
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY apps/workers/media-worker/package.json ./apps/workers/media-worker/
COPY packages/common/package.json ./packages/common/
COPY packages/drizzle/package.json ./packages/drizzle/
COPY packages/queues/package.json ./packages/queues/
COPY packages/agents/package.json ./packages/agents/
COPY packages/minio/package.json ./packages/minio/

RUN bun install

COPY . .

CMD ["bun", "run","--filter=api", "dev"]
