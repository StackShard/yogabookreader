# Contributing

Yoga Book Reader is open source and welcomes contributions. The app is designed
specifically for the Lenovo Yoga Book Gen 10 dual-screen device, but the core
logic is hardware-independent and cross-platform.

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
- [ ] If your change affects rendering, tested on actual Yoga Book hardware or
      dual 1800×2880 portrait monitors
- [ ] If your change affects the IPC contract, both main and renderer compile
- [ ] No Electron/Node.js imports added to `src/core/`

## Testing on Hardware

CI cannot provide dual portrait displays. The Electron rendering layer is best
verified on a Yoga Book Gen 10:

1. Connect both screens in portrait orientation
2. `npm run dev` for live development, or `npm run package` to test the built .exe
3. Test with PDF, CBZ, and CBR files
4. Test single-screen fallback by folding the device or switching one display to landscape
5. Test display detection by changing screen orientation while the app is running

## License

By contributing, you agree that your contributions will be licensed under the
[CC BY-NC-SA 4.0](LICENSE) license.
