import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { MARITAL_STATUSES, NATIONALITIES } from '../../../../core/models';

@Component({
  selector: 'app-personal-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './personal-details.component.html',
  styleUrl: './personal-details.component.scss'
})
export class PersonalDetailsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  maritalStatuses = MARITAL_STATUSES;
  nationalities = NATIONALITIES;

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      firstName:    ['', Validators.required],
      lastName:     ['', Validators.required],
      dateOfBirth:  ['', Validators.required],
      nationalId:   ['', Validators.required],
      nationality:  ['Israeli', Validators.required],
      maritalStatus:['', Validators.required],
      dependents:   [0, [Validators.required, Validators.min(0)]],
      street:       ['', Validators.required],
      city:         ['', Validators.required],
      postCode:     ['', Validators.required],
      country:      ['Israel', Validators.required],
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.startOrResume(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.personalDetailsJson) this.form.patchValue(JSON.parse(app.personalDetailsJson));
      }
    });
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'personalDetails', this.form.value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/income-employment']); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
}
