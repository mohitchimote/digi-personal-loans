import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE } from './api-base';

export interface BrandingSettings {
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
}

const API = `${API_BASE}/api`;

function shade(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const adjust = (channel: number) => {
    const target = percent < 0 ? 0 : 255;
    const value = channel + (target - channel) * Math.abs(percent);
    return Math.max(0, Math.min(255, Math.round(value)));
  };
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  constructor(private http: HttpClient) {}

  getBranding(): Observable<BrandingSettings> {
    return this.http.get<BrandingSettings>(`${API}/branding`);
  }

  updateColors(primaryColor: string, accentColor: string): Observable<BrandingSettings> {
    return this.http.put<BrandingSettings>(`${API}/auth/admin/branding`, { primaryColor, accentColor })
      .pipe(tap(settings => this.applyTheme(settings)));
  }

  uploadLogo(file: File): Observable<BrandingSettings> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<BrandingSettings>(`${API}/auth/admin/branding/logo`, formData)
      .pipe(tap(settings => this.applyTheme(settings)));
  }

  logoFullUrl(settings: BrandingSettings | null): string | null {
    if (!settings?.logoUrl) return null;
    return `${API_BASE}${settings.logoUrl}`;
  }

  applyTheme(settings: BrandingSettings): void {
    const root = document.documentElement.style;
    root.setProperty('--tcs-blue', settings.primaryColor);
    root.setProperty('--tcs-blue-dark', shade(settings.primaryColor, -0.25));
    root.setProperty('--tcs-blue-light', shade(settings.primaryColor, 0.25));
    root.setProperty('--tcs-yellow', settings.accentColor);
    root.setProperty('--tcs-yellow-dark', shade(settings.accentColor, -0.18));
  }

  loadAndApply(): void {
    this.getBranding().subscribe({
      next: settings => this.applyTheme(settings),
      error: () => {}
    });
  }
}
