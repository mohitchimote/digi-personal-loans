import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Notification } from '../models';

const API = 'http://localhost:8080/api/notifications';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  unreadCount = signal<number>(0);

  constructor(private http: HttpClient) {}

  getAll(customerId: number): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${API}/customer/${customerId}`);
  }

  refreshCount(customerId: number): void {
    this.http.get<{ count: number }>(`${API}/customer/${customerId}/unread-count`)
      .subscribe(r => this.unreadCount.set(r.count));
  }

  markRead(id: number): Observable<Notification> {
    return this.http.put<Notification>(`${API}/${id}/read`, {});
  }

  markAllRead(customerId: number): Observable<void> {
    return this.http.put<void>(`${API}/customer/${customerId}/read-all`, {}).pipe(
      tap(() => this.unreadCount.set(0))
    );
  }

  seedWelcome(customerId: number): Observable<void> {
    return this.http.post<void>(`${API}/customer/${customerId}/seed-welcome`, {});
  }
}
