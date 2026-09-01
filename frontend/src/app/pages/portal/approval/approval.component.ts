import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../core/services/application.service';
import { DocumentService } from '../../../core/services/document.service';
import { EffectiveIdentityService } from '../../../core/services/effective-identity.service';
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
  allDocs = signal<GeneratedDocument[]>([]);
  today = new Date();

  // Display order for the rest of the offer pack (cover/final letter has its own dedicated card
  // above, so isn't repeated here).
  private static readonly PACK_TYPES = ['KEY_FACTS_STATEMENT', 'TERMS_AND_CONDITIONS', 'REPAYMENT_SCHEDULE'];

  constructor(
    private appSvc: ApplicationService,
    private docSvc: DocumentService,
    public identity: EffectiveIdentityService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const userId = this.identity.userId;
    const email  = this.identity.userEmail;
    if (!userId || !email) return;

    const appRef = this.identity.appRef ?? this.route.snapshot.paramMap.get('appRef');
    const source = appRef ? this.appSvc.getApplication(appRef) : this.appSvc.getCurrent(userId);

    source.subscribe({
      next: app => {
        this.application.set(app);

        this.docSvc.getByApplication(app.applicationRef).subscribe({
          next: docs => {
            this.allDocs.set(docs);
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

  // Every CONDITIONALLY_APPROVED application, by construction, missed straight-through processing
  // (maybeAutoApprove on the worker jumps straight to APPROVED — it never leaves an app sitting at
  // CONDITIONALLY_APPROVED). The SME asked for a plain-language reason here without exposing exact
  // policy thresholds/numbers, so this maps the affordability result's failure category — or the
  // absence of a failure, meaning it simply exceeded the auto-approval amount — to a generic,
  // customer-safe explanation key.
  nonStpReasonKey(): string | null {
    const app = this.application();
    if (!app || this.isFinal()) return null;
    let result: { passed?: boolean; failureType?: string | null } | null = null;
    try { result = app.affordabilityResultJson ? JSON.parse(app.affordabilityResultJson) : null; } catch { result = null; }

    if (result?.passed === false) {
      switch (result.failureType) {
        case 'CAPACITY': return 'approval.nonStpReason.capacity';
        case 'STRUCTURAL': return 'approval.nonStpReason.structural';
        case 'TERMINAL': return 'approval.nonStpReason.eligibility';
        default: return 'approval.nonStpReason.generic';
      }
    }
    return 'approval.nonStpReason.amount';
  }

  letterStepDone(): boolean {
    return this.isFinal() || this.generated();
  }

  generateLetter(): void {
    const app = this.application();
    if (!app || this.generated()) return;
    this.generating.set(true);

    this.docSvc.generate({
      applicationRef: app.applicationRef,
      customerId: this.identity.userId!,
      documentType: 'APPROVAL_LETTER',
      customerName: `${this.personal.firstName} ${this.personal.lastName}`,
      loanAmount: this.loan.loanAmount,
      productName: this.product.productName,
      interestRate: this.product.interestRate,
      termMonths: this.product.termMonths,
      monthlyRepayment: this.product.monthlyRepayment
    }).subscribe({
      next: pack => {
        const letter = pack.find(d => d.documentType === 'APPROVAL_LETTER');
        if (letter) this.docId.set(letter.id);
        this.allDocs.update(existing => [...existing, ...pack]);
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

  // Key Facts Statement / Repayment Schedule get regenerated at final approval (see
  // lib/document-pack.ts) since the approved amount can differ from what was requested — this
  // keeps only the latest of each so the pack doesn't show a stale conditional-stage copy
  // alongside its final replacement. T&Cs are only ever generated once, at the conditional stage.
  packDocuments(): GeneratedDocument[] {
    const latestByType = new Map<string, GeneratedDocument>();
    for (const doc of this.allDocs()) {
      if (!ApprovalComponent.PACK_TYPES.includes(doc.documentType)) continue;
      const existing = latestByType.get(doc.documentType);
      if (!existing || doc.generatedAt > existing.generatedAt) latestByType.set(doc.documentType, doc);
    }
    return ApprovalComponent.PACK_TYPES.map(t => latestByType.get(t)).filter((d): d is GeneratedDocument => !!d);
  }

  packDocLabelKey(type: string): string {
    switch (type) {
      case 'KEY_FACTS_STATEMENT': return 'docs.keyFactsStatement';
      case 'TERMS_AND_CONDITIONS': return 'docs.termsAndConditions';
      case 'REPAYMENT_SCHEDULE': return 'docs.repaymentSchedule';
      default: return type;
    }
  }

  packDocIcon(type: string): string {
    switch (type) {
      case 'KEY_FACTS_STATEMENT': return 'fact_check';
      case 'TERMS_AND_CONDITIONS': return 'gavel';
      case 'REPAYMENT_SCHEDULE': return 'calendar_month';
      default: return 'description';
    }
  }

  viewPackDoc(doc: GeneratedDocument): void {
    this.docSvc.view(doc.id);
  }

  downloadPackDoc(doc: GeneratedDocument): void {
    this.docSvc.download(doc.id);
  }
}
