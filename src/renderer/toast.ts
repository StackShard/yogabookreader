/**
 * Lightweight feedback: a persistent status pill (for ongoing work like
 * "Analyzing pages…" / "Generating covers…") and transient toasts (for one-off
 * messages). Both are created lazily and positioned at the top so they don't
 * collide with the bottom control bar.
 */

let statusEl: HTMLElement | null = null;
let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function ensureStatus(): HTMLElement {
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'status hidden';
    document.body.appendChild(statusEl);
  }
  return statusEl;
}

/** Show a persistent status message, or clear it with null. */
export function setStatus(message: string | null): void {
  const el = ensureStatus();
  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

/** Show a transient toast that auto-dismisses. */
export function toast(message: string, ms = 2500): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast hidden';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl?.classList.add('hidden'), ms);
}
