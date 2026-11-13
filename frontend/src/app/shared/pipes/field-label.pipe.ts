import { Pipe, PipeTransform } from '@angular/core';
import { FormVersionSchema, fieldIn } from '../../core/services/form-builder.service';
import { FormFieldOptionsService } from '../../core/services/form-field-options.service';

/**
 * Shows the name of a stored value for a form field, in the current language, using the form definition:
 *   {{ income.employmentStatus | fieldLabel:application()?.formSchema:'incomeEmployment':'employmentStatus' }}
 * The screen names a field of the form, never a master. Impure on purpose: the lists load after first
 * render and the language can change, and both must update the text.
 */
@Pipe({ name: 'fieldLabel', standalone: true, pure: false })
export class FieldLabelPipe implements PipeTransform {
  constructor(private options: FormFieldOptionsService) {}

  transform(value: unknown, schema: FormVersionSchema | null | undefined, section: string, key: string, parentValue?: unknown): string {
    if (value == null || value === '') return '';
    return this.options.label(fieldIn(schema, section, key), value, parentValue);
  }
}
