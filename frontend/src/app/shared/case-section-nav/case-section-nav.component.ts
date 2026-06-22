import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../pipes/translate.pipe';

export interface CaseNavItem { key: string; labelKey: string; }

/** Staff-facing left navigation for a single case (Underwriter / Banker case-detail) — a flat
 * top item, a collapsible group of the application's sections, a flat bottom item, and a couple
 * of inert placeholder rows for features not built yet (Query / Customer Worklist). Mirrors the
 * look of a reference staff-tool screenshot the user supplied: light background, grouped middle
 * section, active item highlighted solid blue. */
@Component({
  selector: 'app-case-section-nav',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './case-section-nav.component.html',
  styleUrl: './case-section-nav.component.scss'
})
export class CaseSectionNavComponent {
  @Input() topItems: CaseNavItem[] = [];
  @Input() groupLabelKey = 'caseNav.applicationDetails';
  @Input() groupItems: CaseNavItem[] = [];
  @Input() bottomItems: CaseNavItem[] = [];
  @Input() placeholderLabelKeys: string[] = [];
  @Input() activeKey: string | null = null;
  @Output() selectItem = new EventEmitter<string>();

  groupExpanded = signal(true);

  toggleGroup(): void {
    this.groupExpanded.update(v => !v);
  }
}
