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

const AUTO_HIDE_MS = 3000;

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
}

export class ControlOverlay {
  private readonly root: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly fullScreenButton: HTMLButtonElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private expanded = false;

  constructor(
    private readonly cb: OverlayCallbacks,
    private readonly initialBrightness: number,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.counter = document.createElement('span');
    this.counter.className = 'overlay-counter';
    this.fullScreenButton = this.button('Exit Full-Screen', () => this.cb.onToggleFullScreen());
    this.build();
    document.body.appendChild(this.root);
    this.attachSwipeUp();
  }

  private build(): void {
    const minimal = document.createElement('div');
    minimal.className = 'overlay-bar';
    minimal.append(
      this.button('‹', () => this.cb.onPrev()),
      this.button('›', () => this.cb.onNext()),
      this.counter,
      this.button('▦', () => this.cb.onOpenLibrary()),
      this.button('⚙', () => this.toggleExpanded()),
    );

    const expanded = document.createElement('div');
    expanded.className = 'overlay-expanded';
    expanded.append(
      this.button('Fit Height', () => this.cb.onSetZoom('fit-height')),
      this.button('Fit Width', () => this.cb.onSetZoom('fit-width')),
      this.button('Full Bleed', () => this.cb.onSetZoom('full-bleed')),
      this.button('LTR / RTL', () => this.cb.onToggleDirection()),
      this.gotoInput(),
      this.brightnessControl(),
      this.fullScreenButton,
      this.button('Quit', () => this.cb.onQuit()),
    );
    this.root.append(minimal, expanded);
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

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'overlay-btn';
    b.addEventListener('click', () => {
      onClick();
      this.poke();
    });
    return b;
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

  /** Reset the inactivity timer that auto-hides the overlay after 3s. */
  private poke(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  setCounter(spreadIndex: number, spreadCount: number): void {
    this.counter.textContent = `${spreadIndex + 1} / ${spreadCount}`;
  }
}
