import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrandingService } from '../../core/services/branding.service';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <img *ngIf="logoUrl()" [src]="logoUrl()" [class]="iconClass" alt="" />
    <span *ngIf="!logoUrl()" class="material-icons" [class]="iconClass">account_balance</span>
  `,
  styleUrl: './brand-logo.component.scss'
})
export class BrandLogoComponent implements OnInit {
  @Input() iconClass = '';
  /* A plain property mutated from inside an HTTP subscribe callback never triggers a re-render
   * under this app's zoneless change detection — only signal writes do. Without this being a
   * signal, the fallback icon renders once at construction and never updates to the real logo
   * once the async branding fetch resolves, even though the data itself arrives correctly. */
  logoUrl = signal<string | null>(null);

  constructor(private branding: BrandingService) {}

  ngOnInit(): void {
    this.branding.getBranding().subscribe({
      next: settings => this.logoUrl.set(this.branding.logoFullUrl(settings)),
      error: () => {}
    });
  }
}
