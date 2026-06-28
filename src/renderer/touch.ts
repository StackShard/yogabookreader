/**
 * Touch, swipe & keyboard navigation (PRD §Touch Navigation, US#3/#4/#5/#6/#10).
 *
 * Splits each screen into left/center/right zones (default 40/20/40). Tapping a
 * side turns the page; tapping the centre dead zone reveals the overlay and never
 * turns a page (so holding the bezel is safe). Horizontal swipes are a secondary
 * gesture; arrow/PageUp/PageDown work when a keyboard cover is attached.
 */

export interface NavCallbacks {
  onNext(): void;
  onPrev(): void;
  onCenter(): void;
}

export interface TouchOptions {
  /** Fraction of width for each side zone (0–0.5). Centre is the remainder. */
  tapZoneWidth: number;
  /** Fraction of width on each outer edge where taps are ignored (grip safety). */
  edgeDeadZone: number;
}

const SWIPE_THRESHOLD_PX = 60;
const TAP_MOVE_TOLERANCE_PX = 12;

export function attachNavigation(
  el: HTMLElement,
  cb: NavCallbacks,
  opts: TouchOptions,
): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onPointerDown = (e: PointerEvent): void => {
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Horizontal swipe beats tap classification.
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) cb.onNext();
      else cb.onPrev();
      return;
    }

    // Otherwise treat near-stationary release as a tap in a zone.
    if (Math.abs(dx) <= TAP_MOVE_TOLERANCE_PX && Math.abs(dy) <= TAP_MOVE_TOLERANCE_PX) {
      const fraction = e.clientX / el.clientWidth;
      const edge = opts.edgeDeadZone;
      // Ignore taps in the outer grip margin so holding the bezel is safe.
      if (fraction < edge || fraction > 1 - edge) return;
      const side = opts.tapZoneWidth;
      if (fraction < side) cb.onPrev();
      else if (fraction > 1 - side) cb.onNext();
      else cb.onCenter();
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        cb.onNext();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        cb.onPrev();
        break;
      case ' ':
        cb.onNext();
        break;
    }
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
  };
}
