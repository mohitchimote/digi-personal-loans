import { Component, DoCheck, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { FormField } from '../../core/services/form-builder.service';
import { FormFieldOptionsService } from '../../core/services/form-field-options.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../pipes/translate.pipe';

/**
 * One address-style pick-list input driven by its form-field definition. The screen hands in the field's
 * definition (from the application's form schema) and the control; where the options come from, whether it
 * cascades from another field, and what a stored value means are all decided by the definition.
 *
 *  - Cascading: when the field it depends on (`parent`) changes to another value, this control is cleared.
 *  - Old records hold display text ("Israel", "Tel Aviv"): once options are in, a stored value is mapped to
 *    its code. A value that matches nothing is cleared when the options are a complete list, so a required
 *    field asks again; free text is kept where the master has nothing for that parent.
 *  - A master with nothing under the chosen parent (a country without states, a state without cities)
 *    falls back to a text box, so the customer is never stuck. The server accepts free text there too.
 *  - A definition that has no options at all (a form not yet re-published) renders as a text box.
 */
@Component({
  selector: 'app-field-select',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  template: `
    <ng-container *ngIf="control">
      <select *ngIf="mode() === 'select'" class="db-select" [formControl]="$any(control)">
        <option value="">{{ placeholder || ('common.select' | translate) }}</option>
        <option *ngFor="let o of options()" [value]="o.value">{{ opts.localised(o) }}</option>
      </select>
      <select *ngIf="mode() === 'wait'" class="db-select" [attr.disabled]="true">
        <option value="">{{ waitingText || ('common.select' | translate) }}</option>
      </select>
      <input *ngIf="mode() === 'text'" class="db-input" type="text" [formControl]="$any(control)" [attr.autocomplete]="autocomplete || null" />
    </ng-container>
  `,
})
export class FieldSelectComponent implements OnChanges, DoCheck {
  @Input() field: FormField | undefined;
  @Input() control: AbstractControl | null = null;
  /** Current value of the field this one depends on, if it does. */
  @Input() parent: unknown;
  @Input() placeholder = '';
  /** Shown (disabled) while the parent has no value yet. */
  @Input() waitingText = '';
  @Input() autocomplete = '';

  private lastParent: string | undefined;

  constructor(public opts: FormFieldOptionsService, private i18n: I18nService) {}

  options() { return this.opts.options(this.field, this.parent); }

  private dependsOn(): boolean {
    return !!(this.field?.optionsSource?.dependsOn || this.field?.optionsDependOn);
  }

  mode(): 'select' | 'wait' | 'text' {
    if (!this.opts.isPickList(this.field)) return 'text';
    if (this.dependsOn() && !this.parentText()) return 'wait';
    this.options(); // asking is what makes the service fetch the list
    if (!this.opts.loaded(this.field, this.parent)) return this.control?.value ? 'select' : 'wait';
    // Loaded but empty under this parent: nothing to pick from, so free text.
    return this.options().length ? 'select' : 'text';
  }

  private parentText(): string { return this.parent == null ? '' : String(this.parent); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['parent']) {
      const now = this.parentText();
      // Only a change from one chosen parent to another clears the child; loading a saved record
      // (parent goes from empty to its value) must not wipe the saved child.
      if (this.lastParent && now !== this.lastParent && this.control?.value) this.control.setValue('');
      this.lastParent = now;
    }
  }

  ngDoCheck(): void { this.reconcile(); }

  private reconcile(): void {
    const c = this.control;
    if (!c || !c.value || !this.opts.isPickList(this.field)) return;
    if (this.dependsOn() && !this.parentText()) return;
    if (!this.opts.loaded(this.field, this.parent)) return;
    const options = this.options();
    if (!options.length) return;
    const fixed = this.opts.normalise(this.field, c.value, this.parent);
    if (fixed === null) {
      // Not one of the choices. Clear it so the (required) field asks again.
      c.setValue('', { emitEvent: false });
    } else if (fixed !== c.value) {
      c.setValue(fixed, { emitEvent: false });
    }
  }
}
