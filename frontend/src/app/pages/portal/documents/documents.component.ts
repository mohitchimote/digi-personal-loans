import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../../core/services/document.service';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { GeneratedDocument, UploadedDocument, REQUIRED_DOCUMENT_TYPES, BUSINESS_REQUIRED_DOCUMENT_TYPES } from '../../../core/models';
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

  requiredTypes = REQUIRED_DOCUMENT_TYPES;
  selectedDocType = REQUIRED_DOCUMENT_TYPES[0].type;

  checklist = computed(() => {
    const receivedTypes = new Set(this.uploaded().map(u => u.documentType));
    return this.requiredTypes.map(rt => ({ ...rt, received: receivedTypes.has(rt.type) }));
  });

  constructor(
    private docSvc: DocumentService,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private i18n: I18nService
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (!userId || !email) return;

    this.appSvc.getCurrent(userId).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.applicationType === 'BUSINESS') {
          this.requiredTypes = BUSINESS_REQUIRED_DOCUMENT_TYPES;
          this.selectedDocType = BUSINESS_REQUIRED_DOCUMENT_TYPES[0].type;
        }
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
    const match = this.requiredTypes.find(t => t.type === type);
    return match ? this.i18n.t(match.labelKey) : type;
  }

  docIcon(type: string): string {
    switch (type) {
      case 'APPROVAL_LETTER':       return 'description';
      case 'FINAL_APPROVAL_LETTER': return 'description';
      case 'LOAN_AGREEMENT':        return 'assignment';
      case 'REPAYMENT_SCHEDULE':    return 'fact_check';
      default: return 'attach_file';
    }
  }

  docLabel(type: string): string {
    switch (type) {
      case 'APPROVAL_LETTER':       return this.i18n.t('docs.conditionalLetter');
      case 'FINAL_APPROVAL_LETTER': return this.i18n.t('docs.finalLetter');
      case 'LOAN_AGREEMENT':        return this.i18n.t('docs.loanAgreement');
      case 'REPAYMENT_SCHEDULE':    return this.i18n.t('docs.repaymentSchedule');
      default: return type;
    }
  }
}
