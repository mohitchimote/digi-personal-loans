import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormField } from '../../core/services/form-builder.service';
import { I18nService } from '../../core/i18n/i18n.service';

// Renders the admin-authored tooltip/help text for one `kind: "existing"` (hardcoded) field —
// the same rendering DynamicFieldComponent gives `kind: "custom"` fields for free. Drop
// `<app-field-help [field]="fieldDef('someKey')" />` right after a hardcoded field's <label>.
@Component({
  selector: 'app-field-help',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './field-help.component.html',
})
export class FieldHelpComponent {
  @Input() field: FormField | undefined;

  constructor(public i18n: I18nService) {}

  get tooltip(): string {
    if (!this.field?.tooltip) return '';
    return this.i18n.lang() === 'he' ? this.field.tooltip.he : this.field.tooltip.en;
  }

  get helpText(): string {
    if (!this.field?.helpText) return '';
    return this.i18n.lang() === 'he' ? this.field.helpText.he : this.field.helpText.en;
  }
}
