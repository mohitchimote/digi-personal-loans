import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, UserSummary } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  users = signal<UserSummary[]>([]);
  loading = signal(true);
  error = signal('');
  resetTargetId = signal<number | null>(null);
  newPassword = '';

  roles = ['CUSTOMER', 'UNDERWRITER', 'ADMIN'];

  constructor(private adminSvc: AdminService) {}

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
      error: () => this.error.set('Could not update role.')
    });
  }

  toggleEnabled(user: UserSummary): void {
    const next = !user.enabled;
    this.adminSvc.setEnabled(user.id, next).subscribe({
      next: () => { user.enabled = next; },
      error: () => this.error.set('Could not update user status.')
    });
  }

  openReset(user: UserSummary): void {
    this.resetTargetId.set(user.id);
    this.newPassword = '';
  }

  cancelReset(): void {
    this.resetTargetId.set(null);
  }

  confirmReset(): void {
    const id = this.resetTargetId();
    if (!id || this.newPassword.length < 6) { this.error.set('Password must be at least 6 characters.'); return; }
    this.adminSvc.resetPassword(id, this.newPassword).subscribe({
      next: () => { this.resetTargetId.set(null); this.error.set(''); },
      error: () => this.error.set('Could not reset password.')
    });
  }
}
