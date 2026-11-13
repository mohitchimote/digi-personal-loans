import { Component, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../../core/services/document.service';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { GeneratedDocument, UploadedDocument } from '../../../core/models';
import { MasterListsService } from '../../../core/services/master-lists.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss'
})
export class DocumentsComponent implements OnInit {
  generated = signal<GeneratedDocument[]>([]);
  uploaded  = signal<UploadedDocument[]>([]);
  loading   = signal(true);
  uploading = signal(false);
  appRef    = signal('');
  dragOver  = signal(false);
  uploadError = signal('');

  /** Which set of documents applies: each Document Type master item says personal or business. */
  segment = signal<'personal' | 'business'>('personal');
  selectedDocType = '';

  requiredTypes = computed(() => {
    const he = this.i18n.lang() === 'he';
    return this.lists.items('document_type')
      .filter(i => i.attributes['segment'] === this.segment())
      .map(i => ({ type: i.code, label: he ? i.name.he || i.name.en : i.name.en }));
  });

  checklist = computed(() => {
    const receivedTypes = new Set(this.uploaded().map(u => u.documentType));
    return this.requiredTypes().map(rt => ({ ...rt, received: receivedTypes.has(rt.type) }));
  });

  constructor(
    private docSvc: DocumentService,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private i18n: I18nService,
    private lists: MasterListsService
  ) {
    this.lists.load(['document_type']);
    // Keep the upload dropdown on a valid choice as the list arrives or the segment changes.
    effect(() => {
      const types = this.requiredTypes();
      if (!types.some(t => t.type === this.selectedDocType)) this.selectedDocType = types[0]?.type ?? '';
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (!userId || !email) return;

    this.appSvc.getCurrent(userId).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.applicationType === 'BUSINESS') this.segment.set('business');
        this.docSvc.getGenerated(userId).subscribe({
          next: docs => { this.generated.set(docs); this.loading.set(false); },
          error: () => this.loading.set(false)
        });
        this.docSvc.getUploaded(app.applicationRef).subscribe({
          next: docs => this.uploaded.set(docs),
          error: () => {}
        });
      }
    });
  }

  onDragOver(e: DragEvent): void { e.preventDefault(); this.dragOver.set(true); }
  onDragLeave(): void { this.dragOver.set(false); }
  onDrop(e: DragEvent): void {
    e.preventDefault(); this.dragOver.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) this.upload(file);
  }

  onFileSelect(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.upload(file);
  }

  private upload(file: File): void {
    this.uploading.set(true);
    this.uploadError.set('');
    this.docSvc.upload(this.appRef(), this.auth.userId!, file, this.selectedDocType).subscribe({
      next: doc => {
        this.uploaded.update(u => [doc, ...u]);
        this.uploading.set(false);
      },
      error: () => {
        this.uploading.set(false);
        this.uploadError.set(this.i18n.t('docs.uploadFailed'));
      }
    });
  }

  download(doc: GeneratedDocument): void {
    this.docSvc.download(doc.id);
  }

  view(doc: GeneratedDocument): void {
    this.docSvc.view(doc.id);
  }

  viewUploaded(doc: UploadedDocument): void {
    this.docSvc.viewUploaded(doc.id);
  }

  downloadUploaded(doc: UploadedDocument): void {
    this.docSvc.downloadUploaded(doc.id);
  }

  uploadedTypeLabel(type: string): string {
    const match = this.requiredTypes().find(t => t.type === type);
    return match ? match.label : type;
  }

  docIcon(type: string): string {
    switch (type) {
      case 'APPROVAL_LETTER':       return 'description';
      case 'FINAL_APPROVAL_LETTER': return 'description';
      case 'LOAN_AGREEMENT':        return 'assignment';
      case 'REPAYMENT_SCHEDULE':    return 'calendar_month';
      case 'KEY_FACTS_STATEMENT':   return 'fact_check';
      case 'TERMS_AND_CONDITIONS':  return 'gavel';
      default: return 'attach_file';
    }
  }

  docLabel(type: string): string {
    switch (type) {
      case 'APPROVAL_LETTER':       return this.i18n.t('docs.conditionalLetter');
      case 'FINAL_APPROVAL_LETTER': return this.i18n.t('docs.finalLetter');
      case 'LOAN_AGREEMENT':        return this.i18n.t('docs.loanAgreement');
      case 'REPAYMENT_SCHEDULE':    return this.i18n.t('docs.repaymentSchedule');
      case 'KEY_FACTS_STATEMENT':   return this.i18n.t('docs.keyFactsStatement');
      case 'TERMS_AND_CONDITIONS':  return this.i18n.t('docs.termsAndConditions');
      default: return type;
    }
  }
}
