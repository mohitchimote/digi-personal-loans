import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AssistContextService } from '../../../core/services/assist-context.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { StaffHeaderComponent, StaffNavItem } from '../../../shared/staff-header/staff-header.component';

@Component({
  selector: 'app-banker-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TranslatePipe, StaffHeaderComponent],
  templateUrl: './banker-shell.component.html',
  styleUrl: './banker-shell.component.scss'
})
export class BankerShellComponent {
  navItems: StaffNavItem[] = [
    { labelKey: 'staffHome.homeTab', route: '/banker/home' },
    { labelKey: 'banker.queueTitle', route: '/banker/queue' },
  ];

  constructor(public auth: AuthService, public assist: AssistContextService, private router: Router) {}

  exitAssist(): void {
    const appRef = this.assist.current?.appRef;
    this.assist.stop();
    if (appRef) this.router.navigate(['/banker/case', appRef]);
  }
}
