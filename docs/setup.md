# AutoComments — Setup Guide

Community Lead Capture & Reply Assistant for real-estate startups.

## Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **OpenAI API key** (or compatible LLM) — for classification and reply generation
- **Discord bot token** (optional) — for monitoring Discord channels

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure the backend
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env with your settings (see below)

# 3. Start in development mode
npm run dev
# → Backend at http://localhost:3000

# Optional: start backend + Discord bot together
npm run dev:all

# 4. Open the dashboard
# Visit http://localhost:3000/login
# Default password: admin (changeable via ADMIN_PASSWORD in .env)
```

## Configuration (.env)

### Required
| Variable | Description |
|---|---|
| `ADMIN_PASSWORD` | Dashboard login password |
| `SESSION_TTL_SECONDS` | Session cookie lifetime in seconds (default: 604800) |
| `LLM_API_KEY` | OpenAI API key (or compatible) |
| `APP_BASE_URL` | Public base URL of this backend (used for click-tracking links) |

### Reddit (enabled by default)
| Variable | Default | Description |
|---|---|---|
| `REDDIT_ENABLED` | `true` | Enable Reddit polling |
| `REDDIT_POLL_INTERVAL` | `5` | Poll interval in minutes |
| `SUBREDDITS` | `india,bangalore,...` | Comma-separated subreddit list |
| `SEARCH_QUERIES` | `2BHK rent...` | Comma-separated search terms |

### Discord (optional)
| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `ALLOWED_GUILD_IDS` | Comma-separated server IDs |
| `ALLOWED_CHANNEL_IDS` | Comma-separated channel IDs |

### LLM
| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `openai` | LLM provider (production should stay `openai`) |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | API base URL |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `USE_HINGLISH` | `false` | Force Hinglish output for generated reply drafts |
| `ALLOW_MOCK_LLM` | `false` | Optional local-only override to allow `LLM_PROVIDER=mock` |
| `INGEST_API_KEY` | _none_ | Required for `POST /api/instagram/import` automation endpoint |
| `INGEST_MAX_RECORDS` | `5000` | Max records accepted per Instagram import request |
| `INGEST_RATE_LIMIT_PER_MIN` | `30` | Max Instagram import API requests per minute per IP |
| `INGEST_MAX_BODY_BYTES` | `1048576` | Max body size (bytes) for Instagram import API requests |

### Notifications (optional)
| Variable | Description |
|---|---|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL |
| `SMTP_HOST/PORT/USER/PASS/FROM` | SMTP email settings |

## Testing Without an API Key

For controlled local testing only, set both:

- `LLM_PROVIDER=mock`
- `ALLOW_MOCK_LLM=true`

Mock mode is blocked by default to reduce accidental non-production behavior.

## Commands

| Command | Description |
|---|---|
| `npm install` | Install all dependencies |
| `npm run dev` | Start backend only (dev mode) |
| `npm run dev:all` | Start backend + Discord bot (dev mode) |
| `npm run dev:backend` | Start backend only |
| `npm run build` | Build TypeScript |
| `npm start` | Start backend production build |
| `npm run start:all` | Start backend + Discord bot production build |
| `npm test` | Run tests |
| `npm run security:secrets` | Secret scan for tracked files |
| `npm run security:audit` | Audit production dependencies |
| `npm run release:check` | Run secret scan + tests + build + audit |

## Using the Dashboard

1. **Login** at `/login` with your admin password
2. **Approval Queue** — View pending opportunities at `/opportunities?status=pending`
3. **Review** — Click any item to see score breakdown, AI classification, and 3 reply variants
4. **Approve** — Edit the reply if needed, then click Approve
5. **Copy & Post** — Use the Copy button to copy the approved reply, then paste it manually on the platform
6. **Mark Posted** — Click "Mark as Posted" to track it
7. **Quora** — Submit Quora links manually at `/quora/submit`
8. **Instagram** — Manage competitors + import followers/following/posts/comments/likers at `/instagram`
9. **Exports** — Download master/per-source dumps + Instagram master audience dump at `/exports`
10. **Config** — Edit keywords, scoring weights, Hinglish toggle, etc. at `/config`
11. **Reports** — View weekly/daily stats at `/reports/weekly`

## Adding Keywords

1. Go to `/config`
2. Edit the `include_keywords` and `exclude_keywords` arrays in the JSON
3. Add new locations to the `locations` dictionary
4. Save

## Architecture

```
apps/backend/         # Fastify server + web UI
  src/
    server.ts         # Entry point
    types.ts          # TypeScript interfaces
    db/               # SQLite schema + repositories
    config/           # Config loader + defaults
    collectors/       # Reddit, Quora collectors
    llm/              # LLM provider (OpenAI + Mock)
    scoring/          # Keyword matcher + scorer
    pipeline/         # Processing pipeline
    routes/           # HTTP routes + HTML views
    notifications/    # Slack + Email
    utils/            # UTM, HTML helpers
  public/             # CSS + JS
  data/               # SQLite database (auto-created)

apps/discord-bot/     # Separate Discord bot process
  src/index.ts        # Bot entry point
```

## n8n Integration (Optional)

The backend exposes REST endpoints suitable for n8n webhook integration:

- `POST /api/discord/opportunity` — Submit an opportunity programmatically
- `POST /api/reddit/collect` — Trigger Reddit collection manually
- `POST /api/events/conversion` — Record conversion events
- `POST /api/instagram/import` — Import compliant Instagram datasets (requires `x-api-key`)
- `GET /api/config` / `PUT /api/config` — Read/update config
- `GET /reports/weekly?format=json` — Get weekly report as JSON

Connect these to n8n HTTP Request nodes to build custom automation workflows.
