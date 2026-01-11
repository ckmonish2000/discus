FROM oven/bun:1.2.21

WORKDIR /app

COPY . .

RUN bun install

CMD ["bun", "run","--filter=worker", "dev"]