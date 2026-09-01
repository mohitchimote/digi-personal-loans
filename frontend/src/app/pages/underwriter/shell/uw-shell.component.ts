import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StaffHeaderComponent, StaffNavItem } from '../../../shared/staff-header/staff-header.component';

@Component({
  selector: 'app-uw-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, StaffHeaderComponent],
  templateUrl: './uw-shell.component.html',
  styleUrl: './uw-shell.component.scss'
})
export class UwShellComponent {
  navItems: StaffNavItem[] = [
    { labelKey: 'staffHome.homeTab', route: '/underwriter/home' },
    { labelKey: 'uw.casePipeline', route: '/underwriter/pipeline' },
  ];

  constructor(public auth: AuthService) {}
}
