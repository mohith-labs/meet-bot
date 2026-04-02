<p align="center">
  <pre align="center">
  ___  ___          _   ______       _   
  |  \/  |         | |  | ___ \     | |  
  | .  . | ___  ___| |_ | |_/ / ___ | |_ 
  | |\/| |/ _ \/ _ \ __||  __/ / _ \| __|
  | |  | |  __/  __/ |_ | |   | (_) | |_ 
  \_|  |_/\___|\___|\__\\_|    \___/ \__|
  </pre>
  <p align="center"><strong>Meeting Transcription API & Dashboard</strong></p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white" alt="Playwright" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License MIT" />
</p>

---

## Overview

MeetBot is a meeting transcription platform that sends real bots to Google Meet meetings, captures live transcriptions via caption scraping, and lets you manage everything through a dark-themed dashboard or REST API. Inspired by [vexa.ai](https://vexa.ai).

- **Real Google Meet bots via Playwright** -- bots join meetings with a real Google account, enable captions, and scrape transcript data in real time
- **Real-time transcription via WebSocket** -- stream transcript segments as they are captured from Google Meet's built-in captions
- **Dual authentication** -- protect endpoints with JWT Bearer tokens or API Keys
- **Webhook notifications** -- receive HTTP callbacks for meeting events (`meeting.started`, `meeting.ended`) with HMAC-SHA256 signing
- **Admin panel** -- manage users, toggle registration, and configure app-wide settings
- **Bot auto-exit** -- configurable automatic exit when the bot is alone in a meeting
- **Dark-themed dashboard** -- glass-morphism UI with animations built on Next.js
- **API key management** -- create, list, and revoke API keys from the dashboard
- **User settings** -- per-user configuration for bot behavior and preferences
- **Swagger API documentation** -- interactive API explorer at `/api/docs`

---

## Screenshots

<!-- 
Add screenshots here once available:

### Landing Page
![Landing Page](docs/screenshots/landing.png)

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)

### Meetings List
![Meetings List](docs/screenshots/meetings.png)

### Live Transcription
![Live Transcription](docs/screenshots/live-transcription.png)

### API Keys Management
![API Keys](docs/screenshots/api-keys.png)

### API Documentation (Swagger)
![API Docs](docs/screenshots/swagger.png)
-->

> Screenshots coming soon. Run the project locally to explore the full UI.

---

## Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **NestJS 10** | Application framework |
| **TypeScript** | Type-safe development |
| **TypeORM + SQLite** | ORM and database |
| **Passport** | Authentication (JWT + API Key strategies) |
| **Socket.IO** | WebSocket real-time communication |
| **Playwright** | Google Meet bot (real -- caption scraping via Playwright) |
| **Swagger / OpenAPI** | API documentation |

### Frontend

| Technology | Purpose |
|---|---|
| **Next.js 14** | React framework (App Router) |
| **React 18** | UI library |
| **TypeScript** | Type-safe development |
| **Tailwind CSS v4** | Utility-first styling (dark theme) |
| **Zustand** | Lightweight state management |
| **TanStack React Query** | Server state & data fetching |
| **Framer Motion** | Animations & transitions |
| **Socket.IO Client** | Real-time WebSocket client |
| **Lucide React** | Icon library |

---

## Getting Started

### Prerequisites

- **Node.js** 20 or higher
- **npm** or **yarn**
- A **Google account** for the bot to sign into Google Meet

### Installation

```bash
git clone <repo-url>
cd meeting_bot
npm run install:all
```

### Playwright Setup

Install the Chromium browser for Playwright and generate the Google authentication session:

```bash
cd backend
npx playwright install chromium
npm run gen:auth  # One-time: opens a browser to log into Google and saves the session to auth.json
```

The `gen:auth` script launches a headed browser where you log into the Google account the bot will use. The session is saved to `auth.json` so the bot can join meetings without re-authenticating.

### Environment Setup

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=3001

# Authentication
JWT_SECRET=your-super-secret-key-change-in-production

# Database
DB_PATH=.data/database.sqlite

# CORS
FRONTEND_URL=http://localhost:3000

# Admin account (seeded on first startup)
ADMIN_EMAIL=admin@meetbot.com
ADMIN_PASSWORD=admin123456
ADMIN_NAME=Admin

# Registration
REGISTRATION_ENABLED=true

# Google account for the bot
GOOGLE_ACCOUNT_EMAIL=
GOOGLE_ACCOUNT_PASSWORD=

# Playwright auth state
AUTH_STATE_PATH=./auth.json

