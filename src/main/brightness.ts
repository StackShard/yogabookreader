/**
 * Hardware screen brightness control (PRD §Settings "brightness slider").
 *
 * On Windows, the internal panel backlight is settable via WMI
 * (`WmiMonitorBrightnessMethods.WmiSetBrightness`). We shell out to PowerShell
 * for it. This only works for displays that expose WMI brightness (typically the
 * built-in panel[s]); when it isn't available the caller falls back to an in-app
 * dimming overlay.
 */

import { execFile } from 'node:child_process';
import { log } from './log.js';

/**
 * Set the system (internal-panel) brightness to `level` (0–100) on Windows.
 * Resolves true on success, false if unsupported or the call failed — the caller
 * then applies the dim-overlay fallback.
 */
export function setHardwareBrightness(level: number): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  const clamped = Math.max(0, Math.min(100, Math.round(level)));
  const script = `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${clamped})`;
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 5000, windowsHide: true },
      (err) => {
        if (err) {
          log('hardware brightness unavailable, using dim fallback:', err.message);
          resolve(false);
        } else {
          resolve(true);
        }
      },
    );
  });
}
