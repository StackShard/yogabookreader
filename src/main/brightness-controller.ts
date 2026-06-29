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
  /**
   * Apply a brightness level: persist, try the real hardware backlight, and
   * report whether the renderers need the dim-overlay fallback.
   */
  async set(level: number): Promise<BrightnessResult> {
    const clamped = Math.max(
      BRIGHTNESS_MIN,
      Math.min(BRIGHTNESS_MAX, Math.round(level)),
    );
    updateSettings({ brightness: clamped });
    const ok = await setHardwareBrightness(clamped);
    return { dimLevel: ok ? null : clamped };
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
