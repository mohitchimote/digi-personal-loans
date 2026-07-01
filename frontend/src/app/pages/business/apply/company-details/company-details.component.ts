import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { BUSINESS_LOAN_PURPOSES, DIGIBANK_BRANCHES, DIGIBANK_BRANCH_STAFF } from '../../../../core/models';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/** First business wizard step — company identity doubles as "loan requirements" the same way
 * loanRequirements does for the personal journey (amount/purpose/term captured alongside identity). */
@Component({
  selector: 'app-company-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './company-details.component.html',
  styleUrl: './company-details.component.scss'
})
export class CompanyDetailsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  purposes = BUSINESS_LOAN_PURPOSES;
  branches = DIGIBANK_BRANCHES;

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    public identity: EffectiveIdentityService,
    private router: Router
  ) {
    this.form = this.fb.group({
      companyName:               ['', Validators.required],
      companyRegistrationNumber: ['', Validators.required],
      industry:                  ['', Validators.required],
      yearFounded:                [null, Validators.required],
      street:   ['', Validators.required],
      city:     ['', Validators.required],
      postCode: ['', Validators.required],
      country:  ['Israel', Validators.required],
      loanAmount: [100000, [Validators.required, Validators.min(20000), Validators.max(1000000)]],
      loanPurpose: ['', Validators.required],
      loanTerm:   [36, [Validators.required, Validators.min(6), Validators.max(84)]],
      assistedByStaff: [false],
      preferredBranch: [''],
      staffName: [''],
    });
  }

  staffOptionsForBranch(): string[] {
    return DIGIBANK_BRANCH_STAFF[this.f('preferredBranch')?.value] || [];
  }

  onBranchChange(): void {
    if (!this.staffOptionsForBranch().includes(this.f('staffName')?.value)) {
      this.f('staffName')?.setValue('');
    }
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting ? '/banker/case' : undefined).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.companyDetailsJson) {
          this.form.patchValue(JSON.parse(app.companyDetailsJson));
        } else if (this.identity.companyName) {
          this.form.patchValue({ companyName: this.identity.companyName });
        }
      }
    });
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'companyDetails', this.form.value, this.identity.userId!).subscribe({
      next: () => {
        this.saving.set(false);
        if (this.identity.isAssisting) {
          this.router.navigate(this.identity.applyUrl('signatories', true));
        } else {
          this.router.navigate(['/business/apply/consent-management']);
        }
      },
      error: () => this.saving.set(false)
    });
  }
}