# Bot display name in meetings
BOT_NAME=MeetBot
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Port the backend server listens on |
| `JWT_SECRET` | Yes | Secret used to sign and verify JWT tokens. **Must** be changed in production. |
| `DB_PATH` | Yes | File path for the SQLite database |
| `FRONTEND_URL` | Yes | Allowed origin for CORS |
| `ADMIN_EMAIL` | Yes | Email for the seeded admin account |
| `ADMIN_PASSWORD` | Yes | Password for the seeded admin account |
| `ADMIN_NAME` | Yes | Display name for the seeded admin account |
| `REGISTRATION_ENABLED` | No | Whether new user registration is allowed (default: `true`) |
| `GOOGLE_ACCOUNT_EMAIL` | Yes | Google account email the bot uses to join meetings |
| `GOOGLE_ACCOUNT_PASSWORD` | Yes | Google account password (used during `gen:auth`) |
| `AUTH_STATE_PATH` | No | Path to the saved Playwright auth state (default: `./auth.json`) |
| `BOT_NAME` | No | Display name shown when the bot joins a meeting (default: `MeetBot`) |

### Running in Development

```bash
npm run dev
```

| Service | URL |
|---|---|
| Backend API | http://localhost:3001 |
| Frontend | http://localhost:3000 |
| Swagger Docs | http://localhost:3001/api/docs |

### Running with Docker

```bash
docker-compose up
```

This will start both the backend and frontend services in containers.

---

## Project Structure

```
meeting_bot/
├── package.json              # Root package with workspace scripts
├── docker-compose.yml        # Docker orchestration
├── backend/
│   ├── src/
│   │   ├── auth/             # JWT + API Key authentication
│   │   │   ├── strategies/   # Passport strategies
│   │   │   ├── guards/       # Auth guards
│   │   │   └── dto/          # Login/Register DTOs
│   │   ├── admin/            # Admin seed service, admin controller
│   │   ├── api-keys/         # API key CRUD & validation
│   │   ├── bots/             # Bot lifecycle management (Playwright-based)
│   │   ├── meetings/         # Meeting CRUD operations
│   │   ├── transcripts/      # Transcript retrieval & sharing
│   │   ├── webhooks/         # Webhook CRUD & dispatcher service
│   │   ├── settings/         # User settings controller
│   │   ├── websocket/        # Real-time transcript streaming
│   │   ├── entities/         # TypeORM entities (User, Meeting, TranscriptSegment, ApiKey, Webhook, AppSettings)
│   │   └── common/           # Guards, decorators, interceptors
│   ├── test/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/       # Login, Register pages
│   │   │   ├── (dashboard)/  # Dashboard, Meetings, Live, API Keys, Settings, Admin
│   │   │   └── (public)/     # Docs, Get Started, Pricing, Blog
│   │   ├── components/       # UI components, layout, landing sections
│   │   ├── hooks/            # WebSocket, live transcript hooks
│   │   ├── stores/           # Zustand state stores
│   │   └── lib/              # API client, auth utilities
│   └── package.json
└── README.md
```

---

## API Reference

### Authentication

All protected endpoints support **two** authentication methods:

1. **JWT Bearer Token** -- obtained from `/auth/login`
   ```
   Authorization: Bearer <token>
   ```

2. **API Key** -- created via `/api-keys`
   ```
   X-API-Key: <key>
   ```

Either method can be used interchangeably on endpoints that accept both.

---

### Endpoints

#### Auth

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/auth/register` | Register a new user | None |
| `POST` | `/auth/login` | Login and receive a JWT token | None |
| `GET` | `/auth/profile` | Get current user profile | JWT |
| `GET` | `/auth/registration-status` | Check if registration is enabled | None |

#### Bots

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/bots` | Send a bot to join a meeting | JWT / API Key |
| `GET` | `/bots/status` | List all running bots | JWT / API Key |
| `DELETE` | `/bots/:platform/:nativeMeetingId` | Stop a bot | JWT / API Key |
| `PUT` | `/bots/:platform/:nativeMeetingId/config` | Update bot configuration | JWT / API Key |

#### Meetings

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/meetings` | List all meetings | JWT / API Key |
| `GET` | `/meetings/:platform/:nativeMeetingId` | Get meeting details | JWT / API Key |
| `PATCH` | `/meetings/:platform/:nativeMeetingId` | Update meeting metadata | JWT / API Key |
| `DELETE` | `/meetings/:platform/:nativeMeetingId` | Delete / anonymize meeting | JWT / API Key |

#### Transcripts

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/transcripts/:platform/:nativeMeetingId` | Get full transcript | JWT / API Key |
| `POST` | `/transcripts/:platform/:nativeMeetingId/share` | Create a shareable link | JWT / API Key |

