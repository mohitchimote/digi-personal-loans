import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { ADMIN_NAV } from '../shell/admin-nav';

/** Admin landing page: a map of everything configurable, grouped the same way as the left rail. */
@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './admin-home.component.html',
  styleUrl: './admin-home.component.scss'
})
export class AdminHomeComponent {
  readonly nav = ADMIN_NAV;
}
