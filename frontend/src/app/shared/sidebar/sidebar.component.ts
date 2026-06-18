import { Component, Input, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoanApplication } from '../../core/models';
import { TranslatePipe } from '../pipes/translate.pipe';

export interface NavSection {
  id: string;
  label: string;
  icon: string;
  route?: string;
  children?: NavItem[];
}

export interface NavItem {
  labelKey: string;
  route: string;
  sectionKey?: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent implements OnInit {
  @Input() application: LoanApplication | null = null;
  @Input() collapsed = false;

  expandedSection = signal<string>('apply');

  applicationSteps: NavItem[] = [
    { labelKey: 'steps.loanRequirements',    route: '/portal/apply/loan-requirements',   sectionKey: 'loanRequirements' },
    { labelKey: 'steps.personalDetails',     route: '/portal/apply/personal-details',    sectionKey: 'personalDetails' },
    { labelKey: 'steps.connectBank',         route: '/portal/apply/connect-bank',        sectionKey: 'connectBank' },
    { labelKey: 'steps.incomeEmployment',    route: '/portal/apply/income-employment',   sectionKey: 'incomeEmployment' },
    { labelKey: 'steps.outgoings',           route: '/portal/apply/outgoings',           sectionKey: 'outgoings' },
    { labelKey: 'steps.creditDeclarations',  route: '/portal/apply/credit-declarations', sectionKey: 'creditDeclarations' },
    { labelKey: 'steps.verifyId',            route: '/portal/apply/verify-id',           sectionKey: 'verifyId' },
    { labelKey: 'steps.directDebit',         route: '/portal/apply/direct-debit',        sectionKey: 'directDebit' },
    { labelKey: 'steps.reviewSubmit',        route: '/portal/apply/review-submit',       sectionKey: 'reviewSubmit' },
  ];

  mainNav: NavSection[] = [
    { id: 'dashboard', label: 'Dashboard',     icon: '⊞', route: '/portal/dashboard' },
    { id: 'apply',     label: 'My Application', icon: '📋' },
    { id: 'documents', label: 'Documents',      icon: '📁', route: '/portal/documents' },
    { id: 'notifications', label: 'Notifications', icon: '🔔', route: '/portal/notifications' },
    { id: 'faq',       label: 'Help & FAQ',     icon: '❓', route: '/portal/faq' },
  ];

  constructor(
    public auth: AuthService,
    public notifications: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    if (userId) this.notifications.refreshCount(userId);
  }

  toggleSection(id: string): void {
    this.expandedSection.set(this.expandedSection() === id ? '' : id);
  }

  isSectionExpanded(id: string): boolean {
    return this.expandedSection() === id;
  }

  isStepCompleted(sectionKey: string): boolean {
    if (!this.application) return false;
    const map: Record<string, string | undefined> = {
      loanRequirements:   this.application.loanRequirementsJson,
      personalDetails:    this.application.personalDetailsJson,
      connectBank:        this.application.bankConnectionJson,
      incomeEmployment:   this.application.incomeEmploymentJson,
      outgoings:          this.application.outgoingsJson,
      creditDeclarations: this.application.creditDeclarationsJson,
      verifyId:           this.application.verifyIdJson,
      directDebit:        this.application.directDebitJson,
      reviewSubmit:       this.application.reviewSubmitJson,
    };
    return !!map[sectionKey];
  }

  completedCount(): number {
    return this.applicationSteps.filter(s => this.isStepCompleted(s.sectionKey!)).length;
  }

  get progressPercent(): number {
    return Math.round((this.completedCount() / this.applicationSteps.length) * 100);
  }

  contactAdvisor(): void {
    alert('Your advisor will be in touch shortly.\nFor immediate assistance, call: +972-3-123-4567');
  }
}
