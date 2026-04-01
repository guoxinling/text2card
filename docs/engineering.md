# Engineering Baseline

## V1 Product Constraints

- No user accounts
- No history
- No persistent storage
- One in-memory editing session
- AI requests must go through the server

## Architecture Direction

- Frontend: one shared state for workspace and export
- Backend: lightweight Node service for AI and future export endpoints
- Parsing and pagination should become standalone modules

## Non-Negotiable Rules

1. Never expose provider API keys to the browser.
2. Never couple export rendering directly to raw editor DOM.
3. Pagination must remain deterministic for the same input and config.
4. Generated assets and screenshots should not be committed by default.
5. Local development must run through the Node server, not `file://`.
6. Dependency installs must use the official npm registry to keep CI reproducible.

## Future Upgrade Path

- Introduce TypeScript for stronger shared models
- Split `web` and `api` into separate app folders
- Add automated tests for parser, paginator, and API responses
- Add CI checks for lint, format, and smoke validation

## Current CI Expectations

- GitHub Actions installs with `npm ci`
- `package-lock.json` should resolve packages from `https://registry.npmjs.org/`
- Project-level [`.npmrc`](/Users/guoxl/Documents/Playground/xiaohongshu-layout-prototype/.npmrc) should remain committed
- If CI fails in `Install dependencies`, inspect the lockfile for mirror URLs before debugging app code
