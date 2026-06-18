import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FaqService, Faq } from '../../../core/services/faq.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-admin-faqs',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-faqs.component.html',
  styleUrl: './admin-faqs.component.scss'
})
export class AdminFaqsComponent implements OnInit {
  faqs = signal<Faq[]>([]);
  loading = signal(true);
  error = signal('');
  editingId = signal<number | null>(null);

  form: Partial<Faq> = { category: '', question: '', answer: '', videoId: '', displayOrder: 1 };
  showNewForm = signal(false);

  constructor(private faqSvc: FaqService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.faqSvc.getFaqs().subscribe({
      next: faqs => { this.faqs.set(faqs); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  startNew(): void {
    this.form = { category: '', question: '', answer: '', videoId: '', displayOrder: 1 };
    this.editingId.set(null);
    this.showNewForm.set(true);
  }

  startEdit(faq: Faq): void {
    this.form = { ...faq };
    this.editingId.set(faq.id);
    this.showNewForm.set(true);
  }

  cancel(): void {
    this.showNewForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.form.category?.trim() || !this.form.question?.trim() || !this.form.answer?.trim()) {
      this.error.set(this.i18n.t('admin.faqValidation'));
      return;
    }
    const id = this.editingId();
    const op = id ? this.faqSvc.updateFaq(id, this.form) : this.faqSvc.createFaq(this.form);
    op.subscribe({
      next: () => { this.showNewForm.set(false); this.editingId.set(null); this.error.set(''); this.load(); },
      error: () => this.error.set(this.i18n.t('admin.errSaveFaq'))
    });
  }

  remove(faq: Faq): void {
    this.faqSvc.deleteFaq(faq.id).subscribe({
      next: () => this.faqs.update(list => list.filter(f => f.id !== faq.id)),
      error: () => this.error.set(this.i18n.t('admin.errDeleteFaq'))
    });
  }
}
