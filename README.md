# Xiaohongshu Layout Tool

Responsive web prototype for turning long-form text into Xiaohongshu-friendly image pages.

## Current Scope

- `Workspace` for text input, typography controls, AI refine, and `3:4` auto pagination
- `Export` for selecting generated pages and preparing downloads
- `DeepSeek` server-side proxy for AI-assisted rewrite and layout suggestions
- No user system, no history, and no persistent storage in `v1`

## Project Structure

```text
index.html      # Workspace view entry
export.html     # Export view entry
script.js       # Workspace logic
export.js       # Export logic
styles.css      # Shared styles
server.js       # Node server + AI proxy
docs/           # Product and engineering docs
```

## Development

### Requirements

- Node.js `>=22`
- npm `>=10`

### Install

```bash
npm install
```

### Run locally

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### Run checks

```bash
npm run check
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in real values.

```bash
cp .env.example .env.local
```

Required variables:

- `AI_PROVIDER`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `PORT`

Rules:

- Never commit real API keys
- Only read provider keys on the server
- Keep `.env.local` local to your machine
- Rotate any key that was pasted into chat, screenshots, or logs

## Git Workflow

- Keep `main` always releasable
- Create short-lived branches from `main`
- Open a PR for every change
- Attach screenshots for UI changes
- Keep each PR focused on one concern

Recommended branch prefixes:

- `feature/`
- `fix/`
- `refactor/`
- `docs/`

Recommended commit format:

```text
feat: add export image rendering
fix: correct 3:4 pagination overflow
refactor: split parser from workspace script
docs: add engineering setup guide
```

## Near-Term Engineering Direction

- Move from page-level scripts to modular frontend files
- Replace cross-page state hacks with one shared in-memory app state
- Extract parser and pagination into pure modules
- Add automated image export and browser regression checks

See [engineering.md](./docs/engineering.md) for the maintainability baseline.
