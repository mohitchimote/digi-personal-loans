import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { DocumentService } from '../../../../core/services/document.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/** Only ever reached when an underwriter has sent the case back specifically requesting a
 * guarantor (see ApplicationService.sendBackApplication / case-detail's "Require Guarantor"
 * checkbox) — never part of the normal first-pass wizard flow. */
@Component({
  selector: 'app-guarantor-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './guarantor-details.component.html',
  styleUrl: './guarantor-details.component.scss'
})
export class GuarantorDetailsComponent implements OnInit {
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
    private identity: EffectiveIdentityService,
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
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting ? '/banker/case' : undefined).subscribe({
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
    this.docSvc.upload(this.appRef(), this.identity.userId!, file, 'GUARANTOR_ID').subscribe({
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
    this.appSvc.saveSection(this.appRef(), 'guarantorDetails', payload, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('connect-bank')); },
      error: () => this.saving.set(false)
    });
  }
}
