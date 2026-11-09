import { Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { EligibleStaff, WorkflowService } from '../../core/services/workflow.service';
import { CaseWorkflowInfo } from '../../core/models';
import { TranslatePipe } from '../pipes/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';

/** Who owns a case, which stage it is in and how its SLA clock stands, with claim / release /
 * assign. The stage, owning roles and SLA all come from the workflow definition; the server
 * decides who may do what, this only shows the buttons that can plausibly work. */
@Component({
  selector: 'app-case-ownership',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './case-ownership.component.html',
  styleUrl: './case-ownership.component.scss'
})
export class CaseOwnershipComponent implements OnChanges {
  @Input({ required: true }) appRef = '';
  /** Change this (e.g. to the case's status) to make the strip reload after the case has moved. */
  @Input() refreshKey: unknown = null;

  private workflow = inject(WorkflowService);
  private auth = inject(AuthService);
  private i18n = inject(I18nService);

  info = signal<CaseWorkflowInfo | null>(null);
  busy = signal(false);
  error = signal('');
  eligible = signal<EligibleStaff[]>([]);
  assigning = signal(false);
  pick = '';

  canAssign = computed(() => !!this.auth.currentUser()?.entitlements?.includes('case.assign'));
  isMine = computed(() => this.info()?.assigneeUserId != null && this.info()!.assigneeUserId === this.auth.userId);
  stageName = computed(() => {
    const l = this.info()?.stageLabel;
    return l ? l[this.i18n.lang()] : '—';
  });

  ngOnChanges(): void { if (this.appRef) this.load(); }

  private load(): void {
    this.workflow.caseState(this.appRef).subscribe({ next: i => this.info.set(i), error: () => this.info.set(null) });
  }

  private run(call: ReturnType<WorkflowService['claim']>): void {
    this.busy.set(true); this.error.set('');
    call.subscribe({
      next: i => { this.info.set(i); this.busy.set(false); this.assigning.set(false); },
      error: e => { this.busy.set(false); this.error.set(e?.error?.message || this.i18n.t('own.error')); },
    });
  }

  claim(): void { this.run(this.workflow.claim(this.appRef)); }
  release(): void { this.run(this.workflow.release(this.appRef)); }

  openAssign(): void {
    this.assigning.set(true); this.error.set('');
    this.workflow.eligible(this.appRef).subscribe({
      next: list => { this.eligible.set(list); this.pick = ''; },
      error: e => { this.assigning.set(false); this.error.set(e?.error?.message || this.i18n.t('own.error')); },
    });
  }

  assign(): void { if (this.pick) this.run(this.workflow.assign(this.appRef, Number(this.pick))); }

  slaText(i: CaseWorkflowInfo): string {
    return `${this.i18n.t('own.sla.' + i.sla.state)}${i.sla.percentUsed != null ? ` · ${i.sla.percentUsed}%` : ''}`;
  }
}
