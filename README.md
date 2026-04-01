# Xiaohongshu Layout Tool

Responsive web app for turning long-form text into Xiaohongshu-friendly image pages.

## Current Scope

- `Workspace` for text input, typography controls, AI refine, and `3:4` auto pagination
- `Export` for selecting generated pages and preparing downloads
- `DeepSeek` server-side proxy for AI-assisted rewrite and layout suggestions
- No user system, no history, and no persistent storage in `v1`

## Project Structure

```text
index.html        # Main single-page app entry
script.js         # Thin browser entry that boots the app
src/              # Modular frontend logic
server.js         # Node server + AI proxy
styles.css        # Shared styles
prompts/          # Editable AI prompt files
docs/             # Product and engineering docs
export.html       # Legacy / reference page
history.html      # Legacy / reference page
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

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Important:

- Do not open `index.html` with `file://`
- Browser-side modules are blocked under `file://`, so the app will look broken
- Always run the Node server first, then open `http://127.0.0.1:3000`

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

## npm and CI

This project intentionally pins the npm registry to the official source via [`.npmrc`](/Users/guoxl/Documents/Playground/xiaohongshu-layout-prototype/.npmrc).

Why this matters:

- GitHub Actions installs dependencies from `package-lock.json`
- If the lockfile is generated from a mirror such as `cnpmjs`, CI can fail during install
- The workflow uses `npm ci` for deterministic installs

Rules:

- Keep the registry on `https://registry.npmjs.org/`
- If `package-lock.json` ever contains `cnpmjs` or other mirror URLs, regenerate it before pushing
- Prefer `npm ci` in CI and `npm install` only when intentionally updating dependencies

Quick recovery steps if CI fails during install:

```bash
npm config set registry https://registry.npmjs.org/
rm -rf node_modules package-lock.json
npm install
npm run check
```

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
