import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApplicationService } from '../../../core/services/application.service';
import { MandateRules } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

/** Approval Mandates — the maximum loan amount each role in the hierarchy
 * (UW -> Senior UW -> Head of Lending -> COO -> CEO) may approve without referring up.
 * Mirrors AdminRulesComponent's pattern exactly. */
@Component({
  selector: 'app-admin-mandates',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-mandates.component.html',
  styleUrl: './admin-mandates.component.scss'
})
export class AdminMandatesComponent implements OnInit {
  rules = signal<MandateRules | null>(null);
  loading = signal(true);
  saving = signal(false);
  saved = signal(false);
  error = signal('');

  constructor(private appSvc: ApplicationService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.appSvc.getMandateRules().subscribe({
      next: rules => { this.rules.set(rules); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.i18n.t('admin.errLoadRules')); }
    });
  }

  save(): void {
    const rules = this.rules();
    if (!rules) return;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    this.appSvc.updateMandateRules(rules).subscribe({
      next: updated => { this.rules.set(updated); this.saving.set(false); this.saved.set(true); },
      error: () => { this.saving.set(false); this.error.set(this.i18n.t('admin.errSaveRules')); }
    });
  }
}
