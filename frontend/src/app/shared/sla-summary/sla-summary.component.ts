import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SlaSummary, SlaUnit, WorkflowService } from '../../core/services/workflow.service';
import { TranslatePipe } from '../pipes/translate.pipe';

interface Row { unit: SlaUnit; depth: number; hasChildren: boolean }

/** Open cases by SLA state for each organisation unit, rolled up over the units beneath it, so
 * a manager can start at the top of their branch of the hierarchy and open the unit that is
 * breaching. Only counts cases the signed-in user may see. */
@Component({
  selector: 'app-sla-summary',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './sla-summary.component.html',
  styleUrl: './sla-summary.component.scss'
})
export class SlaSummaryComponent implements OnInit {
  private workflow = inject(WorkflowService);

  data = signal<SlaSummary | null>(null);
  open = signal(false);
  expanded = signal<Set<number>>(new Set());

  rows = computed<Row[]>(() => {
    const d = this.data();
    if (!d) return [];
    const ids = new Set(d.units.map(u => u.unitId));
    const children = new Map<number | null, SlaUnit[]>();
    for (const u of d.units) {
      // A unit whose parent is outside the caller's view is shown at the top.
      const key = u.parentId != null && ids.has(u.parentId) ? u.parentId : null;
      children.set(key, [...(children.get(key) ?? []), u]);
    }
    const out: Row[] = [];
    const walk = (parent: number | null, depth: number) => {
      for (const u of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
        const kids = children.get(u.unitId) ?? [];
        out.push({ unit: u, depth, hasChildren: kids.length > 0 });
        if (this.expanded().has(u.unitId)) walk(u.unitId, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  ngOnInit(): void {
    this.workflow.slaSummary().subscribe({ next: d => this.data.set(d), error: () => this.data.set(null) });
  }

  /** Breaches across the top-level units shown (their totals already include everything beneath). */
  totalRed(d: SlaSummary): number {
    const ids = new Set(d.units.map(u => u.unitId));
    return d.units.filter(u => u.parentId == null || !ids.has(u.parentId)).reduce((n, u) => n + u.total.red, 0);
  }

  toggle(id: number): void {
    this.expanded.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
}
