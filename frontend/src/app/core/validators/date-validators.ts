import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const MIN_YEAR = 1900;

/** Guards against the native `<input type="date">` year-segment overflow some Chromium builds
 * allow (typing/scrolling past 4 digits produces a value like 2000-09-09 -> 20000-09-09).
 * `<input>` `min`/`max` attributes reduce how often this happens but don't fully prevent typed
 * input, so this is the actual enforcement point. */
export function yearRangeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) return null;
    const year = new Date(value).getFullYear();
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < MIN_YEAR || year > currentYear) {
      return { invalidYear: true };
    }
    return null;
  };
}

/** Cross-field group validator: an ID can't have been issued before its holder was born. */
export function idIssueNotBeforeDobValidator(dobField = 'dateOfBirth', issueField = 'idIssueDate'): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const dob = group.get(dobField)?.value;
    const issue = group.get(issueField)?.value;
    if (!dob || !issue) return null;
    return new Date(issue) < new Date(dob) ? { idIssueBeforeDob: true } : null;
  };
}
