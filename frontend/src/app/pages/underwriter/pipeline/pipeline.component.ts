import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication } from '../../../core/models';

@Component({
  selector: 'app-uw-pipeline',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pipeline.component.html',
  styleUrl: './pipeline.component.scss'
})
export class PipelineComponent implements OnInit {
  applications = signal<LoanApplication[]>([]);
  loading = signal(true);

  constructor(private appSvc: ApplicationService) {}

  ngOnInit(): void {
    this.appSvc.getPipeline().subscribe({
      next: apps => { this.applications.set(apps); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  loanAmount(app: LoanApplication): number {
    try { return JSON.parse(app.loanRequirementsJson || '{}').loanAmount || 0; }
    catch { return 0; }
  }

  applicantName(app: LoanApplication): string {
    try {
      const p = JSON.parse(app.personalDetailsJson || '{}');
      return `${p.firstName || ''} ${p.lastName || ''}`.trim() || app.customerEmail;
    } catch { return app.customerEmail; }
  }
}
