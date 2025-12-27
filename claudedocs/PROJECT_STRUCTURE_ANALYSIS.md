# Project Structure Analysis & Improvement Recommendations

**Project**: Discus
**Analysis Date**: 2025-12-26
**Status**: Foundation solid, ~20% feature complete

---

## Table of Contents

1. [Current Project Architecture](#current-project-architecture)
2. [Directory Organization & Strengths](#directory-organization--strengths)
3. [Code Organization by App](#code-organization-by-app)
4. [Shared Code & Reusability](#shared-code--reusability)
5. [Build & Deployment Setup](#build--deployment-setup)
6. [Structural Issues & Organizational Gaps](#structural-issues--organizational-gaps)
7. [Improvement Recommendations](#improvement-recommendations)
8. [Action Plan](#action-plan)

---

## Current Project Architecture

**Discus** is a monorepo using Bun as the runtime with a modular architecture split across three main workspaces:

```
discus/
├── apps/                    # Runnable applications
│   ├── api/                # Hono backend API server
│   └── web/                # React/Vite frontend application
├── packages/               # Reusable service packages
│   ├── minio/             # MinIO S3-compatible storage wrapper
│   ├── mistral/           # Mistral AI OCR service wrapper
│   └── agents/            # AI agents (placeholder)
├── workers/               # Background/async workers
│   └── media-processor/   # Media processing worker (placeholder)
└── infra/                 # Infrastructure & deployment
    └── docker/            # Docker configuration
```

---

## Directory Organization & Strengths

### Strengths

- ✅ **Clear separation of concerns**: Apps, packages, and workers are well-delineated
- ✅ **Monorepo workspace structure**: Uses Bun workspaces for dependency management
- ✅ **Feature-focused packages**: Storage (minio), AI services (mistral) properly isolated
- ✅ **Docker support**: Docker Compose configured for local development with MinIO
- ✅ **Bun-native**: Leverages Bun for speed and modern TypeScript support
- ✅ **Type-safe**: All packages declare TypeScript as peer dependency

---

## Code Organization by App

### apps/api (Hono Backend)

**Framework**: Hono with OpenAPI/Zod validation

**Structure**:
```
src/
├── index.ts           # Server setup with CORS
├── routes.ts          # Route composition
└── storage/
    ├── storage.controllers.ts  # Request handlers
    ├── storage.dto.ts          # Zod schemas & types
    └── storage.routes.ts       # Storage endpoints
```

**Features**:
- Storage bucket CRUD operations
- Presigned URL generation (upload/download)
- File listing
- Webhook support

**Dependencies**: hono, @hono/zod-openapi, zod, minio package, mistral package

**Key Files**:
- `/Users/monish/Desktop/HoloCron/discus/apps/api/src/index.ts:1`
- `/Users/monish/Desktop/HoloCron/discus/apps/api/src/routes.ts:1`
- `/Users/monish/Desktop/HoloCron/discus/apps/api/src/storage/storage.controllers.ts:1`

---

### apps/web (React Frontend)

**Framework**: React 19 + Vite with TailwindCSS

**Structure**:
```
src/
├── main.tsx              # Entry point with React Query setup
├── router.tsx            # TanStack Router configuration
├── index.css             # Global styles
├── components/
│   └── ui/               # Reusable UI components (button, card, input, toast)
├── lib/
│   ├── api.ts            # API client
│   ├── storage.ts        # Storage utilities
│   └── utils.ts          # Helper functions
├── pages/
│   ├── home.tsx
│   └── storage.tsx
└── assets/
    └── react.svg
```

**Stack**: TanStack Router, React Query, React Form, Zod validation, shadcn-style components

**Build**: TypeScript with separate app/node configs

**Key Files**:
- `/Users/monish/Desktop/HoloCron/discus/apps/web/src/main.tsx:1`
- `/Users/monish/Desktop/HoloCron/discus/apps/web/src/router.tsx:1`

---

### packages/minio (Storage Service)

**Responsibility**: MinIO client wrapper

**Methods**:
- `listBuckets()` - List all buckets
- `createBucket()` - Create new bucket
- `getPresignedUrl()` - Generate signed URLs for upload/download
- `listObjects()` - Stream-based file listing
- `bucketExists()`, `deleteBucket()`

**Configuration**: Accepts endpoint, credentials, SSL settings

**Notable**: Uses stream-based API for memory-efficient file listing

**Key File**: `/Users/monish/Desktop/HoloCron/discus/packages/minio/index.ts:1`

---

### packages/mistral (OCR Service)

**Current implementation**: Minimal proof-of-concept

**Method**: `processImage()` - Calls mistral-ocr-latest model

**Status**: Hardcoded test URL, needs integration

**Key File**: `/Users/monish/Desktop/HoloCron/discus/packages/mistral/index.ts:1`

---

### packages/agents (Placeholder)

**Current state**: Empty shell with just console.log

**Purpose**: Intended for AI agent implementations

**Status**: Not yet implemented

---

### workers/media-processor (Placeholder)

**Status**: Empty shell, not yet implemented

**Intended purpose**: FFmpeg-based audio/video processing per README

---

## Shared Code & Reusability

**zod** (^4.1.12) is the root-level dependency used throughout:
- API validation in `api/storage.dto.ts`
- Frontend form validation in web components
- Consistent schema-driven development

**workspace references**:
- api depends on `minio` and `mistral` packages via `"workspaces/*"`
- Clean internal dependency management

---

## Build & Deployment Setup

### Configuration Files

- `tsconfig.json` files at each app/package level
- **api**: No special build config (Bun runs directly with --hot flag)
- **web**: Vite + TailwindCSS with path alias for `@` imports
- **Docker**: Compose file for MinIO + init script

### Scripts (from root package.json)

```bash
bun run --filter api dev  # Start API server with hot reload
```

**Environment**: `.env.local` with MinIO and Mistral credentials

### Docker Setup

- MinIO service on ports 9000 (API) + 9001 (Console)
- MinIO initialization via `/scripts/init-minio.sh`
- Webhook support configured: `http://host.docker.internal:8000/storage/webhook`
- Volume persistence with `storage_data`

---

## Structural Issues & Organizational Gaps

### 🔴 Critical Issues

1. **Missing implementations**:
   - `packages/agents/index.ts` - Just logs "Hello via Bun!"
   - `workers/media-processor/index.ts` - Completely empty
   - Mistral service is hardcoded with test URLs, not integrated with API
   - No LLM endpoint integration (README mentions LLaMA but not implemented)

2. **Incomplete mistral package**:
   - Only has `processImage()` method with hardcoded URL
   - No text processing, no LLM response generation
   - Not actually used by API

3. **Storage webhook incomplete**:
   - Route exists but only logs payload with no actual processing
   - README mentions event handling but not implemented

### 🟡 Organizational Issues

1. **Missing directory structures**:
   - No `tests/` or `test/` directories at any level
   - No `scripts/` subdirectories per app (only root scripts/)
   - No `lib/` or `utils/` shared directories in packages

2. **Inconsistent patterns**:
   - Controllers in API import services but don't follow dependency injection
   - Singleton MinioService instance created in controller (hard to test)
   - Environment variables not validated or type-checked on startup

3. **Documentation gaps**:
   - No PLAN.md, ARCHITECTURE.md, or API documentation
   - README describes full system but only ~20% is implemented
   - No inline code documentation or JSDoc comments

4. **Missing standard files**:
   - No `.prettierrc`, `.eslintrc` at root (only web has eslint config)
   - No GitHub workflows or CI/CD configuration
   - No CONTRIBUTING.md or development guide

5. **API structure concerns**:
   - Hardcoded port in `index.ts` instead of environment variable (uses `process.env.PORT || 8000`)
   - All storage controllers instantiate MinioService inline (not dependency-injected)
   - No error handling middleware or standardized error responses

### 🟢 Improvement Opportunities

1. **Testing infrastructure**:
   - Add `tests/` or `__tests__/` directories with bun:test setup
   - Create test utilities for minio/mistral mocking

2. **API improvements**:
   - Add middleware for error handling, logging, request ID tracking
   - Create service factory pattern for dependency injection
   - Add input validation error responses with proper HTTP status codes
   - Implement API documentation with OpenAPI/Swagger

3. **Package organization**:
   - Create shared `packages/common/` for types, errors, utilities
   - Add proper error classes and error handling
   - Type environment variables with a validation schema

4. **Frontend structure**:
   - Add hooks directory for custom React hooks
   - Create layout components directory
   - Add integration tests for critical user flows

5. **Documentation**:
   - Add ARCHITECTURE.md describing the monorepo structure
   - Create API.md documenting all endpoints and their payloads
   - Add DEVELOPMENT.md for setup and workflow

6. **Worker implementation**:
   - Actually implement media-processor with FFmpeg and Whisper integration
   - Create queue system (Bull, RabbitMQ, or simple event emitter)
   - Add agents package with LLM coordination logic

---

## Improvement Recommendations

### 🎯 Quick Wins (Immediate Impact)

#### 1. Add Missing Standard Directories

```bash
# Create test infrastructure
mkdir -p apps/api/tests apps/web/tests packages/minio/tests packages/mistral/tests

# Add shared utilities
mkdir -p packages/common/src/{types,errors,utils}

# Add documentation
mkdir -p docs
```

#### 2. Standardize Configuration Files

Create at root level:
- `.prettierrc` - Code formatting consistency
- `.eslintrc.json` - Linting rules for all TypeScript
- `.nvmrc` or `.tool-versions` - Runtime version locking
- `ARCHITECTURE.md` - Monorepo structure explanation

#### 3. Fix API Environment Variables

Create `apps/api/src/config.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8000),
  MINIO_ENDPOINT: z.string(),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MISTRAL_API_KEY: z.string(),
});

export const config = envSchema.parse(process.env);
```

#### 4. Add Error Handling Middleware

Create `apps/api/src/middleware/error-handler.ts` for consistent error responses.

---

### 🏗️ Structural Improvements (High Value)

#### 5. Implement Dependency Injection Pattern

Instead of:
```typescript
// ❌ Current: apps/api/src/storage/storage.controllers.ts
const minioService = new MinioService({ /* hardcoded */ });
```

Do:
```typescript
// ✅ Better: Create service factory
// apps/api/src/services/index.ts
export const createServices = () => ({
  minio: new MinioService(config.minio),
  mistral: new MistralService(config.mistral),
});

// Pass to controllers via context
```

#### 6. Create Shared Package for Common Code

```
packages/common/
├── src/
│   ├── types/        # Shared TypeScript types
│   ├── errors/       # Custom error classes
│   ├── utils/        # Helper functions
│   └── constants.ts  # Shared constants
├── package.json
└── tsconfig.json
```

#### 7. Reorganize API by Feature Modules

```
apps/api/src/
├── index.ts
├── config.ts
├── middleware/
│   ├── error-handler.ts
│   ├── logger.ts
│   └── cors.ts
├── modules/
│   ├── storage/
│   │   ├── storage.controller.ts
│   │   ├── storage.service.ts
│   │   ├── storage.routes.ts
│   │   └── storage.dto.ts
│   ├── media/        # Future: media processing endpoints
│   └── agents/       # Future: AI agent endpoints
└── shared/
    └── services/
```

#### 8. Add Testing Infrastructure

```typescript
// apps/api/tests/storage.test.ts
import { test, expect } from "bun:test";
import { app } from "../src/index";

test("GET /storage/buckets returns list", async () => {
  const res = await app.request("/storage/buckets");
  expect(res.status).toBe(200);
});
```

---

### 🚀 Long-Term Enhancements

#### 9. Complete Missing Implementations

**Priority order:**
1. **Implement `packages/agents`** - Core AI orchestration logic
2. **Implement `workers/media-processor`** - FFmpeg + Whisper integration
3. **Connect mistral service to API** - Actual OCR/LLM endpoints
4. **Add webhook processing** - Handle MinIO events properly

#### 10. Add API Documentation

Use Hono's OpenAPI integration you already have:

```typescript
// apps/api/src/index.ts
import { swaggerUI } from '@hono/swagger-ui';

app.doc('/doc', { openapi: '3.0.0', info: { version: '1.0.0', title: 'Discus API' }});
app.get('/ui', swaggerUI({ url: '/doc' }));
```

#### 11. Add CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
      - run: bun run tsc --noEmit
```

---

## Action Plan

### Week 1: Foundation

- [ ] Add test directories + write first tests
- [ ] Create `packages/common` for shared code
- [ ] Add config validation with Zod
- [ ] Implement error handling middleware

### Week 2: Quality

- [ ] Add linting and formatting configs
- [ ] Refactor to dependency injection pattern
- [ ] Add API documentation
- [ ] Write ARCHITECTURE.md

### Week 3: Features

- [ ] Implement agents package
- [ ] Implement media-processor worker
- [ ] Connect mistral to API endpoints
- [ ] Add webhook processing logic

---

## Next Steps

Choose one of the following to start:

1. **Quick wins** - Set up testing infrastructure + config validation
2. **DI pattern** - Refactor services with proper dependency injection
3. **Documentation** - Create ARCHITECTURE.md
4. **Feature completion** - Implement agents or media-processor

---

**Analysis completed**: 2025-12-26
**Generated by**: Claude Code (Zoe)
