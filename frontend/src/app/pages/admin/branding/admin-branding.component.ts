import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BrandingService, BrandingSettings } from '../../../core/services/branding.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-admin-branding',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-branding.component.html',
  styleUrl: './admin-branding.component.scss'
})
export class AdminBrandingComponent implements OnInit {
  settings = signal<BrandingSettings | null>(null);
  logoPreviewUrl = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  uploading = signal(false);
  saved = signal(false);
  error = signal('');

  constructor(private brandingSvc: BrandingService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.brandingSvc.getBranding().subscribe({
      next: settings => {
        this.settings.set(settings);
        this.logoPreviewUrl.set(this.brandingSvc.logoFullUrl(settings));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set(this.i18n.t('admin.errLoadBranding')); }
    });
  }

  save(): void {
    const settings = this.settings();
    if (!settings) return;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    this.brandingSvc.updateColors(settings.primaryColor, settings.accentColor).subscribe({
      next: updated => { this.settings.set(updated); this.saving.set(false); this.saved.set(true); },
      error: () => { this.saving.set(false); this.error.set(this.i18n.t('admin.errSaveBranding')); }
    });
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.error.set('');
    this.brandingSvc.uploadLogo(file).subscribe({
      next: updated => {
        this.settings.set(updated);
        this.logoPreviewUrl.set(this.brandingSvc.logoFullUrl(updated));
        this.uploading.set(false);
      },
      error: () => { this.uploading.set(false); this.error.set(this.i18n.t('admin.errUploadLogo')); }
    });
  }
}
