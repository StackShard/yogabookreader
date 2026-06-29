/**
 * Tap-zone help overlay. A full-screen labelled diagram showing what each region
 * of the screen does (previous / menu / next, with held edges). Tapping anywhere
 * dismisses it. Shown via the overlay's "?" button and once automatically on the
 * first document open.
 */

export class HelpOverlay {
  private readonly root: HTMLElement;

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
    row.append(
      this.zone('help-edge', '⟂', 'Hold'),
      this.zone('help-prev', '‹', 'Previous'),
      this.zone('help-center', '☰', 'Tap for menu'),
      this.zone('help-next', '›', 'Next'),
      this.zone('help-edge', '⟂', 'Hold'),
    );
    return row;
  }

  private buildHints(): HTMLElement {
    const hints = document.createElement('div');
    hints.className = 'help-hints';

    const tips = document.createElement('div');
    tips.innerHTML =
      '<p>Swipe left/right to turn pages · Arrow keys or PageUp/PageDown also work</p>' +
      '<p>Tap the centre for controls · Esc toggles full-screen · Tap anywhere to close</p>';

    const donate = document.createElement('div');
    donate.className = 'help-donate';
    donate.innerHTML =
      '<p>If this makes you happy, consider buying me a coffee. Not a subscription, just a one-time thanks.</p>';

    const kofiLink = document.createElement('a');
    kofiLink.href = '#';
    kofiLink.className = 'help-kofi';
    kofiLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't dismiss help on this tap
      window.reader.openExternal('https://ko-fi.com/X3X4228M3H');
    });

    const kofiImg = document.createElement('img');
    kofiImg.src = 'https://ko-fi.com/img/githubbutton_sm.svg';
    kofiImg.alt = 'Support on Ko-fi';
    kofiLink.appendChild(kofiImg);
    donate.appendChild(kofiLink);

    hints.append(tips, donate);
    return hints;
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
