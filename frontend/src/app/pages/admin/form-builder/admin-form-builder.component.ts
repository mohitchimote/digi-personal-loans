import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FormBuilderService,
  FormKey,
  FormSummary,
  FormVersionSummary,
  FormVersionFull,
  FormVersionSchema,
  FormSection,
  FormField,
  FieldType,
  BilingualLabel,
  VisibilityRule,
} from '../../../core/services/form-builder.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

interface NewFieldDraft {
  sectionKey: string;
  sectionHeaderKey: string;
  type: FieldType;
  labelEn: string;
  labelHe: string;
  required: boolean;
}

type VisibilityValueType = 'boolean' | 'text' | 'number';
type BilingualProp = 'label' | 'helpText' | 'tooltip';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'radio', 'checkbox', 'textarea'];
const OPTION_TYPES: FieldType[] = ['select', 'radio'];
const VALIDATION_TYPES: FieldType[] = ['text', 'number', 'textarea'];

@Component({
  selector: 'app-admin-form-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-form-builder.component.html',
  styleUrl: './admin-form-builder.component.scss',
})
export class AdminFormBuilderComponent implements OnInit {
  fieldTypes = FIELD_TYPES;
  optionTypes = OPTION_TYPES;
  validationTypes = VALIDATION_TYPES;

  forms = signal<FormSummary[]>([]);
  versions = signal<FormVersionSummary[]>([]);
  selectedFormKey = signal<FormKey>('personal-loan-wizard');
  activeVersion = signal<FormVersionFull | null>(null);
  schema = signal<FormVersionSchema | null>(null);
  changeNote = '';

  loading = signal(true);
  saving = signal(false);
  publishing = signal(false);
  publishConfirm = signal(false);
  error = signal('');
  saved = signal(false);

  expandedSection = signal<string | null>(null);
  expandedFieldKey = signal<string | null>(null);
  newFieldDraft = signal<NewFieldDraft | null>(null);

  isEditable = computed(() => this.activeVersion()?.status === 'DRAFT');
  currentForm = computed(() => this.forms().find((f) => f.formKey === this.selectedFormKey()) ?? null);
  draftVersion = computed(() => this.versions().find((v) => v.status === 'DRAFT') ?? null);
  publishedVersion = computed(() => this.versions().find((v) => v.status === 'PUBLISHED') ?? null);
  archivedVersions = computed(() => this.versions().filter((v) => v.status === 'ARCHIVED'));

  constructor(private svc: FormBuilderService, public i18n: I18nService) {}

  ngOnInit(): void {
    this.loadForms();
  }

