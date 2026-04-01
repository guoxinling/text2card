# Contributing

## Branching

- Branch from `main`
- Use a short-lived branch
- Prefer names like `feature/pagination-refactor` or `fix/deepseek-errors`

## Pull Requests

- Keep PRs scoped to one topic
- Include before/after screenshots for UI changes
- Describe any impact on pagination, export, or AI behavior
- Note any follow-up work left intentionally out of scope

## Coding Rules

- Keep secrets on the server only
- Avoid mixing product logic with DOM rendering when adding new features
- Prefer pure functions for parsing and pagination logic
- Add small comments only where the code is otherwise hard to parse

## Verification

Before opening a PR, run:

```bash
npm run check
```

If the change affects UI behavior, also verify:

- Workspace pagination
- Export card generation
- AI refine request/response path
