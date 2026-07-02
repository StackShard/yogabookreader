/**
 * Tap-zone help overlay. A full-screen labelled diagram showing what each region
 * of the screen does (previous / menu / next, with held edges). Tapping anywhere
 * dismisses it. Shown via the overlay's "?" button and once automatically on the
 * first document open.
 */

export class HelpOverlay {
  private readonly root: HTMLElement;
  private leftZoneLabel: HTMLElement | null = null;
  private rightZoneLabel: HTMLElement | null = null;

  /** `onDismiss` is called on tap; the actual hide is driven externally so a tap
   *  on either screen can close the help on both. */
  constructor(private readonly onDismiss: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'help hidden';
    this.root.append(this.buildZones(), this.buildHints());
    this.root.addEventListener('click', () => this.onDismiss());
    document.body.appendChild(this.root);
  }

  private zone(className: string, glyph: string, label: string): HTMLElement {
    const z = document.createElement('div');
    z.className = `help-zone ${className}`;
    const g = document.createElement('div');
    g.className = 'help-glyph';
    g.textContent = glyph;
    const l = document.createElement('div');
    l.className = 'help-label';
    l.textContent = label;
    z.append(g, l);
    return z;
  }

  private buildZones(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'help-zones';
    const left = this.zone('help-prev', '‹', 'Previous');
    const right = this.zone('help-next', '›', 'Next');
    this.leftZoneLabel = left.querySelector('.help-label');
    this.rightZoneLabel = right.querySelector('.help-label');
    row.append(
      this.zone('help-edge', '⟂', 'Hold'),
      left,
      this.zone('help-center', '☰', 'Tap for menu'),
      right,
      this.zone('help-edge', '⟂', 'Hold'),
    );
    return row;
  }

  /** The tap edges swap in RTL mode; keep the diagram truthful. */
  setDirection(direction: 'ltr' | 'rtl'): void {
    if (!this.leftZoneLabel || !this.rightZoneLabel) return;
    this.leftZoneLabel.textContent = direction === 'rtl' ? 'Next' : 'Previous';
    this.rightZoneLabel.textContent = direction === 'rtl' ? 'Previous' : 'Next';
  }

  isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private buildHints(): HTMLElement {
    const hints = document.createElement('div');
    hints.className = 'help-hints';

    const tips = document.createElement('div');
    tips.innerHTML =
      '<p>Swipe left/right to turn pages · Arrow keys or PageUp/PageDown also work</p>' +
      '<p>Tap the centre to show/hide controls · F or F11 toggles full-screen · Tap anywhere to close</p>';

    const donate = document.createElement('div');
    donate.className = 'help-donate';

    const donatePara = document.createElement('p');
    donatePara.append('If this makes you happy, consider ');

    const coffeeLink = document.createElement('a');
    coffeeLink.href = '#';
    coffeeLink.className = 'help-kofi';
    coffeeLink.textContent = 'buying me a coffee';
    coffeeLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't dismiss help on this tap
      window.reader.openExternal('https://ko-fi.com/X3X4228M3H');
    });

    donatePara.append(coffeeLink, '. Not a subscription, just a one-time thanks.');
    donate.appendChild(donatePara);

    const version = document.createElement('p');
    version.className = 'help-version';
    void window.reader.getAppInfo().then((info) => {
      version.textContent = `Yoga Book Reader v${info.version} (build ${info.commit})`;
    });

    hints.append(tips, donate, version);
    return hints;
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
