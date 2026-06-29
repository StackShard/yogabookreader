/**
 * Control overlay (PRD §Control Overlay, US#10/#11/#12).
 *
 * Touch control layer shown only in the right (or single) window. A minimal
 * bar pins to the bottom; swiping up or tapping ⚙ Settings reveals the
 * single-row settings strip. Auto-hides after 8 s of inactivity.
 */

import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  BRIGHTNESS_STEP,
  type ZoomPreset,
} from '../core/types.js';

const AUTO_HIDE_MS = 8000;
const QUIT_CONFIRM_MS = 5000;

export interface OverlayCallbacks {
  onPrev(): void;
  onNext(): void;
  onJump(pageIndex: number): void;
  onToggleDirection(): void;
  onSetZoom(preset: ZoomPreset): void;
  onOpenLibrary(): void;
  onToggleFullScreen(): void;
  onQuit(): void;
  onSetBrightness(level: number): void;
  onToggleAdaptive(disabled: boolean): void;
  onShowHelp(): void;
}

export class ControlOverlay {
  private readonly root: HTMLElement;
  private readonly progressLabel: HTMLElement;
  private readonly progressTrack: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly adaptiveButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;
  private readonly confirmRow: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private expanded = false;
  private hovered = false;
  private adaptiveDisabled: boolean;
  private totalPages = 0;

  constructor(
    private readonly cb: OverlayCallbacks,
    private readonly initialBrightness: number,
    initialAdaptiveDisabled: boolean,
  ) {
    this.adaptiveDisabled = initialAdaptiveDisabled;
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';

    this.progressLabel = document.createElement('span');
    this.progressLabel.className = 'overlay-progress-label';

    this.progressTrack = document.createElement('div');
    this.progressTrack.className = 'overlay-progress-track';
    this.progressFill = document.createElement('div');
    this.progressFill.className = 'overlay-progress-fill';
    this.progressTrack.appendChild(this.progressFill);

    this.adaptiveButton = this.button(this.adaptiveLabel(), () => this.toggleAdaptive(), 'overlay-btn-adaptive');
    this.settingsButton = this.makeSettingsButton();
    this.confirmRow = this.buildConfirmRow();

    this.build();
    document.body.appendChild(this.root);
    this.attachSwipeUp();
    this.attachHoverPause();
  }

