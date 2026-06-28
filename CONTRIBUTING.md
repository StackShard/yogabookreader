# Contributing

Yoga Book Reader is open source and welcomes contributions. The app is designed
for dual-screen Windows devices — it detects portrait displays and renders content
across them as a two-page spread. The core logic is hardware-independent and
platform-agnostic.

## Development Setup

```bash
git clone https://github.com/StackShard/yogabookreader.git
cd yogabookreader
npm install
```

## Useful Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development mode (with HMR) |
| `npm test` | Run unit tests (vitest) |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run build` | Bundle main/preload/renderer + typecheck |
| `npm run package` | Build + produce portable .exe and NSIS installer |

## Architecture

The project enforces a clean separation of concerns:

- **`src/core/`** — Pure logic. **Must not** import Electron, Node.js, or DOM APIs.
  Fully unit-testable.
- **`src/main/`** — Electron main process. Window management, file I/O, IPC.
- **`src/preload/`** — Context bridge exposing `window.reader` to renderers.
- **`src/renderer/`** — Per-window UI. Canvas rendering, touch handling, overlay.
- **`src/shared/`** — Typed IPC contract shared across all layers.

## Before Submitting a PR

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm test` passes (57 tests in `src/core/`)
- [ ] If your change affects rendering, tested on dual portrait displays or a
      single display in portrait mode
- [ ] If your change affects the IPC contract, both main and renderer compile
- [ ] No Electron/Node.js imports added to `src/core/`

## Testing on Hardware

CI cannot provide dual portrait displays. The Electron rendering layer is best
verified on a device with two portrait screens:

1. Connect both screens in portrait orientation, side by side
2. `npm run dev` for live development, or `npm run package` to test the built .exe
3. Test with PDF, CBZ, and CBR files
4. Test single-screen fallback by disconnecting a display or switching one to
   landscape
5. Test display detection by changing screen orientation while the app is running

## License

By contributing, you agree that your contributions will be licensed under the
[CC BY-NC-SA 4.0](LICENSE) license.
