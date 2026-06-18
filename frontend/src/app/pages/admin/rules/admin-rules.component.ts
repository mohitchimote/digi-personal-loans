import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AffordabilityRulesService, AffordabilityRules } from '../../../core/services/affordability-rules.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-admin-rules',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-rules.component.html',
  styleUrl: './admin-rules.component.scss'
})
export class AdminRulesComponent implements OnInit {
  rules = signal<AffordabilityRules | null>(null);
  loading = signal(true);
  saving = signal(false);
  saved = signal(false);
  error = signal('');

  constructor(private rulesSvc: AffordabilityRulesService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.rulesSvc.getRules().subscribe({
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
    this.rulesSvc.updateRules(rules).subscribe({
      next: updated => { this.rules.set(updated); this.saving.set(false); this.saved.set(true); },
      error: () => { this.saving.set(false); this.error.set(this.i18n.t('admin.errSaveRules')); }
    });
  }
}
