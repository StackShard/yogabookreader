/**
 * Control overlay (PRD §Control Overlay, US#10/#11/#12).
 *
 * A touch control layer shown only in the right (or single) window. The minimal
 * layer has prev/next, settings, library and a page counter; swiping up reveals
 * the expanded toolbar (zoom presets, direction toggle, go-to-page, exit). It
 * auto-hides after 3 seconds of inactivity.
 */

import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  BRIGHTNESS_STEP,
  type ZoomPreset,
} from '../core/types.js';

const AUTO_HIDE_MS = 8000;

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
  private readonly progressFill: HTMLElement;
  private readonly fullScreenButton: HTMLButtonElement;
  private readonly adaptiveButton: HTMLButtonElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private expanded = false;
  private hovered = false;
  private adaptiveDisabled: boolean;

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
    this.progressFill = document.createElement('div');
    this.progressFill.className = 'overlay-progress-fill';
    this.fullScreenButton = this.button('Exit Full-Screen', () => this.cb.onToggleFullScreen());
    this.adaptiveButton = this.button(this.adaptiveLabel(), () => this.toggleAdaptive());
    this.build();
    document.body.appendChild(this.root);
    this.attachSwipeUp();
    this.attachHoverPause();
  }

  private build(): void {
    const progress = document.createElement('div');
    progress.className = 'overlay-progress';
    const track = document.createElement('div');
    track.className = 'overlay-progress-track';
    track.appendChild(this.progressFill);
    progress.append(this.progressLabel, track);

    // Minimal bar: page navigation first (most-used), then library/help/more,
    // and a manual hide on the far right.
    const minimal = document.createElement('div');
    minimal.className = 'overlay-bar';
    minimal.append(
      this.button('‹ Prev', () => this.cb.onPrev(), 'overlay-btn-nav'),
      this.button('Next ›', () => this.cb.onNext(), 'overlay-btn-nav'),
      this.button('▦ Library', () => this.cb.onOpenLibrary()),
      this.button('? Help', () => this.cb.onShowHelp()),
      this.button('⚙ More', () => this.toggleExpanded()),
      this.button('⌄ Hide', () => this.hide()),
    );

    // Expanded drawer: grouped by purpose for a predictable flow.
    const expanded = document.createElement('div');
    expanded.className = 'overlay-expanded';
    expanded.append(
      this.row(
        this.button('Fit Width', () => this.cb.onSetZoom('fit-width')),
        this.button('Fit Height', () => this.cb.onSetZoom('fit-height')),
        this.button('Full Bleed', () => this.cb.onSetZoom('full-bleed')),
      ),
      this.row(
        this.button('LTR / RTL', () => this.cb.onToggleDirection()),
        this.gotoInput(),
      ),
      this.row(this.brightnessControl(), this.adaptiveButton),
      this.row(this.fullScreenButton, this.button('Quit', () => this.cb.onQuit())),
    );
    this.root.append(progress, minimal, expanded);
  }

  private adaptiveLabel(): string {
    return `Auto-brightness: ${this.adaptiveDisabled ? 'Off' : 'On'}`;
  }

  private toggleAdaptive(): void {
    this.adaptiveDisabled = !this.adaptiveDisabled;
    this.adaptiveButton.textContent = this.adaptiveLabel();
    this.cb.onToggleAdaptive(this.adaptiveDisabled);
  }

  /** Brightness slider with fixed increments (PRD §Settings). */
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

  /** Reflect the current full-screen state on the toggle button's label. */
  setFullScreenState(isFullScreen: boolean): void {
    this.fullScreenButton.textContent = isFullScreen ? 'Exit Full-Screen' : 'Enter Full-Screen';
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

  /** A labelled group of controls within the expanded drawer. */
  private row(...children: HTMLElement[]): HTMLElement {
    const r = document.createElement('div');
    r.className = 'overlay-row';
    r.append(...children);
    return r;
  }

  private gotoInput(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'overlay-goto';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.placeholder = 'Go to page';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const page = Number(input.value) - 1;
        if (page >= 0) this.cb.onJump(page);
        this.poke();
      }
    });
    wrap.appendChild(input);
    return wrap;
  }

  private attachSwipeUp(): void {
    let startY = 0;
    this.root.addEventListener('pointerdown', (e) => (startY = e.clientY));
    this.root.addEventListener('pointerup', (e) => {
      if (startY - e.clientY > 60) this.setExpanded(true);
      else if (e.clientY - startY > 60) this.setExpanded(false);
    });
  }

  /** Keep the bar visible while the pointer is over it (don't auto-hide). */
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

  private toggleExpanded(): void {
    this.setExpanded(!this.expanded);
  }

  private setExpanded(value: boolean): void {
    this.expanded = value;
    this.root.classList.toggle('expanded', value);
    this.poke();
  }

  /** Show the overlay (called on centre-zone tap) and reset the auto-hide timer. */
  show(): void {
    this.root.classList.remove('hidden');
    this.poke();
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.setExpandedSilently(false);
  }

  private setExpandedSilently(value: boolean): void {
    this.expanded = value;
    this.root.classList.toggle('expanded', value);
  }

  /** Reset the inactivity timer that auto-hides the overlay (paused only while touched). */
  private poke(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.hovered) return;
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  /** Update the page progress label and bar from the current spread's pages. */
  setProgress(pages: number[], totalPages: number): void {
    if (pages.length === 0 || totalPages <= 0) {
      this.progressLabel.textContent = '';
      this.progressFill.style.width = '0%';
      return;
    }
    const first = Math.min(...pages) + 1;
    const last = Math.max(...pages) + 1;
    this.progressLabel.textContent =
      first === last ? `Page ${first} of ${totalPages}` : `Pages ${first}–${last} of ${totalPages}`;
    this.progressFill.style.width = `${Math.round((last / totalPages) * 100)}%`;
  }
}
