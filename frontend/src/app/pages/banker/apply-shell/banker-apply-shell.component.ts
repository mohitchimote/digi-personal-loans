import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AssistContextService } from '../../../core/services/assist-context.service';
import { LoanApplication } from '../../../core/models';
import { PERSONAL_CASE_SECTIONS, BUSINESS_CASE_SECTIONS, CaseSectionDef } from '../../../shared/case-section-nav/case-sections.const';
import { CaseSectionNavComponent } from '../../../shared/case-section-nav/case-section-nav.component';

/** Wraps the real customer wizard step components (LoanRequirementsComponent,
 * PersonalDetailsComponent, etc. — loaded as ordinary child routes below this shell) with the
 * Banker's left case-nav sidebar. AssistContextService is started by assistContextResolver
 * (attached to this route) rather than here — a resolver blocks route activation until it
 * completes, guaranteeing the assist context is populated before any child wizard step's
 * ngOnInit runs; starting it from this component's own ngOnInit raced the child's ngOnInit and
 * lost in testing (EffectiveIdentityService silently fell back to the Banker's own identity).
 * The wizard components themselves are completely unaware this shell exists. */
@Component({
  selector: 'app-banker-apply-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, CaseSectionNavComponent],
  templateUrl: './banker-apply-shell.component.html',
  styleUrl: './banker-apply-shell.component.scss'
})
export class BankerApplyShellComponent implements OnInit, OnDestroy {
  application = signal<LoanApplication | null>(null);
  activeKey = signal<string | null>(null);
  private appRef = '';
  private navSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private assist: AssistContextService
  ) {}

  ngOnInit(): void {
    this.appRef = this.route.snapshot.paramMap.get('appRef') || '';
    this.application.set(this.route.snapshot.data['application'] ?? null);
    this.updateActiveKey();

    this.navSub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.updateActiveKey());
  }

  ngOnDestroy(): void {
    this.assist.stop();
    this.navSub?.unsubscribe();
  }

  get isBusiness(): boolean {
    return this.application()?.applicationType === 'BUSINESS';
  }

  get navGroupItems(): CaseSectionDef[] {
    return this.isBusiness ? BUSINESS_CASE_SECTIONS : PERSONAL_CASE_SECTIONS;
  }

  onNavSelect(key: string): void {
    if (key === 'overview') {
      this.router.navigate(['/banker/case', this.appRef]);
      return;
    }
    const def = this.navGroupItems.find(s => s.key === key);
    if (def) {
      this.router.navigate(['/banker/case', this.appRef, 'apply', this.isBusiness ? 'business' : 'personal', def.route]);
    }
  }

  private updateActiveKey(): void {
    const slug = this.router.url.split('/').pop() || '';
    const def = this.navGroupItems.find(s => s.route === slug);
    this.activeKey.set(def?.key ?? null);
  }
}