#### API Keys

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api-keys` | Create a new API key | JWT only |
| `GET` | `/api-keys` | List all API keys | JWT only |
| `DELETE` | `/api-keys/:id` | Revoke an API key | JWT only |

#### Webhooks

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/webhooks` | Create a webhook | JWT |
| `GET` | `/webhooks` | List webhooks | JWT |
| `PATCH` | `/webhooks/:id` | Update a webhook | JWT |
| `DELETE` | `/webhooks/:id` | Delete a webhook | JWT |
| `POST` | `/webhooks/:id/test` | Test a webhook | JWT |

#### Settings

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/settings` | Get user settings | JWT |
| `PATCH` | `/settings` | Update user settings | JWT |

#### Admin

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/admin/users` | List all users | Admin |
| `PATCH` | `/admin/users/:id` | Update user (enable/disable, role) | Admin |
| `GET` | `/admin/settings` | Get app settings | Admin |
| `PATCH` | `/admin/settings` | Update app settings | Admin |

---

### Quick Start Example

```bash
# 1. Register a new account
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123", "name": "John"}'

# 2. Login to get a JWT token
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# 3. Create an API key (use the JWT token from step 2)
curl -X POST http://localhost:3001/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My First Key"}'

# 4. Send a bot to join a Google Meet meeting
curl -X POST http://localhost:3001/bots \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"platform": "google_meet", "nativeMeetingId": "abc-defg-hij"}'

# 5. Retrieve the transcript
curl http://localhost:3001/transcripts/google_meet/abc-defg-hij \
  -H "X-API-Key: YOUR_API_KEY"

# 6. Stop the bot
curl -X DELETE http://localhost:3001/bots/google_meet/abc-defg-hij \
  -H "X-API-Key: YOUR_API_KEY"
```

---

## WebSocket API

MeetBot streams live transcription data over WebSocket using Socket.IO.

### Connection

| Parameter | Value |
|---|---|
| URL | `ws://localhost:3001/ws` |
| Transport | WebSocket (Socket.IO) |
| Auth | Pass `X-API-Key` or JWT token in the handshake `auth` object |

**Connection example (JavaScript):**

```javascript
import { io } from "socket.io-client";

const socket = io("ws://localhost:3001/ws", {
  auth: {
    token: "YOUR_JWT_TOKEN",       // JWT authentication
    // OR
    apiKey: "YOUR_API_KEY",        // API Key authentication
  },
});
```

### Events

#### Client -> Server

**Subscribe to a meeting:**

```javascript
socket.emit("subscribe", {
  platform: "google_meet",
  nativeMeetingId: "abc-defg-hij",
});
```

**Unsubscribe from a meeting:**

```javascript
socket.emit("unsubscribe", {
  platform: "google_meet",
  nativeMeetingId: "abc-defg-hij",
});
```

**Ping (keepalive):**

```javascript
socket.emit("ping");
```

#### Server -> Client

**`transcript.mutable`** -- a new or updated transcript segment:

```json
{
  "platform": "google_meet",
  "nativeMeetingId": "abc-defg-hij",
  "segment": {
    "id": "seg_abc123",
    "speakerName": "John Doe",
    "text": "Let's review the Q4 numbers.",
    "timestamp": "2026-03-27T10:15:30.000Z",
    "isFinal": true
  }
}
```

**`meeting.status`** -- meeting status change:

```json
{
  "platform": "google_meet",
  "nativeMeetingId": "abc-defg-hij",
  "status": "active"
}
```

**`pong`** -- keepalive response:

```javascript
socket.on("pong", () => {
  console.log("Connection alive");
});
```

---

## Webhooks

MeetBot can send HTTP POST requests to your endpoints when meeting events occur. Webhooks are managed per-user via the API or dashboard.

### Supported Events

| Event | Trigger |
|---|---|
| `meeting.started` | A bot successfully joins a meeting and begins transcribing |
| `meeting.ended` | A meeting ends or the bot is stopped |
| `webhook.test` | Sent when you test a webhook from the dashboard or API |

### Payload Format

All webhook payloads are JSON and include an HMAC-SHA256 signature for verification.

**Headers:**

| Header | Description |
|---|---|
| `Content-Type` | `application/json` |
| `X-Webhook-Signature` | HMAC-SHA256 hex digest of the request body, signed with the webhook's secret |
| Custom headers | Any additional headers configured on the webhook |

