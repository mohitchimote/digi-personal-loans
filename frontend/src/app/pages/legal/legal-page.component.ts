import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../../shared/brand-logo/brand-logo.component';

type LegalPageType = 'terms' | 'privacy';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, BrandLogoComponent],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss'
})
export class LegalPageComponent {
  type: LegalPageType;

  constructor(route: ActivatedRoute) {
    this.type = (route.snapshot.data['type'] as LegalPageType) ?? 'terms';
  }

  get isTerms(): boolean {
    return this.type === 'terms';
  }
}
