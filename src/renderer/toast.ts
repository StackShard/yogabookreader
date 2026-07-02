/**
 * Lightweight feedback: a persistent status pill (for ongoing work like
 * "Analyzing pages…" / "Generating covers…"), a determinate progress bar
 * used by long-running main-process operations, and transient toasts (for
 * one-off messages). All are created lazily and positioned at the top so
 * they don't collide with the bottom control bar.
 */

let statusEl: HTMLElement | null = null;
let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let progressEl: HTMLElement | null = null;
let progressBarEl: HTMLElement | null = null;
let progressTextEl: HTMLElement | null = null;

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

function ensureProgress(): HTMLElement {
  if (!progressEl) {
    progressEl = document.createElement('div');
    progressEl.className = 'progress hidden';

    progressTextEl = document.createElement('span');
    progressTextEl.className = 'progress-text';
    progressEl.appendChild(progressTextEl);

    const outer = document.createElement('div');
    outer.className = 'progress-bar-outer';
    progressBarEl = document.createElement('div');
    progressBarEl.className = 'progress-bar-inner';
    outer.appendChild(progressBarEl);
    progressEl.appendChild(outer);

    document.body.appendChild(progressEl);
  }
  return progressEl;
}

/**
 * Show a determinate progress bar. `total === 0` means indeterminate (the bar
 * pulses instead). Call with `current >= total` (and total > 0) to hide it.
 */
export function setProgress(current: number, total: number, message?: string): void {
  const el = ensureProgress();
  if (total > 0 && current >= total) {
    el.classList.add('hidden');
    return;
  }
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  if (progressTextEl) {
    progressTextEl.textContent = message ?? (total > 0 ? `${current} / ${total}` : '');
  }
  if (progressBarEl) {
    if (total === 0) {
      progressBarEl.style.width = '100%';
      progressBarEl.classList.add('indeterminate');
    } else {
      progressBarEl.classList.remove('indeterminate');
      progressBarEl.style.width = `${pct}%`;
    }
  }
  el.classList.remove('hidden');
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
