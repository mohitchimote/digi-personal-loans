import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../core/services/application.service';
import { DocumentService } from '../../../core/services/document.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoanApplication, GeneratedDocument } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-approval',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './approval.component.html',
  styleUrl: './approval.component.scss'
})
export class ApprovalComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  generating = signal(false);
  generated = signal(false);
  docId = signal<number | null>(null);
  finalLetter = signal<GeneratedDocument | null>(null);
  documentsUploaded = signal(false);
  today = new Date();

  constructor(
    private appSvc: ApplicationService,
    private docSvc: DocumentService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (!userId || !email) return;

    this.appSvc.getCurrent(userId).subscribe({
      next: app => {
        this.application.set(app);

        this.docSvc.getByApplication(app.applicationRef).subscribe({
          next: docs => {
            const letter = docs.find(d => d.documentType === 'APPROVAL_LETTER');
            if (letter) {
              this.docId.set(letter.id);
              this.generated.set(true);
            }
            const final = docs.find(d => d.documentType === 'FINAL_APPROVAL_LETTER');
            if (final) this.finalLetter.set(final);
          },
          error: () => {}
        });

        this.docSvc.getUploaded(app.applicationRef).subscribe({
          next: uploaded => this.documentsUploaded.set(uploaded.length > 0),
          error: () => {}
        });
      }
    });
  }

  get loan() { return JSON.parse(this.application()?.loanRequirementsJson || '{}'); }
  get personal() { return JSON.parse(this.application()?.personalDetailsJson || '{}'); }
  get product() { return JSON.parse(this.application()?.selectedProductJson || '{}'); }

  isFinal(): boolean {
    return this.application()?.status === 'APPROVED';
  }

  generateLetter(): void {
    const app = this.application();
    if (!app || this.generated()) return;
    this.generating.set(true);

    this.docSvc.generate({
      applicationRef: app.applicationRef,
      customerId: this.auth.userId!,
      documentType: 'APPROVAL_LETTER',
      customerName: `${this.personal.firstName} ${this.personal.lastName}`,
      loanAmount: this.loan.loanAmount,
      productName: this.product.productName,
      interestRate: this.product.interestRate,
      termMonths: this.product.termMonths,
      monthlyRepayment: this.product.monthlyRepayment
    }).subscribe({
      next: doc => {
        this.docId.set(doc.id);
        this.generated.set(true);
        this.generating.set(false);
      },
      error: () => this.generating.set(false)
    });
  }

  downloadDoc(): void {
    const id = this.docId();
    if (id) this.docSvc.download(id);
  }

  downloadFinalLetter(): void {
    const doc = this.finalLetter();
    if (doc) this.docSvc.download(doc.id);
  }
}
