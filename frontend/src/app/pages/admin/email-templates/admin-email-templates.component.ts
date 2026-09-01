import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import {
  EmailTemplateService,
  EmailTemplate,
  EmailEventMeta,
  EmailTemplateDraft
} from '../../../core/services/email-template.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

type EditableField = 'subject' | 'headerContent' | 'bodyContent' | 'signature' | 'footer';

@Component({
  selector: 'app-admin-email-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-email-templates.component.html',
  styleUrl: './admin-email-templates.component.scss'
})
export class AdminEmailTemplatesComponent implements OnInit {
  events = signal<EmailEventMeta[]>([]);
  templates = signal<EmailTemplate[]>([]);
  loading = signal(true);
  error = signal('');
  saving = signal(false);
  saved = signal(false);
  previewLoading = signal(false);
  previewHtml = signal<SafeHtml | null>(null);
  testSending = signal(false);
  testMessage = signal('');
  testError = signal(false);
  selectedEventKey = signal<string | null>(null);

  form: Partial<EmailTemplate> = {};

  private lastFocusedField: EditableField | null = null;
  private lastFocusedEl: HTMLTextAreaElement | HTMLInputElement | null = null;

  selectedEvent = computed<EmailEventMeta | null>(() => {
    const key = this.selectedEventKey();
    return this.events().find(e => e.eventKey === key) ?? null;
  });

  constructor(
    private svc: EmailTemplateService,
    private i18n: I18nService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    forkJoin([this.svc.getEvents(), this.svc.getTemplates()]).subscribe({
      next: ([events, templates]) => {
        this.events.set(events);
        this.templates.set(templates);
        this.loading.set(false);
        if (events.length) this.selectEvent(events[0].eventKey);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.i18n.t('admin.errLoadEmailTemplates'));
      }
    });
  }

  selectEvent(eventKey: string): void {
    const template = this.templates().find(t => t.eventKey === eventKey);
    this.selectedEventKey.set(eventKey);
    this.form = template ? { ...template } : {};
    this.previewHtml.set(null);
    this.testMessage.set('');
    this.error.set('');
    this.saved.set(false);
  }

  setFocus(field: EditableField, el: HTMLTextAreaElement | HTMLInputElement): void {
    this.lastFocusedField = field;
    this.lastFocusedEl = el;
  }

  insertVariable(name: string): void {
    const field = this.lastFocusedField ?? 'bodyContent';
    const el = this.lastFocusedEl;
    const token = `{{${name}}}`;
    const current = (this.form[field] as string) ?? '';

    if (el && el.selectionStart != null) {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      const next = current.slice(0, start) + token + current.slice(end);
      (this.form as any)[field] = next;
      const cursor = start + token.length;
      setTimeout(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
    } else {
      (this.form as any)[field] = current + token;
    }
  }

  save(): void {
    const key = this.selectedEventKey();
    if (!key) return;
    if (!this.form.subject?.trim() || !this.form.bodyContent?.trim()) {
      this.error.set(this.i18n.t('admin.emailTemplateValidation'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.saved.set(false);
    this.svc.updateTemplate(key, { ...this.form, enabled: !!this.form.enabled }).subscribe({
      next: (updated) => {
        this.templates.update(list => list.map(t => (t.eventKey === key ? updated : t)));
        this.form = { ...updated };
        this.saving.set(false);
        this.saved.set(true);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || this.i18n.t('admin.errSaveEmailTemplate'));
      }
    });
  }

  refreshPreview(): void {
    const key = this.selectedEventKey();
    if (!key) return;
    this.previewLoading.set(true);
    this.svc.preview(key, this.draftPayload()).subscribe({
      next: (res) => {
        this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(res.html));
        this.previewLoading.set(false);
      },
      error: () => {
        this.previewLoading.set(false);
        this.error.set(this.i18n.t('admin.errPreviewEmailTemplate'));
      }
    });
  }

  sendTest(): void {
    const key = this.selectedEventKey();
    if (!key) return;
    this.testSending.set(true);
    this.testMessage.set('');
    this.testError.set(false);
    this.svc.sendTest(key, this.draftPayload()).subscribe({
      next: (res) => {
        this.testSending.set(false);
        this.testMessage.set(res.message);
        this.testError.set(false);
      },
      error: (err) => {
        this.testSending.set(false);
        this.testMessage.set(err?.error?.message || this.i18n.t('admin.errTestEmailTemplate'));
        this.testError.set(true);
      }
    });
  }

  private draftPayload(): EmailTemplateDraft {
    return {
      subject: this.form.subject,
      headerContent: this.form.headerContent,
      bodyContent: this.form.bodyContent,
      signature: this.form.signature,
      footer: this.form.footer,
      ccAddress: this.form.ccAddress
    };
  }
}