  private build(): void {
    // Progress row: label + goto input + Go button + bar
    const gotoInput = document.createElement('input');
    gotoInput.type = 'number';
    gotoInput.min = '1';
    gotoInput.placeholder = '#';
    gotoInput.className = 'overlay-goto-input';
    gotoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const page = Number(gotoInput.value) - 1;
        if (page >= 0) this.cb.onJump(page);
        gotoInput.value = '';
        this.poke();
      }
    });

    const gotoBtn = this.button('Go', () => {
      const page = Number(gotoInput.value) - 1;
      if (page >= 0) this.cb.onJump(page);
      gotoInput.value = '';
    }, 'overlay-btn-go');

    // Clicking the progress bar jumps to that position in the book
    this.progressTrack.style.cursor = 'pointer';
    this.progressTrack.addEventListener('click', (e) => {
      if (this.totalPages <= 0) return;
      const rect = this.progressTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.cb.onJump(Math.round(ratio * (this.totalPages - 1)));
      this.poke();
    });

    const progress = document.createElement('div');
    progress.className = 'overlay-progress';
    progress.append(this.progressLabel, gotoInput, gotoBtn, this.progressTrack);

    // Settings strip (collapsed by default) — zoom and direction only
    const settingsRow = document.createElement('div');
    settingsRow.className = 'overlay-settings-row';
    settingsRow.append(
      this.button('Fit Width', () => this.cb.onSetZoom('fit-width')),
      this.button('Fit Height', () => this.cb.onSetZoom('fit-height')),
      this.button('Full Bleed', () => this.cb.onSetZoom('full-bleed')),
      this.button('↔ LTR/RTL', () => this.cb.onToggleDirection()),
    );

    const settingsWrap = document.createElement('div');
    settingsWrap.className = 'overlay-expanded';
    settingsWrap.appendChild(settingsRow);

    // Primary bar: Quit | Help | Settings | Library | brightness | Auto
    const minimal = document.createElement('div');
    minimal.className = 'overlay-bar';
    minimal.append(
      this.buildQuitButton(),
      this.button('? Help', () => this.cb.onShowHelp()),
      this.settingsButton,
      this.button('▦ Library', () => this.cb.onOpenLibrary()),
      this.brightnessControl(),
      this.adaptiveButton,
    );

    // Order: progress, settings strip, confirm row, minimal bar
    this.root.append(progress, settingsWrap, this.confirmRow, minimal);
  }

  /** Settings button toggles the expanded strip; stays labelled "⚙ Settings" either way. */
  private makeSettingsButton(): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = '⚙ Settings';
    b.className = 'overlay-btn overlay-btn-settings';
    b.addEventListener('click', () => {
      this.setExpanded(!this.expanded);
      this.poke();
    });
    return b;
  }

  private buildQuitButton(): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = 'Quit';
    b.className = 'overlay-btn overlay-btn-quit';
    b.addEventListener('click', () => {
      this.showQuitConfirm();
      this.poke();
    });
    return b;
  }

  private buildConfirmRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'overlay-confirm-row hidden';

    const label = document.createElement('span');
    label.className = 'overlay-confirm-label';
    label.textContent = 'Really quit?';

    const cancelBtn = this.button('Cancel', () => this.hideQuitConfirm(), 'overlay-btn-cancel');
    const quitNowBtn = this.button('Quit Now', () => this.cb.onQuit(), 'overlay-btn-quit-now');

    row.append(label, cancelBtn, quitNowBtn);
    return row;
  }

  private showQuitConfirm(): void {
    this.confirmRow.classList.remove('hidden');
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => this.hideQuitConfirm(), QUIT_CONFIRM_MS);
  }

  private hideQuitConfirm(): void {
    this.confirmRow.classList.add('hidden');
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
      this.confirmTimer = null;
    }
  }

  private adaptiveLabel(): string {
    return this.adaptiveDisabled ? '☀ Auto: Off' : '☀ Auto: On';
  }

  private toggleAdaptive(): void {
    this.adaptiveDisabled = !this.adaptiveDisabled;
    this.adaptiveButton.textContent = this.adaptiveLabel();
    this.cb.onToggleAdaptive(this.adaptiveDisabled);
  }

  private brightnessControl(): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'overlay-brightness';
    const label = document.createElement('span');
    label.textContent = '☀';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(BRIGHTNESS_MIN);
    slider.max = String(BRIGHTNESS_MAX);
    slider.step = String(BRIGHTNESS_STEP);
    slider.value = String(this.initialBrightness);
    slider.addEventListener('input', () => {
      this.cb.onSetBrightness(Number(slider.value));
      this.poke();
    });
    wrap.append(label, slider);
    return wrap;
  }

  private button(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = `overlay-btn${extraClass ? ' ' + extraClass : ''}`;
    b.addEventListener('click', () => {
      onClick();
      this.poke();
    });
    return b;
  }

  private attachSwipeUp(): void {
    let startY = 0;
    let tracking = false;
    this.root.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      tracking = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      if (startY - e.clientY > 60) this.setExpanded(true);
      else if (e.clientY - startY > 60) this.setExpanded(false);
    });
  }

  private attachHoverPause(): void {
    this.root.addEventListener('pointerenter', () => {
      this.hovered = true;
      if (this.hideTimer) clearTimeout(this.hideTimer);
    });
    this.root.addEventListener('pointerleave', () => {
      this.hovered = false;
      this.poke();
    });
  }

  private setExpanded(value: boolean): void {
    this.expanded = value;
    this.root.classList.toggle('expanded', value);
    this.poke();
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.poke();
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.hideQuitConfirm();
    // Reset to collapsed state so next show starts clean
    this.expanded = false;
    this.root.classList.remove('expanded');
  }

  private poke(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.hovered) return;
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  setProgress(pages: number[], totalPages: number): void {
    this.totalPages = totalPages;
    if (pages.length === 0 || totalPages <= 0) {
      this.progressLabel.textContent = '';
      this.progressFill.style.width = '0%';
      return;
    }
    const first = Math.min(...pages) + 1;
    const last = Math.max(...pages) + 1;
    this.progressLabel.textContent =
      first === last ? `${first} / ${totalPages}` : `${first}–${last} / ${totalPages}`;
    this.progressFill.style.width = `${Math.round((last / totalPages) * 100)}%`;
  }
}