**Example payload (`meeting.started`):**

```json
{
  "event": "meeting.started",
  "timestamp": "2026-03-29T10:00:00.000Z",
  "data": {
    "platform": "google_meet",
    "nativeMeetingId": "abc-defg-hij",
    "title": "Weekly Standup",
    "status": "active",
    "botName": "MeetBot"
  }
}
```

### Verifying Signatures

```javascript
const crypto = require("crypto");

function verifyWebhookSignature(body, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

---

## Admin

MeetBot includes an admin system for managing users and app-wide settings.

### Admin Account

An admin account is automatically seeded on first startup using the `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` environment variables. This account has full access to admin endpoints.

### User Management

Admins can:

- **List all users** -- view all registered accounts
- **Enable / disable accounts** -- disabled users cannot log in or use the API
- **Promote / demote users** -- grant or revoke admin privileges

### Registration Toggle

Admins can enable or disable new user registration at any time via the admin settings endpoint or dashboard. When disabled, the `POST /auth/register` endpoint returns a `403` error, and the frontend hides the registration form. The current status is publicly queryable via `GET /auth/registration-status`.

---

## Bot Auto-Exit

MeetBot supports automatic bot exit when the bot is the only participant remaining in a meeting.

- **Configurable timeout** -- set the number of minutes the bot waits alone before leaving (default: 5 minutes, range: 1--30 minutes)
- **Per-user setting** -- each user can configure this value in the Settings page or via `PATCH /settings`
- **Behavior** -- when all other participants leave, a countdown begins. If someone rejoins, the countdown resets. If the timeout expires, the bot leaves and the meeting status is updated to `completed`.

---

## Design System

MeetBot uses a custom dark theme with glass-morphism effects. Below is the color palette:

| Token | Value | Usage |
|---|---|---|
| `bg-primary` | `#0a0a0f` | Main background |
| `bg-secondary` | `#12121a` | Secondary background |
| `bg-card` | `#16162a` | Card backgrounds |
| `brand-primary` | `#6c5ce7` | Primary accent (purple) |
| `brand-secondary` | `#a29bfe` | Light purple accent |
| `success` | `#00d68f` | Success states |
| `warning` | `#ffaa00` | Warning states |
| `error` | `#ff3d71` | Error states |
| `info` | `#0095ff` | Info states |
| `text-primary` | `#e4e4f0` | Primary text |
| `text-secondary` | `#8888a8` | Secondary / muted text |
| `border` | `#2a2a3e` | Borders and dividers |

---

## Available Scripts

### Root (monorepo)

| Command | Description |
|---|---|
| `npm run dev` | Start both backend and frontend in development mode |
| `npm run install:all` | Install dependencies for root, backend, and frontend |
| `npm run build` | Build both projects for production |
| `npm run start` | Start both services in production mode |

### Backend (`/backend`)

| Command | Description |
|---|---|
| `npm run start:dev` | Start with hot reload (watch mode) |
| `npm run build` | Compile TypeScript for production |
| `npm run start:prod` | Start the production server |
| `npm run gen:auth` | Launch browser to authenticate the bot's Google account |

### Frontend (`/frontend`)

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |

---

## Database

MeetBot uses **SQLite** for zero-configuration local development. The database auto-syncs schema in development mode.

### Entities

| Entity | Description |
|---|---|
| `User` | User accounts with hashed passwords and role (user/admin) |
| `Meeting` | Meeting records with platform and status tracking |
| `TranscriptSegment` | Individual transcript segments linked to meetings |
| `ApiKey` | Hashed API keys associated with users |
| `Webhook` | Webhook configurations with URL, secret, events, and custom headers |
| `AppSettings` | Application-wide settings (e.g., registration toggle) |

### Meeting Status Flow

```
requested -> joining -> awaiting_admission -> active -> stopping -> completed
                                                   \               /
                                                    -> failed -----
```

---

## Roadmap

- [x] Implement Playwright bot for Google Meet joining
- [x] Real transcription via Google Meet caption scraping
- [x] Implement webhook notifications
- [x] Admin user management
- [ ] Add Microsoft Teams support
- [ ] Add Zoom support
- [ ] Add recording / playback support
- [ ] PostgreSQL support for production deployments
- [ ] Rate limiting and throttling
- [ ] Email verification flow
- [ ] Unit and E2E tests

---

## Contributing

Contributions are welcome! To get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

Please make sure your code follows the existing style and passes any linting checks before submitting.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with NestJS, Next.js, Playwright, and a lot of caffeine.
</p>
