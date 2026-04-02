# AGENTS.md

## Project Overview

MeetBot is a monorepo with a **NestJS backend** (TypeORM/SQLite, Playwright for Google Meet bots, Socket.IO) and a **Next.js 14 frontend** (App Router, Zustand, React Query, Tailwind v4). Package manager is **npm**.

## Build / Run / Test Commands

### Install

```bash
npm run install:all          # Install deps for both backend and frontend
cd backend && npm install    # Backend only
cd frontend && npm install   # Frontend only
```

### Dev

```bash
npm run dev                  # Run both backend + frontend concurrently
npm run dev:backend          # Backend only (nest start --watch)
npm run dev:frontend         # Frontend only (next dev)
```

### Build

```bash
npm run build                # Build both
cd backend && npm run build  # Backend only (nest build)
cd frontend && npm run build # Frontend only (next build)
```

### Lint / Format

```bash
cd backend && npm run lint       # ESLint with --fix on src/ and test/
cd backend && npm run format     # Prettier on src/**/*.ts and test/**/*.ts
cd frontend && npm run lint      # next lint
```

### Test

```bash
cd backend && npm test                      # Run all unit tests (jest)
cd backend && npm run test:watch            # Watch mode
cd backend && npm run test:cov              # With coverage
cd backend && npm run test:e2e              # E2E tests (jest --config ./test/jest-e2e.json)
cd backend && npx jest path/to/file.spec.ts # Run a single test file
cd backend && npx jest --testNamePattern="should create a bot"  # Run test by name
```

> **No test framework is configured for the frontend.** Only lint is available.

### Docker

```bash
docker-compose up --build        # Build and start both services (ports exposed)
docker-compose -f docker-compose.noport.yml up --build  # No host port mapping
```

## Architecture

```
backend/src/
  main.ts               # Bootstrap: CORS, Swagger, ValidationPipe
  app.module.ts          # Root module
  config/                # TypeORM/SQLite config
  entities/              # Centralized TypeORM entities (barrel export in index.ts)
  common/                # Shared guards, decorators, interceptors
  auth/                  # JWT + API Key auth strategies
  bots/                  # Playwright-based Google Meet bot lifecycle
  meetings/              # Meeting CRUD
  transcripts/           # Transcript retrieval
  webhooks/              # Webhook CRUD + dispatcher
  api-keys/              # API key management
  settings/              # User settings
  users/                 # User CRUD
  websocket/             # Socket.IO transcript gateway

frontend/src/
  app/                   # Next.js App Router
    (auth)/              # Login, Register pages
    (dashboard)/         # Authenticated pages (dashboard, meetings, live, api-keys, settings)
    (public)/            # Public pages (docs, get-started, blog)
  components/
    ui/                  # Reusable primitives (button, input, modal, badge, card)
    layout/              # Sidebar, header, main-layout
    landing/             # Landing page components
  hooks/                 # useWebSocket, useLiveTranscripts
  stores/                # Zustand stores (auth-store, meetings-store)
  lib/                   # API client, auth helpers, config, utils
```

## Code Style

### TypeScript Configuration

- **Backend:** `strictNullChecks: false`, `noImplicitAny: false` — non-strict mode. Target ES2021, CommonJS modules.
- **Frontend:** `strict: true`. Uses `@/*` path alias mapping to `./src/*`.

### Imports

- **Backend:** Single quotes. Relative paths (`./`, `../`). Order: framework (`@nestjs/*`) -> third-party (`typeorm`, `bcrypt`) -> local modules.
- **Frontend:** Double quotes. Use `@/*` path alias for all project imports. Order: external packages -> `@/` aliased imports.

### Naming Conventions

| Element         | Backend              | Frontend              |
|-----------------|----------------------|-----------------------|
| Files           | `kebab-case` + suffix (`.service.ts`, `.controller.ts`, `.module.ts`, `.entity.ts`, `.dto.ts`, `.guard.ts`, `.strategy.ts`) | `kebab-case` (`use-websocket.ts`, `auth-store.ts`) |
| Classes         | `PascalCase`         | `PascalCase`          |
| Components      | N/A                  | `PascalCase`          |
| Functions/methods | `camelCase`        | `camelCase`           |
| Hooks           | N/A                  | `useCamelCase`        |
| Zustand stores  | N/A                  | `useCamelCaseStore`   |
| Enums           | `PascalCase` name, `SCREAMING_SNAKE_CASE` values | Same |
| Constants       | `SCREAMING_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` |
| DB entity columns | `camelCase`       | N/A                   |

### Error Handling

- **Backend:** Use NestJS HTTP exceptions (`NotFoundException`, `BadRequestException`, `UnauthorizedException`, `ConflictException`, `ForbiddenException`). Use `Logger.error()` for logging. Non-critical async ops use `.catch()` fire-and-forget.
- **Frontend:** API client throws `new Error()` on non-OK responses. Stores use try/catch with toast notifications. Silent catches acceptable only for non-critical JSON parse failures.

### Key Patterns

- **Response envelope:** All backend responses are wrapped by `TransformInterceptor` into `{ success: true, data: T, timestamp: string }`. Do not manually wrap responses in controllers.
- **Dual auth:** `CombinedAuthGuard` supports both JWT (Bearer token) and API Key (`x-api-key` header) on the same endpoints. Use `@UseGuards(CombinedAuthGuard)` on controllers.
- **Validation:** Backend uses `class-validator` decorators on DTOs. `ValidationPipe` is enabled globally with `whitelist: true` and `transform: true`.
- **API client:** Frontend uses singleton `ApiClient` class (`lib/api.ts`) that auto-unwraps the response envelope. Use `api.get<T>()`, `api.post<T>()`, etc.
- **State management:** Zustand for client state (auth, UI). React Query (`@tanstack/react-query`) for server state.
- **Runtime config:** Frontend API URL resolved via `window.__RUNTIME_CONFIG__` (injected in root layout SSR), fallback to `NEXT_PUBLIC_API_URL`, fallback to `http://localhost:3001`.
- **Tailwind v4:** Uses `@theme` directive in `globals.css` for design tokens. No `tailwind.config.js`.
- **NestJS module structure:** Each feature has a module, service, controller, and `dto/` subdirectory. Register new modules in `app.module.ts`.

### Entity Pattern (Backend)

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('table_name')
export class MyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

Add new entities to `entities/index.ts` barrel export and to the `entities` array in `config/database.config.ts`.

### Component Pattern (Frontend)

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  const [state, setState] = useState(false);
  return <div>{title}</div>;
}
```

### Environment

- Copy `.env.example` -> `.env` (backend) and `.env.local.example` -> `.env.local` (frontend).
- Never commit `.env`, `.env.local`, `auth.json`, `.data/`, or `*.sqlite` files.
- Required backend vars: `JWT_SECRET`, `PORT`, `DB_PATH`, `FRONTEND_URL`.
- Required frontend vars: `NEXT_PUBLIC_API_URL`.
