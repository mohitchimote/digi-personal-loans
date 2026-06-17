import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-intro',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './intro.component.html',
  styleUrl: './intro.component.scss'
})
export class IntroComponent {
  steps = [
    { num: '01', icon: '📋', title: 'Loan Requirements', desc: 'Tell us how much you need, what for, and over what term. This takes about 1 minute.' },
    { num: '02', icon: '👤', title: 'Personal Details', desc: 'Your name, date of birth, national ID, and current address for identity verification.' },
    { num: '03', icon: '💼', title: 'Income & Employment', desc: 'Details of your employment and monthly income — both gross and net.' },
    { num: '04', icon: '💳', title: 'Outgoings', desc: 'Monthly commitments including rent, existing loans, and living expenses.' },
    { num: '05', icon: '📊', title: 'Credit Declarations', desc: 'A short set of credit history questions to help us assess your application.' },
    { num: '06', icon: '✅', title: 'Review & Submit', desc: 'Check everything looks right, sign digitally, and submit your application.' },
  ];

  docs = [
    { icon: '📄', title: 'Payslips', desc: 'Last 3 months' },
    { icon: '🏦', title: 'Bank Statements', desc: 'Last 6 months' },
    { icon: '🪪', title: 'Photo ID', desc: 'Passport or driving licence' },
    { icon: '📮', title: 'Proof of Address', desc: 'Dated within 3 months' },
  ];
}
