import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChatbotComponent } from '../../shared/chatbot/chatbot.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../shared/language-switcher/language-switcher.component';
import { BrandLogoComponent } from '../../shared/brand-logo/brand-logo.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, ChatbotComponent, TranslatePipe, LanguageSwitcherComponent, BrandLogoComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  features = [
    { icon: 'bolt',          titleKey: 'landing.feature1Title', descKey: 'landing.feature1Desc' },
    { icon: 'lock',          titleKey: 'landing.feature2Title', descKey: 'landing.feature2Desc' },
    { icon: 'phone_android', titleKey: 'landing.feature3Title', descKey: 'landing.feature3Desc' },
    { icon: 'support_agent', titleKey: 'landing.feature4Title', descKey: 'landing.feature4Desc' },
  ];

  loanTypes = [
    { icon: 'home',          titleKey: 'landing.loan1Title', amount: '₪10K – ₪300K', rateKey: 'landing.loan1Rate' },
    { icon: 'directions_car',titleKey: 'landing.loan2Title', amount: '₪20K – ₪150K', rateKey: 'landing.loan2Rate' },
    { icon: 'school',        titleKey: 'landing.loan3Title', amount: '₪5K – ₪80K',   rateKey: 'landing.loan3Rate' },
    { icon: 'credit_card',   titleKey: 'landing.loan4Title', amount: '₪10K – ₪250K', rateKey: 'landing.loan4Rate' },
  ];
}
