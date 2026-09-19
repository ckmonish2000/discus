FROM oven/bun:1.2.21

WORKDIR /app

# Dependencies are installed against the workspace manifests, so this layer
# is only rebuilt when a package.json or the lockfile changes — not on every
# source edit.
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

EXPOSE 5173

# --host binds 0.0.0.0. Vite defaults to localhost, which inside a container
# means the container's own loopback — the published port would accept the
# connection and then serve nothing.
CMD ["bun", "run", "--filter=web", "dev", "--", "--host", "0.0.0.0"]
