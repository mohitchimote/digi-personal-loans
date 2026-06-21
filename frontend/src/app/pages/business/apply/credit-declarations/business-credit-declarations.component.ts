import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-business-credit-declarations',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './business-credit-declarations.component.html',
  styleUrl: './business-credit-declarations.component.scss'
})
export class BusinessCreditDeclarationsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');

  constructor(private fb: FormBuilder, private appSvc: ApplicationService, private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      hasLiquidationOrWindingUp: [false, Validators.required],
      hasCompanyDefaulted:       [false, Validators.required],
      hasCCJ:                    [false, Validators.required],
    });
  }

  /** Director credit score is no longer asked of customers (underwriter-only data) — a simulated
   * bureau score is generated instead, deterministically seeded so it's stable across edits. */
  private existingScore: number | null = null;

  private syntheticScore(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return 1 + (h % 9);
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.businessCreditDeclarationsJson) {
          const data = JSON.parse(app.businessCreditDeclarationsJson);
          this.form.patchValue(data);
          this.existingScore = data.directorCreditScore ?? null;
        }
      }
    });
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const directorCreditScore = this.existingScore ?? this.syntheticScore(this.auth.userNationalId || this.appRef());
    const payload = { ...this.form.value, directorCreditScore };
    this.appSvc.saveSection(this.appRef(), 'businessCreditDeclarations', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/business/apply/verify-id']); },
      error: () => this.saving.set(false)
    });
  }
}
