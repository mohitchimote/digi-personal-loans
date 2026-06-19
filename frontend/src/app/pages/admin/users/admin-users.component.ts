import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, UserSummary } from '../../../core/services/admin.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  users = signal<UserSummary[]>([]);
  loading = signal(true);
  error = signal('');

  roles = ['CUSTOMER', 'UNDERWRITER', 'ADMIN'];

  constructor(private adminSvc: AdminService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.adminSvc.getUsers().subscribe({
      next: users => { this.users.set(users); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  changeRole(user: UserSummary, role: string): void {
    this.adminSvc.updateRole(user.id, role).subscribe({
      next: () => { user.role = role; },
      error: () => this.error.set(this.i18n.t('admin.errUpdateRole'))
    });
  }

  toggleEnabled(user: UserSummary): void {
    const next = !user.enabled;
    this.adminSvc.setEnabled(user.id, next).subscribe({
      next: () => { user.enabled = next; },
      error: () => this.error.set(this.i18n.t('admin.errUpdateStatus'))
    });
  }

}
