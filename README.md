# Autocomments App

An automated system designed to monitor various online platforms (Discord, Reddit, Quora), evaluate the relevance of conversations using AI/LLMs based on specific keywords, and alert you of high-value engagement opportunities.

## Project Structure

This project is a monorepo utilizing npm workspaces:

- **`apps/backend`**: The core API, pipeline processor, LLM integrations (OpenAI), and notification distributors (Discord, Slack, SMTP).
- **`apps/discord-bot`**: A Discord bot that monitors channels for specific keywords and forwards them to the backend for scoring and notification.
- Backend now includes: Approval Queue, Config + Hinglish toggle, Instagram compliant ingestion module, Reports, and Exports (CSV/JSON/Excel-compatible).

Legacy prototype code may still exist under root `src/`, but it is not used by the workspace scripts (`dev`, `start`, `build`, `test`).

## Prerequisites

- Node.js >= 20.0.0
- npm >= 9.x

## Installation

Install dependencies from the root directory to bootstrap all workspaces:

```bash
npm install
```

## Running the Application

You can run the entire stack or individual applications using the provided npm scripts.

### Development Mode

Run backend only (recommended default):

```bash
npm run dev
```

Run backend + Discord bot together:

```bash
npm run dev:all
```

Or run them individually:

```bash
npm run dev:backend
npm run dev:bot
```

### Production Build

Build both applications:

```bash
npm run build
```

Start backend only:

```bash
npm start
```

Start backend + Discord bot together:

```bash
npm run start:all
```

Or start them individually:

```bash
npm run start:backend
npm run start:bot
```

## Testing

Run tests across the apps:

```bash
npm test
```

Run pre-release safety checks:

```bash
npm run release:check
```

## Configuration

The applications use `.env` files for configuration. Be sure to configure the necessary API keys (OpenAI, Discord Bot Token, Slack Webhook, etc.) in the respective sub-applications depending on your setup.

## Technology Stack

- **TypeScript**: Typed JavaScript for robust development.
- **Concurrent Execution**: Orchestrated using \`concurrently\`.
- **Database**: SQLite (via backend config).
- **AI Integrations**: Setup for LLM providers to evaluate collected texts.
