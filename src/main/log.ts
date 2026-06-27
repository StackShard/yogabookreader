/**
 * Minimal main-process logging. Output goes to the terminal running the app
 * (e.g. the PowerShell window running `npm run dev`), which is handy for
 * diagnosing load/navigation issues on the device.
 */

export function log(...args: unknown[]): void {
  console.log('[yreader]', ...args);
}

export function logError(...args: unknown[]): void {
  console.error('[yreader]', ...args);
}
