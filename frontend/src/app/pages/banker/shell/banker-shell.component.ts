import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AssistContextService } from '../../../core/services/assist-context.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../../shared/language-switcher/language-switcher.component';

@Component({
  selector: 'app-banker-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './banker-shell.component.html',
  styleUrl: './banker-shell.component.scss'
})
export class BankerShellComponent {
  constructor(public auth: AuthService, public assist: AssistContextService, private router: Router) {}

  exitAssist(): void {
    const appRef = this.assist.current?.appRef;
    this.assist.stop();
    if (appRef) this.router.navigate(['/banker/case', appRef]);
  }
}
