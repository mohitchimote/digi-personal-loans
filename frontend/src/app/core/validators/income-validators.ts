import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Net pay can never exceed gross pay — flags the group if a customer (or banker) enters figures
 * the wrong way round. Skips the check while either field is empty so it doesn't fire before both
 * are filled in. */
export function netNotGreaterThanGrossValidator(grossField = 'monthlyGrossIncome', netField = 'monthlyNetIncome'): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const gross = group.get(grossField)?.value;
    const net = group.get(netField)?.value;
    if (gross === null || gross === undefined || gross === '' || net === null || net === undefined || net === '') return null;
    return Number(net) > Number(gross) ? { netExceedsGross: true } : null;
  };
}
