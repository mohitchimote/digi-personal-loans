import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApplicationService } from '../../core/services/application.service';
import { LoanApplication, StaffActivityItem } from '../../core/models';
import { TranslatePipe } from '../pipes/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { applicantDisplayName, applicationLoanAmount } from '../../core/utils/application-display';

interface Tile {
  key: string;
  labelKey: string;
  count: number;
  amount: number;
  /** Status value to deep-link to on the Pipeline/Queue page's filter, or null for a tile that
   * has no status-list equivalent (e.g. Action Items — scrolls to the panel on this same page). */
  filterValue: string | null;
}

const ACTION_ITEM_TYPES = ['CLARIFICATION_REQUEST', 'DOCUMENT_REQUEST', 'SEND_BACK'];

/** Shared Home landing page for the underwriter and banker shells — stat tiles (count + £ total
 * per bucket), pending action items, and a recent-activity feed. Both roles hit the same
 * role-aware /home-stats and /staff-activity endpoints; only the tile set and the Create Case
 * button differ, controlled by `isBanker`. */
@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './staff-dashboard.component.html',
  styleUrl: './staff-dashboard.component.scss'
})
export class StaffDashboardComponent implements OnInit {
  @Input() caseDetailBasePath = '/underwriter/case';
  @Input() createCaseRoute: string | null = null;

  loading = signal(true);
  loadedAt = signal(new Date());
  apps = signal<LoanApplication[]>([]);
  activity = signal<StaffActivityItem[]>([]);
  showLastAccessedToast = signal(false);

  private static readonly TOAST_DURATION_MS = 6000;

  constructor(public auth: AuthService, private appSvc: ApplicationService, public i18n: I18nService, private route: ActivatedRoute, private router: Router) {}

  get isBanker(): boolean {
    return this.auth.role === 'BANKER';
  }

  get caseListRoute(): string {
    return this.isBanker ? '/banker/queue' : '/underwriter/pipeline';
  }

  goToTile(tile: Tile): void {
    if (tile.filterValue === null) {
      document.getElementById('action-items-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    this.router.navigate([this.caseListRoute], { queryParams: { status: tile.filterValue } });
  }

  ngOnInit(): void {
    const data = this.route.snapshot.data;
    if (data['caseDetailBasePath']) this.caseDetailBasePath = data['caseDetailBasePath'];
    if (data['createCaseRoute']) this.createCaseRoute = data['createCaseRoute'];
    if (this.auth.previousLogin && !this.auth.lastAccessedToastShown) {
      this.auth.lastAccessedToastShown = true;
      this.showLastAccessedToast.set(true);
      setTimeout(() => this.showLastAccessedToast.set(false), StaffDashboardComponent.TOAST_DURATION_MS);
    }
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.appSvc.getHomeStats().subscribe({
      next: apps => { this.apps.set(apps); this.loadedAt.set(new Date()); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.appSvc.getStaffActivity().subscribe({ next: items => this.activity.set(items), error: () => {} });
  }

  private byStatus(status: string, extra?: (a: LoanApplication) => boolean): LoanApplication[] {
    return this.apps().filter(a => a.status === status && (!extra || extra(a)));
  }

  private toTile(key: string, labelKey: string, list: LoanApplication[], filterValue: string | null): Tile {
    return { key, labelKey, count: list.length, amount: list.reduce((sum, a) => sum + applicationLoanAmount(a), 0), filterValue };
  }

  tiles = computed<Tile[]>(() => {
    const list: Tile[] = [];
    if (this.isBanker) {
      list.push(this.toTile('draft', 'staffHome.tile.draft', [
        ...this.byStatus('DRAFT'), ...this.byStatus('IN_PROGRESS'),
      ], 'DRAFT_IN_PROGRESS'));
    }
    list.push(this.toTile('submitted', 'staffHome.tile.submitted', this.byStatus('SUBMITTED'), 'SUBMITTED'));
    list.push(this.toTile('underReview', 'staffHome.tile.underReview', this.byStatus('UNDER_REVIEW'), 'UNDER_REVIEW'));
    list.push(this.toTile('conditionallyApproved', 'staffHome.tile.conditionallyApproved', this.byStatus('CONDITIONALLY_APPROVED'), 'CONDITIONALLY_APPROVED'));
    list.push(this.toTile('referredSenior', 'staffHome.tile.referredSenior', this.byStatus('REFERRED_TO_SENIOR'), 'REFERRED_TO_SENIOR'));
    list.push(this.toTile('actionItems', 'staffHome.tile.actionItems', this.actionItemApps(), null));
    list.push(this.toTile('approved', 'staffHome.tile.approved', this.byStatus('APPROVED', a => !a.disbursementStatus), 'APPROVED'));
    list.push(this.toTile('declined', 'staffHome.tile.declined', this.byStatus('DECLINED'), 'DECLINED'));
    list.push(this.toTile('pendingDisbursement', 'staffHome.tile.pendingDisbursement', this.byStatus('APPROVED', a => a.disbursementStatus === 'SECOND_CHECK_PENDING'), 'PENDING_DISBURSEMENT'));
    list.push(this.toTile('disbursed', 'staffHome.tile.disbursed', this.apps().filter(a => a.disbursementStatus === 'FUNDS_RELEASED'), 'DISBURSED'));
    return list;
  });

  private actionItemApps(): LoanApplication[] {
    const refs = new Set(
      this.activity()
        .filter(a => ACTION_ITEM_TYPES.includes(a.noteType) && a.applicationStatus === 'IN_PROGRESS')
        .map(a => a.applicationRef)
    );
    return this.apps().filter(a => refs.has(a.applicationRef));
  }

  actionItems = computed<StaffActivityItem[]>(() =>
    this.activity()
      .filter(a => ACTION_ITEM_TYPES.includes(a.noteType) && a.applicationStatus === 'IN_PROGRESS')
      .slice(0, 10)
  );

  recentActivity = computed<StaffActivityItem[]>(() => this.activity().slice(0, 10));

  applicantName(item: StaffActivityItem): string {
    return applicantDisplayName(item);
  }

  noteTypeLabel(noteType: string): string {
    return this.i18n.t('noteType.' + noteType);
  }
}
