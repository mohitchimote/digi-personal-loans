import { Injectable, signal } from '@angular/core';

/** Recovers from a stuck browser connection to the API origin.
 *
 * Root cause this defends against: real-world testing showed the browser can open a TCP
 * connection to the API that gets silently wedged after the handshake — no error, no close,
 * just permanent silence. Because modern browsers reuse/multiplex connections per origin, one
 * wedged connection can freeze every subsequent request on the page. Retrying the request on the
 * same connection pool does not help (proven empirically — the retry hangs identically). The only
 * thing that reliably recovers is abandoning the page's connections entirely via a reload, which
 * forces the browser to open fresh ones.
 */
const STUCK_AFTER_MS = 6000;
const RELOAD_AFTER_MS = 12000;
const MAX_AUTO_RELOADS_PER_SESSION = 2;
const RELOAD_COUNT_KEY = 'db-watchdog-reload-count';

@Injectable({ providedIn: 'root' })
export class ConnectionWatchdogService {
  private pending = new Map<number, number>();
  private nextId = 0;
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  readonly stuck = signal(false);
  readonly reloading = signal(false);

  start(): number {
    const id = ++this.nextId;
    this.pending.set(id, Date.now());
    if (!this.checkTimer) {
      this.checkTimer = setInterval(() => this.check(), 1000);
    }
    return id;
  }

  finish(id: number): void {
    this.pending.delete(id);
    if (this.pending.size === 0) {
      this.reset();
    }
  }

  reloadNow(): void {
    window.location.reload();
  }

  private check(): void {
    if (this.pending.size === 0) {
      this.reset();
      return;
    }
    const oldestStart = Math.min(...this.pending.values());
    const elapsed = Date.now() - oldestStart;
    if (elapsed >= STUCK_AFTER_MS) {
      this.stuck.set(true);
    }
    if (elapsed >= RELOAD_AFTER_MS && !this.reloading()) {
      this.maybeAutoReload();
    }
  }

  private maybeAutoReload(): void {
    const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? '0');
    if (count >= MAX_AUTO_RELOADS_PER_SESSION) return;
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
    this.reloading.set(true);
    setTimeout(() => this.reloadNow(), 800);
  }

  private reset(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.stuck.set(false);
    this.reloading.set(false);
  }
}
