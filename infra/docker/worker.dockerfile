FROM oven/bun:1.2.21

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create venv
RUN python3 -m venv /opt/whisper-venv
ENV PATH="/opt/whisper-venv/bin:$PATH"

# Install Whisper inside venv
RUN pip install --no-cache-dir openai-whisper

# Dependencies install from the manifests alone, BEFORE the source copy.
#
# This ordering is load-bearing, not just a cache optimisation. @firecrawl/anydoc
# ships its native binary as per-platform optional dependencies and picks one at
# require() time. Installing here resolves them against this image's platform
# (linux-arm64-gnu / linux-x64-gnu), so the Linux binary lands in the image.
# Running bun install after COPY . . would instead see the host's already-resolved
# tree and keep darwin-arm64, which the container cannot load.
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

CMD ["bun", "run", "--filter=worker", "dev"]
