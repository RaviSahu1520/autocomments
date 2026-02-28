# Autocomments App

An automated system designed to monitor various online platforms (Discord, Reddit, Quora), evaluate the relevance of conversations using AI/LLMs based on specific keywords, and alert you of high-value engagement opportunities.

## Project Structure

This project is a monorepo utilizing npm workspaces:

- **`apps/backend`**: The core API, pipeline processor, LLM integrations (OpenAI), and notification distributors (Discord, Slack, SMTP).
- **`apps/discord-bot`**: A Discord bot that monitors channels for specific keywords and forwards them to the backend for scoring and notification.

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

Run both the backend and discord-bot concurrently in watch mode:

```bash
npm run dev
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

Start the compiled applications concurrently:

```bash
npm start
```

Or start them individually:

```bash
npm start:backend
```

## Testing

Run tests across the apps:

```bash
npm test
```

## Configuration

The applications use `.env` files for configuration. Be sure to configure the necessary API keys (OpenAI, Discord Bot Token, Slack Webhook, etc.) in the respective sub-applications depending on your setup.

## Technology Stack

- **TypeScript**: Typed JavaScript for robust development.
- **Concurrent Execution**: Orchestrated using \`concurrently\`.
- **Database**: SQLite (via backend config).
- **AI Integrations**: Setup for LLM providers to evaluate collected texts.
