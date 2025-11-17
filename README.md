# discus

A Bun workspace project with server, frontend, and AI utilities (Mistral & Ollama).

## Project Structure

```
discus/
├── package.json                 # Root workspace config
├── bun.lockb
├── .env.example
├── docker-compose.yml           # Main compose file (root level)
├── docker-compose.dev.yml       # Development overrides
│
├── apps/
│   ├── server/
│   │   ├── package.json
│   │   ├── index.ts            # Bun.serve() entry point
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   └── websocket/
│   │   └── Dockerfile
│   │
│   └── frontend/
│       ├── package.json
│       ├── index.html          # Entry point
│       ├── frontend.tsx        # React root
│       ├── src/
│       │   ├── components/
│       │   ├── hooks/
│       │   └── styles/
│       └── Dockerfile
│
├── packages/
│   ├── mistral/
│   │   ├── package.json
│   │   ├── index.ts           # Mistral client/utils
│   │   └── src/
│   │
│   ├── ollama/
│   │   ├── package.json
│   │   ├── index.ts           # Ollama client/utils
│   │   └── src/
│   │
│   └── shared/
│       ├── package.json
│       ├── index.ts           # Common types, utils
│       └── src/
│
└── infra/
    ├── docker/
    │   ├── server.Dockerfile
    │   ├── frontend.Dockerfile
    │   └── mistral.Dockerfile
    │
    └── scripts/
        ├── dev.sh
        └── deploy.sh
```

## Quick Start

To install dependencies:

```bash
bun install
```

To run the server:

```bash
bun run --filter server dev
```

To run the frontend:

```bash
bun run --filter frontend dev
```

To run everything with Docker:

```bash
docker-compose up -d
```

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
