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

## Future Upgrade Path

- Introduce TypeScript for stronger shared models
- Split `web` and `api` into separate app folders
- Add automated tests for parser, paginator, and API responses
- Add CI checks for lint, format, and smoke validation
