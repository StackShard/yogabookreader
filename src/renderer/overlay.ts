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
const SWIPE_DISMISS_PX = 150;
const SWIPE_COLLAPSE_PX = 60;

export interface OverlayCallbacks {
  onPrev(): void;
  onNext(): void;
  onJump(pageIndex: number): void;
  onToggleDirection(): void;
  onSetZoom(preset: ZoomPreset): void;
  onNudgeSpread(): void;
  onResetSpread(): void;
  onOpenLibrary(): void;
  onToggleFullScreen(): void;
  onQuit(): void;
  onSetBrightness(level: number): void;
  onToggleAdaptive(disabled: boolean): void;
  onShowHelp(): void;
}

export class ControlOverlay {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly adaptiveButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;
  private readonly confirmRow: HTMLElement;
  private readonly zoomButtons = new Map<ZoomPreset, HTMLButtonElement>();
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private expanded = false;
  private hovered = false;
  private adaptiveDisabled: boolean;
  private bookTitle = '';
  private pageLabel = '';
  private dialpadEl: HTMLElement | null = null;
  private dialpadDisplay: HTMLElement | null = null;
  private dialpadHint: HTMLElement | null = null;
  private dialpadValue = '';
  private dialpadOpen = false;
  private clampTimer: ReturnType<typeof setTimeout> | null = null;
  private totalPages = 0;

  constructor(
    private readonly cb: OverlayCallbacks,
    private readonly initialBrightness: number,
    initialAdaptiveDisabled: boolean,
  ) {
    this.adaptiveDisabled = initialAdaptiveDisabled;
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'overlay-title';

    this.adaptiveButton = this.button(this.adaptiveLabel(), () => this.toggleAdaptive(), 'overlay-btn-adaptive');
    this.settingsButton = this.makeSettingsButton();
    this.confirmRow = this.buildConfirmRow();

    this.build();
    document.body.appendChild(this.root);
    this.attachSwipeUp();
    this.attachHoverPause();
  }

  private build(): void {
    // Settings strip: zoom presets + direction + page picker. Auto-collapses after zoom/direction.
    const settingsRow = document.createElement('div');
    settingsRow.className = 'overlay-settings-row';
    const zoomFitWidth = this.zoomButton('Fit Width', 'fit-width');
    const zoomFitHeight = this.zoomButton('Fit Height', 'fit-height');
    const zoomFullBleed = this.zoomButton('Full Bleed', 'full-bleed');
    settingsRow.append(
      zoomFitWidth,
      zoomFitHeight,
      zoomFullBleed,
      this.button('↔ LTR/RTL', this.settingsAction(() => this.cb.onToggleDirection())),
      this.button('Jump Page', () => this.showDialPad(), 'overlay-btn-page'),
      // Spread alignment: nudge one page (fixes a skipped/mis-scanned page) and reset.
      this.button('⇥ Nudge', this.settingsAction(() => this.cb.onNudgeSpread())),
      this.button('Reset align', this.settingsAction(() => this.cb.onResetSpread())),
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

    // Order: title, settings strip, confirm row, minimal bar
    this.root.append(this.titleEl, settingsWrap, this.confirmRow, minimal);
  }

  /** Creates a zoom button and registers it in the zoomButtons map. */
  private zoomButton(label: string, preset: ZoomPreset): HTMLButtonElement {
    const b = this.button(label, this.settingsAction(() => this.cb.onSetZoom(preset)));
    this.zoomButtons.set(preset, b);
    return b;
  }

  /** Wraps a settings-strip action so it collapses the strip after firing. */
  private settingsAction(action: () => void): () => void {
    return () => { action(); this.setExpanded(false); };
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

  // ---- Dial-pad page picker ----

  private buildDialPad(): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialpad-overlay hidden';

    const pad = document.createElement('div');
    pad.className = 'dialpad';

    this.dialpadDisplay = document.createElement('div');
    this.dialpadDisplay.className = 'dialpad-display';

    this.dialpadHint = document.createElement('div');
    this.dialpadHint.className = 'dialpad-hint';

    const grid = document.createElement('div');
    grid.className = 'dialpad-grid';

    const appendDigit = (d: string) => {
      let next = this.dialpadValue + d;
      // Flash-clamp anything beyond the last page so the limit is visible
      // instead of the jump silently landing on the final spread.
      if (this.totalPages > 0 && Number(next) > this.totalPages) {
        next = String(this.totalPages);
        this.flashClamp();
      }
      this.dialpadValue = next;
      if (this.dialpadDisplay) this.dialpadDisplay.textContent = next;
    };

    const backspace = () => {
      this.dialpadValue = this.dialpadValue.slice(0, -1);
      if (this.dialpadDisplay) this.dialpadDisplay.textContent = this.dialpadValue;
    };

    const confirm = () => {
      const page = Number(this.dialpadValue);
      if (page >= 1) this.cb.onJump(page - 1);
      this.closeDialPad();
    };

    // Layout: 7 8 9 / 4 5 6 / 1 2 3 / ⌫ 0 ✓
    for (const key of ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓']) {
      const btn = document.createElement('button');
      btn.className = 'dialpad-key';
      if (key === '⌫') btn.className += ' dialpad-key-back';
      if (key === '✓') btn.className += ' dialpad-key-confirm';
      btn.textContent = key;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (key === '⌫') backspace();
        else if (key === '✓') confirm();
        else appendDigit(key);
      });
      grid.appendChild(btn);
    }

