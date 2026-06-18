import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '../../core/services/application.service';
import { UnderwritingNote } from '../../core/models';
import { TranslatePipe } from '../pipes/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';

const FEEDBACK_TYPES = ['SEND_BACK', 'CLARIFICATION_REQUEST', 'DOCUMENT_REQUEST', 'DECISION_DECLINED'];

@Component({
  selector: 'app-application-aside',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './application-aside.component.html',
  styleUrl: './application-aside.component.scss'
})
export class ApplicationAsideComponent {
  notes = signal<UnderwritingNote[]>([]);
  @Input() tip = '';

  constructor(private appSvc: ApplicationService, private i18n: I18nService) {}

  @Input() set appRef(value: string) {
    if (!value) return;
    this.appSvc.getNotes(value).subscribe({
      next: notes => this.notes.set(notes.filter(n => FEEDBACK_TYPES.includes(n.noteType))),
      error: () => {}
    });
  }

  get defaultTip(): string {
    return this.tip || this.i18n.t('aside.defaultTip');
  }

  noteTypeLabel(type: string): string {
    return this.i18n.t('aside.noteType.' + type);
  }
}
