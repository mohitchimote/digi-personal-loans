import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FaqService, Faq } from '../../../core/services/faq.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

interface FaqItem { q: string; a: string; videoId?: string; open: boolean; }
interface FaqCategory { title: string; icon: string; items: FaqItem[]; }

const CATEGORY_ICONS: Record<string, string> = {
  'Loan Eligibility': '✓',
  'Application Process': '📋',
  'Interest Rates & Repayments': '₪',
  'Credit & Affordability': '📊',
  'Security & Privacy': '🔒',
};

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss'
})
export class FaqComponent implements OnInit {
  categories = signal<FaqCategory[]>([]);
  loading = signal(true);

  constructor(private faqSvc: FaqService) {}

  ngOnInit(): void {
    this.faqSvc.getFaqs().subscribe({
      next: faqs => { this.categories.set(this.groupByCategory(faqs)); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private groupByCategory(faqs: Faq[]): FaqCategory[] {
    const map = new Map<string, FaqItem[]>();
    for (const f of faqs) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push({ q: f.question, a: f.answer, videoId: f.videoId, open: false });
    }
    return Array.from(map.entries()).map(([title, items]) => ({
      title, icon: CATEGORY_ICONS[title] || '❓', items
    }));
  }

  toggle(cat: FaqCategory, item: FaqItem): void {
    item.open = !item.open;
  }

  openCount(cat: FaqCategory): number { return cat.items.filter(i => i.open).length; }
}
