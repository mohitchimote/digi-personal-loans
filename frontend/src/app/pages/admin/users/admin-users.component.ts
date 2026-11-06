import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, UserSummary, OrgUnit, RoleRow } from '../../../core/services/admin.service';
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
  activeTab = signal<'staff' | 'customers'>('staff');

  orgUnits = signal<OrgUnit[]>([]);
  staff = signal<UserSummary[]>([]);
  customers = signal<UserSummary[]>([]);
  loadingStaff = signal(true);
  loadingCustomers = signal(true);
  error = signal('');

  /** Staff roles come from the admin-configured roles table, not a hard-coded list. */
  roleRows = signal<RoleRow[]>([]);
  get staffRoles(): string[] { return this.roleRows().map(r => r.code); }

  showCreateForm = signal(false);
  creating = signal(false);
  newUser: { email: string; fullName: string; nationalId: string; phoneNumber: string; role: string; orgUnitId: number | null } = { email: '', fullName: '', nationalId: '', phoneNumber: '', role: 'BANKER', orgUnitId: null };

  deleteConfirmId = signal<number | null>(null);
  deleting = signal(false);

  constructor(private adminSvc: AdminService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.loadStaff();
    this.loadCustomers();
    this.adminSvc.getOrg().subscribe({ next: o => this.orgUnits.set(o.units.filter(u => u.active)) });
    this.adminSvc.getRoles().subscribe({ next: r => this.roleRows.set(r.roles) });
  }

  private loadStaff(): void {
    this.loadingStaff.set(true);
    this.adminSvc.getStaff().subscribe({
      next: users => { this.staff.set(users); this.loadingStaff.set(false); },
      error: () => this.loadingStaff.set(false)
    });
  }

  private loadCustomers(): void {
    this.loadingCustomers.set(true);
    this.adminSvc.getCustomers().subscribe({
      next: users => { this.customers.set(users); this.loadingCustomers.set(false); },
      error: () => this.loadingCustomers.set(false)
    });
  }

  setTab(tab: 'staff' | 'customers'): void {
    this.activeTab.set(tab);
    this.error.set('');
    this.showCreateForm.set(false);
    this.deleteConfirmId.set(null);
  }

  changeRole(user: UserSummary, role: string): void {
    this.adminSvc.updateRole(user.id, role).subscribe({
      next: () => { user.role = role; },
      error: () => this.error.set(this.i18n.t('admin.errUpdateRole'))
    });
  }

  changeOrgUnit(user: UserSummary, orgUnitId: number | null): void {
    this.adminSvc.setUserOrgUnit(user.id, orgUnitId).subscribe({
      next: () => { user.orgUnitId = orgUnitId; },
      error: (err: any) => this.error.set(err?.error?.message || this.i18n.t('admin.org.errSave'))
    });
  }

  toggleEnabled(user: UserSummary, list: 'staff' | 'customers'): void {
    const next = !user.enabled;
    this.adminSvc.setEnabled(user.id, next).subscribe({
      next: () => { user.enabled = next; },
      error: () => this.error.set(this.i18n.t('admin.errUpdateStatus'))
    });
  }

  submitCreateStaff(): void {
    if (!this.newUser.email || !this.newUser.fullName || !this.newUser.nationalId || !this.newUser.role) return;
    this.creating.set(true);
    this.error.set('');
    this.adminSvc.createStaffUser(this.newUser).subscribe({
      next: () => {
        this.creating.set(false);
        this.showCreateForm.set(false);
        this.newUser = { email: '', fullName: '', nationalId: '', phoneNumber: '', role: 'BANKER', orgUnitId: null };
        this.loadStaff();
      },
      error: (err: any) => {
        this.creating.set(false);
        this.error.set(err?.error?.message || this.i18n.t('admin.errCreate'));
      }
    });
  }

  cancelCreate(): void {
    this.showCreateForm.set(false);
    this.newUser = { email: '', fullName: '', nationalId: '', phoneNumber: '', role: 'BANKER', orgUnitId: null };
    this.error.set('');
  }

  confirmDelete(id: number): void {
    this.deleteConfirmId.set(id);
  }

  cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  executeDelete(id: number): void {
    this.deleting.set(true);
    this.adminSvc.deleteUser(id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteConfirmId.set(null);
        this.customers.set(this.customers().filter(c => c.id !== id));
      },
      error: () => {
        this.deleting.set(false);
        this.error.set(this.i18n.t('admin.errDelete'));
      }
    });
  }

  roleLabel(role: string): string {
    return this.i18n.roleName(role, this.roleRows().find(r => r.code === role)?.label);
  }
}