    pad.append(this.dialpadDisplay, this.dialpadHint, grid);
    backdrop.appendChild(pad);
    backdrop.addEventListener('click', () => this.closeDialPad());
    pad.addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(backdrop);
    this.dialpadEl = backdrop;
  }

  private showDialPad(): void {
    if (!this.dialpadEl) this.buildDialPad();
    this.dialpadValue = '';
    if (this.dialpadDisplay) this.dialpadDisplay.textContent = '';
    if (this.dialpadHint) {
      this.dialpadHint.textContent = this.totalPages > 0 ? `of ${this.totalPages} pages` : '';
    }
    this.dialpadOpen = true;
    this.dialpadEl!.classList.remove('hidden');
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
  }

  private flashClamp(): void {
    this.dialpadDisplay?.classList.add('dialpad-clamped');
    if (this.clampTimer) clearTimeout(this.clampTimer);
    this.clampTimer = setTimeout(
      () => this.dialpadDisplay?.classList.remove('dialpad-clamped'),
      350,
    );
  }

  private closeDialPad(): void {
    this.dialpadOpen = false;
    this.dialpadEl?.classList.add('hidden');
    this.poke();
  }

  // ---- Swipe & hover ----

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
      const dy = e.clientY - startY;
      if (startY - e.clientY > SWIPE_COLLAPSE_PX) {
        this.setExpanded(true);
      } else if (dy > SWIPE_DISMISS_PX) {
        // Hard swipe down dismisses the whole overlay.
        this.hide();
      } else if (dy > SWIPE_COLLAPSE_PX) {
        this.setExpanded(false);
      }
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

  /** Centre-tap toggle: hide when visible, show otherwise. */
  toggle(): void {
    if (this.root.classList.contains('hidden')) this.show();
    else this.hide();
  }

  /** Close the topmost layer (dial pad before the bar). True if one closed. */
  dismissTopmost(): boolean {
    if (this.dialpadOpen) {
      this.closeDialPad();
      return true;
    }
    if (!this.root.classList.contains('hidden')) {
      this.hide();
      return true;
    }
    return false;
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.hideQuitConfirm();
    this.dialpadOpen = false;
    this.dialpadEl?.classList.add('hidden');
    // Reset to collapsed state so next show starts clean
    this.expanded = false;
    this.root.classList.remove('expanded');
  }

  private poke(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.hovered || this.dialpadOpen) return;
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  /** Update the combined title · page header line. */
  private updateHeader(): void {
    this.titleEl.textContent =
      this.bookTitle && this.pageLabel
        ? `${this.bookTitle} · ${this.pageLabel}`
        : this.bookTitle || this.pageLabel;
  }

  setBookTitle(title: string): void {
    this.bookTitle = title;
    this.updateHeader();
  }

  /** Highlight the button matching the current zoom preset. */
  setActiveZoom(preset: ZoomPreset): void {
    for (const [p, btn] of this.zoomButtons) {
      btn.classList.toggle('overlay-btn-active', p === preset);
    }
  }

  setProgress(pages: number[], totalPages: number): void {
    this.totalPages = totalPages;
    if (pages.length === 0 || totalPages <= 0) {
      this.pageLabel = '';
    } else {
      const first = Math.min(...pages) + 1;
      const last = Math.max(...pages) + 1;
      this.pageLabel =
        first === last ? `${first} / ${totalPages}` : `${first}–${last} / ${totalPages}`;
    }
    this.updateHeader();
  }
}
