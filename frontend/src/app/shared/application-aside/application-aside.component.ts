import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '../../core/services/application.service';
import { UnderwritingNote } from '../../core/models';

const FEEDBACK_TYPES = ['SEND_BACK', 'CLARIFICATION_REQUEST', 'DOCUMENT_REQUEST', 'DECISION_DECLINED'];

@Component({
  selector: 'app-application-aside',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './application-aside.component.html',
  styleUrl: './application-aside.component.scss'
})
export class ApplicationAsideComponent {
  notes = signal<UnderwritingNote[]>([]);
  @Input() tip = "Need help? Our advisors are available Sunday–Thursday, 08:00–18:00 Israel time on +972-3-123.";

  constructor(private appSvc: ApplicationService) {}

  @Input() set appRef(value: string) {
    if (!value) return;
    this.appSvc.getNotes(value).subscribe({
      next: notes => this.notes.set(notes.filter(n => FEEDBACK_TYPES.includes(n.noteType))),
      error: () => {}
    });
  }

  noteTypeLabel(type: string): string {
    switch (type) {
      case 'SEND_BACK': return 'Sent Back';
      case 'CLARIFICATION_REQUEST': return 'Clarification Needed';
      case 'DOCUMENT_REQUEST': return 'Document Required';
      case 'DECISION_DECLINED': return 'Declined';
      default: return type;
    }
  }
}
