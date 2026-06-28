## PR Checklist

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm test` passes (57 tests in `src/core/`)
- [ ] Tested on dual portrait displays (or single portrait display) if change affects rendering or window management
- [ ] No Electron, Node.js, or DOM imports added to `src/core/`
- [ ] IPC contract (`src/shared/ipc.ts`) changes are reflected in both main and renderer
- [ ] [CHANGELOG.md](CHANGELOG.md) updated with a brief note under an `[Unreleased]` section

## What does this change?

<!-- Brief description of what this PR does and why -->

## How was it tested?

<!-- How did you verify this works? -->
