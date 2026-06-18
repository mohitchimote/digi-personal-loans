import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../shared/language-switcher/language-switcher.component';

@Component({
  selector: 'app-intro',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './intro.component.html',
  styleUrl: './intro.component.scss'
})
export class IntroComponent {
  steps = [
    { num: '01', icon: '📋', titleKey: 'steps.loanRequirements',    descKey: 'intro.step1Desc' },
    { num: '02', icon: '👤', titleKey: 'steps.personalDetails',     descKey: 'intro.step2Desc' },
    { num: '03', icon: '💼', titleKey: 'steps.incomeEmployment',    descKey: 'intro.step3Desc' },
    { num: '04', icon: '💳', titleKey: 'steps.outgoings',           descKey: 'intro.step4Desc' },
    { num: '05', icon: '📊', titleKey: 'steps.creditDeclarations',  descKey: 'intro.step5Desc' },
    { num: '06', icon: '✅', titleKey: 'steps.reviewSubmit',        descKey: 'intro.step6Desc' },
  ];

  docs = [
    { icon: '📄', titleKey: 'intro.doc1Title', descKey: 'intro.doc1Desc' },
    { icon: '🏦', titleKey: 'intro.doc2Title', descKey: 'intro.doc2Desc' },
    { icon: '🪪', titleKey: 'intro.doc3Title', descKey: 'intro.doc3Desc' },
    { icon: '📮', titleKey: 'intro.doc4Title', descKey: 'intro.doc4Desc' },
  ];
}
