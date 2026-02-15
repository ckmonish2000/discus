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

# App setup
COPY . .
RUN bun install

CMD ["bun", "run", "--filter=worker", "dev"]
