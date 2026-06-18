import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FaqService, Faq } from '../../../core/services/faq.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

interface FaqItem { q: string; a: string; videoId?: string; open: boolean; }
interface FaqCategory { title: string; icon: string; items: FaqItem[]; }

const CATEGORY_ICONS: Record<string, string> = {
  'Loan Eligibility': 'check_circle',
  'Application Process': 'assignment',
  'Interest Rates & Repayments': 'payments',
  'Credit & Affordability': 'bar_chart',
  'Security & Privacy': 'lock',
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
      title, icon: CATEGORY_ICONS[title] || 'help_outline', items
    }));
  }

  toggle(cat: FaqCategory, item: FaqItem): void {
    item.open = !item.open;
  }

  openCount(cat: FaqCategory): number { return cat.items.filter(i => i.open).length; }
}
