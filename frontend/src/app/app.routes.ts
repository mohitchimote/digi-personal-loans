import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { underwriterGuard } from './core/guards/underwriter.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent) },
  { path: 'login',    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'login/verify-otp', loadComponent: () => import('./pages/login/verify-otp/login-verify-otp.component').then(m => m.LoginVerifyOtpComponent) },
  { path: 'register', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
  { path: 'register/verify-otp', loadComponent: () => import('./pages/register/verify-otp/verify-otp.component').then(m => m.VerifyOtpComponent) },
  { path: 'intro',    loadComponent: () => import('./pages/intro/intro.component').then(m => m.IntroComponent) },
  {
    path: 'portal',
    loadComponent: () => import('./pages/portal/portal.component').then(m => m.PortalComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./pages/portal/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'apply/loan-requirements',   loadComponent: () => import('./pages/portal/application/loan-requirements/loan-requirements.component').then(m => m.LoanRequirementsComponent) },
      { path: 'apply/consent-management',  loadComponent: () => import('./pages/portal/application/consent-management/consent-management.component').then(m => m.ConsentManagementComponent) },
      { path: 'apply/personal-details',    loadComponent: () => import('./pages/portal/application/personal-details/personal-details.component').then(m => m.PersonalDetailsComponent) },
      { path: 'apply/connect-bank',        loadComponent: () => import('./pages/portal/application/connect-bank/connect-bank.component').then(m => m.ConnectBankComponent) },
      { path: 'apply/income-employment',   loadComponent: () => import('./pages/portal/application/income-employment/income-employment.component').then(m => m.IncomeEmploymentComponent) },
      { path: 'apply/outgoings',           loadComponent: () => import('./pages/portal/application/outgoings/outgoings.component').then(m => m.OutgoingsComponent) },
      { path: 'apply/credit-declarations', loadComponent: () => import('./pages/portal/application/credit-declarations/credit-declarations.component').then(m => m.CreditDeclarationsComponent) },
      { path: 'apply/verify-id',           loadComponent: () => import('./pages/portal/application/verify-id/verify-id.component').then(m => m.VerifyIdComponent) },
      { path: 'apply/direct-debit',        loadComponent: () => import('./pages/portal/application/direct-debit/direct-debit.component').then(m => m.DirectDebitComponent) },
      { path: 'apply/review-submit',       loadComponent: () => import('./pages/portal/application/review-submit/review-submit.component').then(m => m.ReviewSubmitComponent) },
      { path: 'affordability-results',     loadComponent: () => import('./pages/portal/affordability-results/affordability-results.component').then(m => m.AffordabilityResultsComponent) },
      { path: 'products',                  loadComponent: () => import('./pages/portal/products/products.component').then(m => m.ProductsComponent) },
      { path: 'approval',                  loadComponent: () => import('./pages/portal/approval/approval.component').then(m => m.ApprovalComponent) },
      { path: 'approval/:appRef',          loadComponent: () => import('./pages/portal/approval/approval.component').then(m => m.ApprovalComponent) },
      { path: 'documents',                 loadComponent: () => import('./pages/portal/documents/documents.component').then(m => m.DocumentsComponent) },
      { path: 'view-application/:appRef',  loadComponent: () => import('./pages/portal/view-application/view-application.component').then(m => m.ViewApplicationComponent) },
      { path: 'notifications',             loadComponent: () => import('./pages/portal/notifications/notifications.component').then(m => m.NotificationsComponent) },
      { path: 'faq',                       loadComponent: () => import('./pages/portal/faq/faq.component').then(m => m.FaqComponent) },
    ]
  },
  {
    path: 'underwriter',
    loadComponent: () => import('./pages/underwriter/shell/uw-shell.component').then(m => m.UwShellComponent),
    canActivate: [underwriterGuard],
    children: [
      { path: '', redirectTo: 'pipeline', pathMatch: 'full' },
      { path: 'pipeline',      loadComponent: () => import('./pages/underwriter/pipeline/pipeline.component').then(m => m.PipelineComponent) },
      { path: 'case/:appRef',  loadComponent: () => import('./pages/underwriter/case-detail/case-detail.component').then(m => m.CaseDetailComponent) },
    ]
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/shell/admin-shell.component').then(m => m.AdminShellComponent),
    canActivate: [adminGuard],
    children: [
      { path: '', redirectTo: 'users', pathMatch: 'full' },
      { path: 'users', loadComponent: () => import('./pages/admin/users/admin-users.component').then(m => m.AdminUsersComponent) },
      { path: 'faqs',  loadComponent: () => import('./pages/admin/faqs/admin-faqs.component').then(m => m.AdminFaqsComponent) },
      { path: 'rules', loadComponent: () => import('./pages/admin/rules/admin-rules.component').then(m => m.AdminRulesComponent) },
      { path: 'branding', loadComponent: () => import('./pages/admin/branding/admin-branding.component').then(m => m.AdminBrandingComponent) },
    ]
  },
  { path: '**', redirectTo: '' }
];
