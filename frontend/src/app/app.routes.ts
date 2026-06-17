import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent) },
  { path: 'login',    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
  { path: 'intro',    loadComponent: () => import('./pages/intro/intro.component').then(m => m.IntroComponent) },
  {
    path: 'portal',
    loadComponent: () => import('./pages/portal/portal.component').then(m => m.PortalComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./pages/portal/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'apply/loan-requirements',   loadComponent: () => import('./pages/portal/application/loan-requirements/loan-requirements.component').then(m => m.LoanRequirementsComponent) },
      { path: 'apply/personal-details',    loadComponent: () => import('./pages/portal/application/personal-details/personal-details.component').then(m => m.PersonalDetailsComponent) },
      { path: 'apply/income-employment',   loadComponent: () => import('./pages/portal/application/income-employment/income-employment.component').then(m => m.IncomeEmploymentComponent) },
      { path: 'apply/outgoings',           loadComponent: () => import('./pages/portal/application/outgoings/outgoings.component').then(m => m.OutgoingsComponent) },
      { path: 'apply/credit-declarations', loadComponent: () => import('./pages/portal/application/credit-declarations/credit-declarations.component').then(m => m.CreditDeclarationsComponent) },
      { path: 'apply/review-submit',       loadComponent: () => import('./pages/portal/application/review-submit/review-submit.component').then(m => m.ReviewSubmitComponent) },
      { path: 'affordability-results',     loadComponent: () => import('./pages/portal/affordability-results/affordability-results.component').then(m => m.AffordabilityResultsComponent) },
      { path: 'products',                  loadComponent: () => import('./pages/portal/products/products.component').then(m => m.ProductsComponent) },
      { path: 'approval',                  loadComponent: () => import('./pages/portal/approval/approval.component').then(m => m.ApprovalComponent) },
      { path: 'documents',                 loadComponent: () => import('./pages/portal/documents/documents.component').then(m => m.DocumentsComponent) },
      { path: 'notifications',             loadComponent: () => import('./pages/portal/notifications/notifications.component').then(m => m.NotificationsComponent) },
      { path: 'faq',                       loadComponent: () => import('./pages/portal/faq/faq.component').then(m => m.FaqComponent) },
    ]
  },
  { path: '**', redirectTo: '' }
];
