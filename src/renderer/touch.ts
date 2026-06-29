/**
 * Touch, swipe & keyboard navigation (PRD §Touch Navigation, US#3/#4/#5/#6/#10).
 *
 * Splits each screen into left/center/right zones (default 40/20/40). Tapping a
 * side turns the page; tapping the centre dead zone reveals the overlay and never
 * turns a page (so holding the bezel is safe). Horizontal swipes are a secondary
 * gesture; arrow/PageUp/PageDown work when a keyboard cover is attached.
 *
 * Additional gestures:
 *  - Double-tap in the centre zone: cycle zoom preset
 *  - Long-press (600 ms) in a side tap zone: jump to first / last page
 */

export interface NavCallbacks {
  onNext(): void;
  onPrev(): void;
  onCenter(): void;
  /** Centre-zone double-tap: cycle zoom preset. */
  onDoubleTap?(): void;
  /** Long-press in the left tap zone: jump to first page. */
  onLongPrev?(): void;
  /** Long-press in the right tap zone: jump to last page. */
  onLongNext?(): void;
}

export interface TouchOptions {
  /** Fraction of width for each side zone (0–0.5). Centre is the remainder. */
  tapZoneWidth: number;
  /** Fraction of width on each outer edge where taps are ignored (grip safety). */
  edgeDeadZone: number;
}

const SWIPE_THRESHOLD_PX = 60;
const TAP_MOVE_TOLERANCE_PX = 12;
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 600;

export function attachNavigation(
  el: HTMLElement,
  cb: NavCallbacks,
  opts: TouchOptions,
): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let lastTapTime = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressConsumed = false;

  const cancelLongPress = (): void => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const onPointerDown = (e: PointerEvent): void => {
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
    longPressConsumed = false;

    // Start long-press timer if pointer lands in a side tap zone.
    const fraction = e.clientX / el.clientWidth;
    const { edgeDeadZone: edge, tapZoneWidth: side } = opts;
    if (fraction >= edge && fraction < side) {
      longPressTimer = setTimeout(() => {
        longPressConsumed = true;
        cb.onLongPrev?.();
      }, LONG_PRESS_MS);
    } else if (fraction > 1 - side && fraction <= 1 - edge) {
      longPressTimer = setTimeout(() => {
        longPressConsumed = true;
        cb.onLongNext?.();
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!tracking) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Any meaningful movement cancels long-press.
    if (Math.abs(dx) > TAP_MOVE_TOLERANCE_PX || Math.abs(dy) > TAP_MOVE_TOLERANCE_PX) {
      cancelLongPress();
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!tracking) return;
    tracking = false;
    cancelLongPress();

    if (longPressConsumed) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Horizontal swipe beats tap classification.
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) cb.onNext();
      else cb.onPrev();
      lastTapTime = 0;
      return;
    }

    // Otherwise treat near-stationary release as a tap in a zone.
    if (Math.abs(dx) <= TAP_MOVE_TOLERANCE_PX && Math.abs(dy) <= TAP_MOVE_TOLERANCE_PX) {
      const fraction = e.clientX / el.clientWidth;
      const { edgeDeadZone: edge, tapZoneWidth: side } = opts;
      // Ignore taps in the outer grip margin so holding the bezel is safe.
      if (fraction < edge || fraction > 1 - edge) {
        lastTapTime = 0;
        return;
      }

      const now = Date.now();
      const dt = now - lastTapTime;
      const isCenterZone = fraction >= side && fraction <= 1 - side;

      // Double-tap in the centre zone → cycle zoom.
      if (cb.onDoubleTap && isCenterZone && dt < DOUBLE_TAP_MS) {
        cb.onDoubleTap();
        lastTapTime = 0;
        return;
      }

      lastTapTime = now;

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
      case 'Home':
        cb.onLongPrev?.();
        break;
      case 'End':
        cb.onLongNext?.();
        break;
    }
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
  };
}
