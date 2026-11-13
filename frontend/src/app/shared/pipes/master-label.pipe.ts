import { Pipe, PipeTransform } from '@angular/core';
import { MasterListsService } from '../../core/services/master-lists.service';

/**
 * Shows the name of a stored master value in the current language:
 *   {{ income.employmentStatus | masterLabel:'employment_status' }}
 * Works for a code and for legacy text saved before the field used a master. Impure on purpose: the
 * list loads after first render and the language can change, and both must update the text.
 */
@Pipe({ name: 'masterLabel', standalone: true, pure: false })
export class MasterLabelPipe implements PipeTransform {
  constructor(private lists: MasterListsService) {}

  transform(value: unknown, type: string): string {
    if (value == null || value === '') return '';
    this.lists.load([type]);
    return this.lists.label(type, value);
  }
}
