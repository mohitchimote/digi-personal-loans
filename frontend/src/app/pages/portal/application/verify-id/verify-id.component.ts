import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { DocumentService } from '../../../../core/services/document.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-verify-id',
  standalone: true,
  imports: [CommonModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './verify-id.component.html',
  styleUrl: './verify-id.component.scss'
})
export class VerifyIdComponent implements OnInit {
  saving = signal(false);
  uploading = signal(false);
  appRef = signal('');
  dragOver = signal(false);
  uploadedFiles = signal<string[]>([]);
  uploadError = signal('');

  constructor(
    private appSvc: ApplicationService,
    private docSvc: DocumentService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.verifyIdJson) {
          const data = JSON.parse(app.verifyIdJson);
          this.uploadedFiles.set(data.files || []);
        }
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
    this.docSvc.upload(this.appRef(), this.auth.userId!, file, 'NATIONAL_ID').subscribe({
      next: () => {
        this.uploadedFiles.update(f => [...f, file.name]);
        this.uploading.set(false);
      },
      error: () => { this.uploading.set(false); this.uploadError.set('Upload failed. Please try again.'); }
    });
  }

  get canContinue(): boolean {
    return this.uploadedFiles().length > 0;
  }

  continue(): void {
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'verifyId', { idVerified: true, files: this.uploadedFiles() }, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/direct-debit']); },
      error: () => this.saving.set(false)
    });
  }
}
