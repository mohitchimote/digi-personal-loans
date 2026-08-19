import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from '../services/api-base';
import { EN } from './en';
import { HE } from './he';

export type Lang = 'en' | 'he';

const DICTS: Record<Lang, Record<string, string>> = { en: EN, he: HE };
const STORAGE_KEY = 'db_lang';
// Mirrors AuthService's TOKEN_KEY — read directly rather than injecting AuthService to keep this
// a lean, low-level service with no dependency on the auth surface.
const TOKEN_KEY = 'db_token';

@Injectable({ providedIn: 'root' })
export class I18nService {
  lang = signal<Lang>(this.loadLang());

  constructor(private http: HttpClient) {
    this.applyDocumentDirection(this.lang());
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    this.applyDocumentDirection(lang);
    this.syncToServer(lang);
  }

  /** Server-generated content (notifications, etc.) has no other way to know which language to
   * write in — best-effort, since a logged-out visitor toggling language has nothing to sync yet. */
  private syncToServer(lang: Lang): void {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    this.http.put(`${API_BASE}/api/auth/language`, { preferredLanguage: lang }).subscribe({ error: () => {} });
  }

  toggle(): void {
    this.setLang(this.lang() === 'en' ? 'he' : 'en');
  }

  t(key: string, params?: Record<string, string | number>): string {
    const dict = DICTS[this.lang()];
    let text = dict[key] ?? EN[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{{${k}}}`, String(v));
      }
    }
    return text;
  }

  get isRtl(): boolean {
    return this.lang() === 'he';
  }

  private applyDocumentDirection(lang: Lang): void {
    document.documentElement.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
  }

  private loadLang(): Lang {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'he' ? 'he' : 'en';
  }
}
