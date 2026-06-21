import { Component, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/** Directors/UBOs (Ultimate Beneficial Owners) — at least one signatory required, defaults to the
 * authorized signatory who is logged in (mirrors how personalDetails prefills from registration). */
@Component({
  selector: 'app-signatories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './signatories.component.html',
  styleUrl: './signatories.component.scss'
})
export class SignatoriesComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({ signatories: this.fb.array([]) });
  }

  get signatories(): FormArray { return this.form.get('signatories') as FormArray; }

  private newSignatory(primary = false): FormGroup {
    return this.fb.group({
      fullName: ['', Validators.required],
      nationalId: ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
      title: ['', Validators.required],
      ownershipPercentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
      primarySignatory: [primary],
    });
  }

  addSignatory(): void {
    this.signatories.push(this.newSignatory());
  }

  removeSignatory(i: number): void {
    if (this.signatories.length > 1) this.signatories.removeAt(i);
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.signatoriesJson) {
          const data = JSON.parse(app.signatoriesJson);
          (data.signatories || []).forEach((s: any) => {
            const group = this.newSignatory(s.primarySignatory);
            group.patchValue(s);
            this.signatories.push(group);
          });
        }
        if (this.signatories.length === 0) {
          const primary = this.newSignatory(true);
          primary.patchValue({ fullName: this.auth.userFullName || '', nationalId: this.auth.userNationalId || '' });
          this.signatories.push(primary);
        }
      }
    });
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'signatories', this.form.value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/business/apply/connect-bank']); },
      error: () => this.saving.set(false)
    });
  }
}
