import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-direct-debit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './direct-debit.component.html',
  styleUrl: './direct-debit.component.scss'
})
export class DirectDebitComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  addGuarantor = signal(false);
  repaymentDays = Array.from({ length: 28 }, (_, i) => i + 1);

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      accountHolderName: ['', Validators.required],
      bankName:          ['', Validators.required],
      accountNumber:     ['', Validators.required],
      branchCode:        ['', Validators.required],
      preferredRepaymentDay: [1, Validators.required],
      confirmAuthorisation: [false, Validators.requiredTrue],
      guarantorName:     [''],
      guarantorNationalId: [''],
      guarantorRelationship: [''],
      guarantorPhone:    [''],
      guarantorEmail:    [''],
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.directDebitJson) {
          const data = JSON.parse(app.directDebitJson);
          this.form.patchValue(data);
          if (data.guarantorName) this.addGuarantor.set(true);
        }
      }
    });
  }

  toggleGuarantor(): void {
    this.addGuarantor.set(!this.addGuarantor());
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const value = { ...this.form.value };
    if (!this.addGuarantor()) {
      value.guarantorName = '';
      value.guarantorNationalId = '';
      value.guarantorRelationship = '';
      value.guarantorPhone = '';
      value.guarantorEmail = '';
    }
    this.appSvc.saveSection(this.appRef(), 'directDebit', value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/review-submit']); },
      error: () => this.saving.set(false)
    });
  }
}