  private loadForms(): void {
    this.loading.set(true);
    this.svc.listForms().subscribe({
      next: (forms) => {
        this.forms.set(forms);
        this.loadVersions();
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.i18n.t('admin.errLoadFormBuilder'));
      },
    });
  }

  selectForm(formKey: FormKey): void {
    if (formKey === this.selectedFormKey()) return;
    this.selectedFormKey.set(formKey);
    this.activeVersion.set(null);
    this.schema.set(null);
    this.loadVersions();
  }

  private loadVersions(): void {
    this.loading.set(true);
    this.error.set('');
    this.svc.listVersions(this.selectedFormKey()).subscribe({
      next: (versions) => {
        this.versions.set(versions);
        const preferred = versions.find((v) => v.status === 'DRAFT') ?? versions.find((v) => v.status === 'PUBLISHED') ?? versions[0] ?? null;
        if (preferred) {
          this.openVersion(preferred.id);
        } else {
          this.loading.set(false);
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.i18n.t('admin.errLoadFormBuilder'));
      },
    });
  }

  openVersion(id: number): void {
    this.loading.set(true);
    this.error.set('');
    this.saved.set(false);
    this.svc.getVersion(id).subscribe({
      next: (version) => {
        this.activeVersion.set(version);
        this.changeNote = version.changeNote ?? '';
        try {
          const parsed = JSON.parse(version.schemaJson) as FormVersionSchema;
          this.schema.set(parsed);
          if (!this.expandedSection() && parsed.sections.length) {
            this.expandedSection.set(parsed.sections[0].key);
          }
        } catch {
          this.error.set(this.i18n.t('admin.errParseFormSchema'));
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.i18n.t('admin.errLoadFormBuilder'));
      },
    });
  }

  toggleSection(key: string): void {
    this.expandedSection.set(this.expandedSection() === key ? null : key);
  }

  fieldsFor(section: FormSection, headerKey: string): FormField[] {
    return section.fields.filter((f) => f.sectionHeaderKey === headerKey).sort((a, b) => a.order - b.order);
  }

  // Inline `label` (an admin-authored override) now wins over `labelKey` — otherwise editing the
  // label of an `existing` field in the detail panel below would never actually change what's
  // displayed, since labelKey would keep winning.
  fieldLabel(field: FormField): string {
    if (field.label) return this.i18n.lang() === 'he' ? field.label.he : field.label.en;
    if (field.labelKey) return this.i18n.t(field.labelKey);
    return field.key;
  }

  headerLabel(section: FormSection, headerKey: string): string {
    const header = section.sectionHeaders.find((h) => h.key === headerKey);
    if (!header) return headerKey;
    if (header.labelKey) return this.i18n.t(header.labelKey);
    if (header.label) return this.i18n.lang() === 'he' ? header.label.he : header.label.en;
    return header.key;
  }

  sideMenuLabel(section: FormSection): string {
    return this.i18n.t(section.sideMenuLabelKey);
  }

  // --- Draft lifecycle ---

  createDraft(): void {
    this.saving.set(true);
    this.error.set('');
    this.svc.createDraft(this.selectedFormKey(), this.activeVersion()?.id ?? null).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.loadVersions();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || this.i18n.t('admin.errSaveFormVersion'));
      },
    });
  }

  saveDraft(): void {
    const version = this.activeVersion();
    const schema = this.schema();
    if (!version || !schema) return;
    this.saving.set(true);
    this.error.set('');
    this.saved.set(false);
    this.svc.saveDraft(version.id, JSON.stringify(schema), this.changeNote || null).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.loadVersions();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || this.i18n.t('admin.errSaveFormVersion'));
      },
    });
  }

  discardDraft(): void {
    const version = this.activeVersion();
    if (!version) return;
    this.saving.set(true);
    this.svc.discardDraft(version.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.loadVersions();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || this.i18n.t('admin.errSaveFormVersion'));
      },
    });
  }

  requestPublish(): void {
    this.publishConfirm.set(true);
  }

  cancelPublish(): void {
    this.publishConfirm.set(false);
  }

  confirmPublish(): void {
    const version = this.activeVersion();
    const schema = this.schema();
    if (!version || !schema) return;
    this.publishing.set(true);
    this.error.set('');
    // Publish always saves the current working copy first — publishing without this would
    // silently ship whatever was last *saved*, not what's on screen, the instant an admin edits
    // a field and clicks Publish without an intermediate Save Draft. One save, then publish.
    this.svc.saveDraft(version.id, JSON.stringify(schema), this.changeNote || null).subscribe({
      next: () => {
        this.svc.publish(version.id).subscribe({
          next: () => {
            this.publishing.set(false);
            this.publishConfirm.set(false);
            this.loadVersions();
          },
          error: (err) => {
            this.publishing.set(false);
            this.publishConfirm.set(false);
            this.error.set(err?.error?.message || this.i18n.t('admin.errPublishFormVersion'));
          },
        });
      },
      error: (err) => {
        this.publishing.set(false);
        this.publishConfirm.set(false);
        this.error.set(err?.error?.message || this.i18n.t('admin.errSaveFormVersion'));
      },
    });
  }

  // --- Schema editing (working copy only — nothing persists until Save Draft) ---

  moveField(section: FormSection, field: FormField, direction: -1 | 1): void {
    const siblings = this.fieldsFor(section, field.sectionHeaderKey);
    const idx = siblings.indexOf(field);
    const swapWith = siblings[idx + direction];
    if (!swapWith) return;
    const tmp = field.order;
    field.order = swapWith.order;
    swapWith.order = tmp;
    this.touch();
  }

  moveHeader(section: FormSection, headerKey: string, direction: -1 | 1): void {
    const headers = [...section.sectionHeaders].sort((a, b) => a.order - b.order);
    const idx = headers.findIndex((h) => h.key === headerKey);
    const swapWith = headers[idx + direction];
    const current = headers[idx];
    if (!swapWith || !current) return;
    const tmp = current.order;
    current.order = swapWith.order;
    swapWith.order = tmp;
    this.touch();
  }

  toggleRequired(field: FormField): void {
    field.required = !field.required;
    this.touch();
  }

  toggleHidden(field: FormField): void {
    field.hidden = !field.hidden;
    this.touch();
  }

  removeCustomField(section: FormSection, field: FormField): void {
    if (field.kind !== 'custom') return;
    section.fields = section.fields.filter((f) => f !== field);
    if (this.expandedFieldKey() === field.key) this.expandedFieldKey.set(null);
    this.touch();
  }

  startNewField(sectionKey: string, headerKey: string): void {
    this.newFieldDraft.set({ sectionKey, sectionHeaderKey: headerKey, type: 'text', labelEn: '', labelHe: '', required: false });
  }

  cancelNewField(): void {
    this.newFieldDraft.set(null);
  }

  addNewField(section: FormSection): void {
    const draft = this.newFieldDraft();
    if (!draft || draft.sectionKey !== section.key) return;
    if (!draft.labelEn.trim() || !draft.labelHe.trim()) {
      this.error.set(this.i18n.t('admin.errFieldLabelRequired'));
      return;
    }
    const key = this.slugify(draft.labelEn);
    if (section.fields.some((f) => f.key === key)) {
      this.error.set(this.i18n.t('admin.errFieldKeyTaken'));
      return;
    }
    const siblings = this.fieldsFor(section, draft.sectionHeaderKey);
    const nextOrder = (siblings[siblings.length - 1]?.order ?? 0) + 1;
    section.fields.push({
      key,
      sectionHeaderKey: draft.sectionHeaderKey,
      kind: 'custom',
      type: draft.type,
      label: { en: draft.labelEn.trim(), he: draft.labelHe.trim() },
      required: draft.required,
      order: nextOrder,
    });
    this.newFieldDraft.set(null);
    this.error.set('');
    this.touch();
    // Open the new field straight into the detail panel — help text, tooltip, options,
    // validation and visibility are all edited there, not duplicated into this "add" form too.
    this.expandedFieldKey.set(key);
  }

  private slugify(text: string): string {
    return (
      text
        .trim()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^[A-Z]/, (c) => c.toLowerCase())
        .replace(/[^a-zA-Z0-9]/g, '') || `field${Date.now()}`
    );
  }

  // --- Field detail panel (label overrides, help text, tooltip, options, validation, visibility) ---

  isFieldExpanded(field: FormField): boolean {
    return this.expandedFieldKey() === field.key;
  }

  toggleFieldExpand(field: FormField): void {
    if (this.expandedFieldKey() === field.key) {
      this.expandedFieldKey.set(null);
      return;
    }
    if (field.kind === 'custom') {
      if (OPTION_TYPES.includes(field.type!) && !field.options) field.options = [];
      if (VALIDATION_TYPES.includes(field.type!) && !field.validation) field.validation = {};
    }
    this.expandedFieldKey.set(field.key);
  }

  hasOptions(field: FormField): boolean {
    return field.kind === 'custom' && !!field.type && OPTION_TYPES.includes(field.type);
  }

  hasValidation(field: FormField): boolean {
    return field.kind === 'custom' && !!field.type && VALIDATION_TYPES.includes(field.type);
  }

  bilingualValue(field: FormField, prop: BilingualProp, lang: 'en' | 'he'): string {
    return field[prop]?.[lang] ?? '';
  }

  setBilingual(field: FormField, prop: BilingualProp, lang: 'en' | 'he', value: string): void {
    const current: BilingualLabel = field[prop] ?? { en: '', he: '' };
    field[prop] = { ...current, [lang]: value };
    this.touch();
  }

  siblingFields(section: FormSection, excludeKey: string): FormField[] {
    return section.fields.filter((f) => f.key !== excludeKey).sort((a, b) => a.order - b.order);
  }

  visibilityTriggerLabel(section: FormSection, field: FormField): string {
    const rule = field.visibility;
    if (!rule) return '';
    const trigger = section.fields.find((f) => f.key === rule.fieldKey);
    return trigger ? this.fieldLabel(trigger) : rule.fieldKey;
  }

  toggleVisibility(field: FormField, section: FormSection): void {
    if (field.visibility) {
      field.visibility = null;
    } else {
      const sibling = this.siblingFields(section, field.key)[0];
      field.visibility = { fieldKey: sibling?.key ?? '', op: 'equals', value: true };
    }
    this.touch();
  }

  setVisibilityField(field: FormField, fieldKey: string): void {
    if (!field.visibility) return;
    field.visibility = { ...field.visibility, fieldKey };
    this.touch();
  }

  setVisibilityOp(field: FormField, op: VisibilityRule['op']): void {
    if (!field.visibility) return;
    field.visibility = { ...field.visibility, op };
    this.touch();
  }

  visibilityValueType(field: FormField): VisibilityValueType {
    const v = field.visibility?.value;
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return 'text';
    return 'boolean';
  }

  setVisibilityValueType(field: FormField, type: VisibilityValueType): void {
    if (!field.visibility) return;
    const value = type === 'boolean' ? true : type === 'number' ? 0 : '';
    field.visibility = { ...field.visibility, value };
    this.touch();
  }

  setVisibilityBoolValue(field: FormField, value: boolean): void {
    if (!field.visibility) return;
    field.visibility = { ...field.visibility, value };
    this.touch();
  }

  setVisibilityRawValue(field: FormField, raw: string): void {
    if (!field.visibility) return;
    const type = this.visibilityValueType(field);
    const value = type === 'number' ? Number(raw) || 0 : raw;
    field.visibility = { ...field.visibility, value };
    this.touch();
  }

  addOption(field: FormField): void {
    if (!field.options) field.options = [];
    field.options.push({ value: '', label: { en: '', he: '' } });
    this.touch();
  }

  removeOption(field: FormField, index: number): void {
    field.options?.splice(index, 1);
    this.touch();
  }

  setOptionField(opt: { value: string; label: BilingualLabel }, key: 'value' | 'labelEn' | 'labelHe', raw: string): void {
    if (key === 'value') opt.value = raw;
    else if (key === 'labelEn') opt.label.en = raw;
    else opt.label.he = raw;
    this.touch();
  }

  setValidationField(field: FormField, key: 'min' | 'max' | 'minLength' | 'maxLength', raw: string): void {
    if (!field.validation) field.validation = {};
    const num = raw === '' ? undefined : Number(raw);
    field.validation = { ...field.validation, [key]: num };
    this.touch();
  }

  setValidationPattern(field: FormField, raw: string): void {
    if (!field.validation) field.validation = {};
    field.validation = { ...field.validation, pattern: raw || undefined };
    this.touch();
  }

  private touch(): void {
    this.saved.set(false);
    // Trigger change detection for the signal by reassigning a shallow copy of the root object.
    const current = this.schema();
    if (current) this.schema.set({ ...current });
  }
}
