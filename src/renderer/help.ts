/**
 * Tap-zone help overlay. A full-screen labelled diagram showing what each region
 * of the screen does. Tapping anywhere dismisses it. Shown via the overlay help
 * button and once automatically on the first document open.
 */

export class HelpOverlay {
  private readonly root: HTMLElement;
  private readonly edgeZones: HTMLElement[] = [];
  private prevZone: HTMLElement | null = null;
  private centerZone: HTMLElement | null = null;
  private nextZone: HTMLElement | null = null;

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
    const leftEdge = this.zone('help-edge', 'Hold', 'Hold');
    const prev = this.zone('help-prev', '<', 'Previous');
    const center = this.zone('help-center', 'Menu', 'Tap for menu');
    const next = this.zone('help-next', '>', 'Next');
    const rightEdge = this.zone('help-edge', 'Hold', 'Hold');
    this.edgeZones.push(leftEdge, rightEdge);
    this.prevZone = prev;
    this.centerZone = center;
    this.nextZone = next;
    row.append(leftEdge, prev, center, next, rightEdge);
    return row;
  }

  private buildHints(): HTMLElement {
    const hints = document.createElement('div');
    hints.className = 'help-hints';

    const tips = document.createElement('div');
    tips.innerHTML =
      '<p>Swipe left/right to turn pages - Arrow keys or PageUp/PageDown also work</p>' +
      '<p>Tap the center for controls - Esc toggles full-screen - Tap anywhere to close</p>';

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
      e.stopPropagation();
      window.reader.openExternal('https://ko-fi.com/X3X4228M3H');
    });

    donatePara.append(coffeeLink, '. Not a subscription, just a one-time thanks.');
    donate.appendChild(donatePara);

    hints.append(tips, donate);
    return hints;
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setZones(tapZoneWidth: number, edgeDeadZone: number): void {
    const edge = Math.max(0, edgeDeadZone) * 100;
    const side = Math.max(0, tapZoneWidth - edgeDeadZone) * 100;
    const center = Math.max(0, 1 - tapZoneWidth * 2) * 100;
    for (const zone of this.edgeZones) zone.style.flex = `0 0 ${edge}%`;
    if (this.prevZone) this.prevZone.style.flex = `0 0 ${side}%`;
    if (this.nextZone) this.nextZone.style.flex = `0 0 ${side}%`;
    if (this.centerZone) this.centerZone.style.flex = `0 0 ${center}%`;
  }
}
