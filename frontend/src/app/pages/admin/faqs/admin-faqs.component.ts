import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FaqService, Faq } from '../../../core/services/faq.service';

@Component({
  selector: 'app-admin-faqs',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  constructor(private faqSvc: FaqService) {}

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
      this.error.set('Category, question, and answer are required.');
      return;
    }
    const id = this.editingId();
    const op = id ? this.faqSvc.updateFaq(id, this.form) : this.faqSvc.createFaq(this.form);
    op.subscribe({
      next: () => { this.showNewForm.set(false); this.editingId.set(null); this.error.set(''); this.load(); },
      error: () => this.error.set('Could not save FAQ.')
    });
  }

  remove(faq: Faq): void {
    this.faqSvc.deleteFaq(faq.id).subscribe({
      next: () => this.faqs.update(list => list.filter(f => f.id !== faq.id)),
      error: () => this.error.set('Could not delete FAQ.')
    });
  }
}
