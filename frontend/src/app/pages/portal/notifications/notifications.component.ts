import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { Notification } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent implements OnInit {
  items   = signal<Notification[]>([]);
  loading = signal(true);

  constructor(
    private notifSvc: NotificationService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    if (!userId) return;

    this.notifSvc.getAll(userId).subscribe({
      next: list => { this.items.set(list); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  markRead(notif: Notification): void {
    if (notif.read) return;
    this.notifSvc.markRead(notif.id).subscribe({
      next: updated => {
        this.items.update(list => list.map(n => n.id === updated.id ? updated : n));
        this.notifSvc.refreshCount(this.auth.userId!);
      }
    });
  }

  markAllRead(): void {
    const userId = this.auth.userId;
    if (!userId) return;
    this.notifSvc.markAllRead(userId).subscribe({
      next: () => {
        this.items.update(list => list.map(n => ({ ...n, read: true })));
        this.notifSvc.refreshCount(userId);
      }
    });
  }

  get unreadCount(): number { return this.items().filter(n => !n.read).length; }

  typeIcon(type: string): string {
    switch (type) {
      case 'WELCOME':            return 'celebration';
      case 'APPLICATION_UPDATE': return 'assignment';
      case 'APPROVAL':           return '✅';
      case 'DOCUMENT_READY':     return 'description';
      case 'REMINDER':           return 'notifications';
      default: return 'chat_bubble';
    }
  }
}
