import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrandingService } from '../../core/services/branding.service';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <img *ngIf="logoUrl" [src]="logoUrl" [class]="iconClass" alt="" />
    <span *ngIf="!logoUrl" class="material-icons" [class]="iconClass">account_balance</span>
  `,
  styleUrl: './brand-logo.component.scss'
})
export class BrandLogoComponent implements OnInit {
  @Input() iconClass = '';
  logoUrl: string | null = null;

  constructor(private branding: BrandingService) {}

  ngOnInit(): void {
    this.branding.getBranding().subscribe({
      next: settings => this.logoUrl = this.branding.logoFullUrl(settings),
      error: () => {}
    });
  }
}
