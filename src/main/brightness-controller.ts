/**
 * Brightness controller (PRD §Settings "brightness slider").
 *
 * Owns the brightness and adaptive-brightness policy for the main process.
 * Composes with the raw hardware-control functions in {@link ./brightness.ts}
 * and the persisted settings, and emits a dim-level signal the controller
 * broadcasts to renderers (the HW path may not be available, in which case an
 * in-app overlay dim is used instead).
 *
 * Extracted from ReaderController so the brightness concern is testable
 * through a single interface.
 */

import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
} from '../core/types.js';
import {
  setAdaptiveBrightness,
  setHardwareBrightness,
} from './brightness.js';
import { getSettings, updateSettings } from './state-store.js';

export interface BrightnessResult {
  /** null = HW handled it; number = dim overlay level to display. */
  dimLevel: number | null;
}

export class BrightnessController {
  /** Latest requested level not yet applied (overwritten by newer requests). */
  private pending: number | null = null;
  /** The single in-flight apply loop; all coalesced callers share its result. */
  private worker: Promise<boolean> | null = null;

  /**
   * Apply a brightness level: persist, try the real hardware backlight, and
   * report whether the renderers need the dim-overlay fallback.
   *
   * Rapid calls (a slider drag fires one per tick) are coalesced: while one
   * WMI/PowerShell call is in flight only the latest requested level is kept,
   * so processes don't pile up and the final level always wins.
   */
  async set(level: number): Promise<BrightnessResult> {
    const clamped = Math.max(
      BRIGHTNESS_MIN,
      Math.min(BRIGHTNESS_MAX, Math.round(level)),
    );
    const ok = await this.applyCoalesced(clamped);
    return { dimLevel: ok ? null : clamped };
  }

  private applyCoalesced(level: number): Promise<boolean> {
    this.pending = level;
    if (!this.worker) {
      this.worker = (async () => {
        let ok = false;
        try {
          while (this.pending !== null) {
            const next = this.pending;
            this.pending = null;
            updateSettings({ brightness: next });
            ok = await setHardwareBrightness(next);
          }
        } finally {
          this.worker = null;
        }
        return ok;
      })();
    }
    return this.worker;
  }

  /**
   * Apply persisted brightness settings at startup: optionally disable Windows
   * adaptive brightness (so it can't override the manual level), then set it.
   */
  async startup(): Promise<BrightnessResult> {
    const settings = getSettings();
    if (settings.disableAdaptiveBrightness) {
      await setAdaptiveBrightness(false);
    }
    return this.set(settings.brightness);
  }

  /** Toggle disabling of Windows adaptive brightness (persisted). */
  async setAdaptiveDisabled(
    disabled: boolean,
  ): Promise<BrightnessResult | null> {
    updateSettings({ disableAdaptiveBrightness: disabled });
    await setAdaptiveBrightness(!disabled);
    if (disabled) return this.set(getSettings().brightness);
    return null;
  }

  /** Restore Windows adaptive brightness (call on quit). */
  async shutdown(): Promise<void> {
    if (getSettings().disableAdaptiveBrightness) {
      await setAdaptiveBrightness(true);
    }
  }
}
