import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-uw-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: './uw-shell.component.html',
  styleUrl: './uw-shell.component.scss'
})
export class UwShellComponent {
  constructor(public auth: AuthService) {}
}
