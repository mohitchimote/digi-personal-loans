import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentService } from '../../../core/services/document.service';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { GeneratedDocument } from '../../../core/models';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss'
})
export class DocumentsComponent implements OnInit {
  generated = signal<GeneratedDocument[]>([]);
  uploaded  = signal<any[]>([]);
  loading   = signal(true);
  uploading = signal(false);
  appRef    = signal('');
  dragOver  = signal(false);
  uploadError = signal('');

  constructor(
    private docSvc: DocumentService,
    private appSvc: ApplicationService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (!userId || !email) return;

    this.appSvc.getCurrent(userId).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
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
    this.docSvc.upload(this.appRef(), this.auth.userId!, file).subscribe({
      next: doc => {
        this.uploaded.update(u => [doc, ...u]);
        this.uploading.set(false);
      },
      error: () => {
        this.uploading.set(false);
        this.uploadError.set('Upload failed. Please try again.');
      }
    });
  }

  download(doc: GeneratedDocument): void {
    this.docSvc.download(doc.id);
  }

  docIcon(type: string): string {
    switch (type) {
      case 'APPROVAL_LETTER':   return '📄';
      case 'LOAN_AGREEMENT':    return '📋';
      case 'REPAYMENT_SCHEDULE': return '📊';
      default: return '📎';
    }
  }

  docLabel(type: string): string {
    switch (type) {
      case 'APPROVAL_LETTER':    return 'Approval Letter';
      case 'LOAN_AGREEMENT':     return 'Loan Agreement';
      case 'REPAYMENT_SCHEDULE': return 'Repayment Schedule';
      default: return type;
    }
  }
}
