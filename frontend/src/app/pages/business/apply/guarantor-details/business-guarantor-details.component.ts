import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { DocumentService } from '../../../../core/services/document.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/** Business equivalent of GuarantorDetailsComponent — only ever reached when an underwriter has
 * sent the case back specifically requesting a personal guarantee for the loan. */
@Component({
  selector: 'app-business-guarantor-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './business-guarantor-details.component.html',
  styleUrl: './business-guarantor-details.component.scss'
})
export class BusinessGuarantorDetailsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  uploading = signal(false);
  uploadedFiles = signal<string[]>([]);
  uploadError = signal('');

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    private docSvc: DocumentService,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      guarantorName: ['', Validators.required],
      guarantorNationalId: ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
      guarantorRelationship: ['', Validators.required],
      guarantorPhone: ['', Validators.required],
      guarantorEmail: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.guarantorDetailsJson) {
          const data = JSON.parse(app.guarantorDetailsJson);
          this.form.patchValue(data);
          this.uploadedFiles.set(data.files || []);
        }
      }
    });
  }

  onFileSelect(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.upload(file);
  }

  private upload(file: File): void {
    this.uploading.set(true);
    this.uploadError.set('');
    this.docSvc.upload(this.appRef(), this.auth.userId!, file, 'GUARANTOR_ID').subscribe({
      next: () => {
        this.uploadedFiles.update(f => [...f, file.name]);
        this.uploading.set(false);
      },
      error: () => { this.uploading.set(false); this.uploadError.set('Upload failed. Please try again.'); }
    });
  }

  get canContinue(): boolean {
    return this.form.valid && this.uploadedFiles().length > 0;
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.uploadedFiles().length === 0) return;
    this.saving.set(true);
    const payload = { ...this.form.value, files: this.uploadedFiles() };
    this.appSvc.saveSection(this.appRef(), 'guarantorDetails', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/business/apply/connect-bank']); },
      error: () => this.saving.set(false)
    });
  }
}
