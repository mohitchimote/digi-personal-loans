import { Component, OnInit, HostListener, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  FormBuilderService,
  FormKey,
  FormSummary,
  FormVersionSummary,
  FormVersionFull,
  FormVersionSchema,
  FormSection,
  FormSectionHeader,
  FormField,
  FieldType,
  NamedConstant,
} from '../../../core/services/form-builder.service';
import { FieldPickerOption } from './condition-group/condition-group.component';
import { FieldDetailPanelComponent } from './field-detail-panel/field-detail-panel.component';
import { DynamicFieldComponent, EvalContext } from '../../../shared/dynamic-field/dynamic-field.component';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

/** What a canvas drop list's `cdkDropListData` carries — either the fixed field-type palette, or
 * the section header a real field list belongs to. Distinguishes "a new field was dragged in from
 * the drawer" from "an existing field moved between headers" in onCanvasDrop below. */
type CanvasDropData = 'palette' | { headerKey: string };

/** The only section wired up to actually render custom fields on the customer side today (see
 * personal-details.component.ts) — canvas mode only offers the real `app-dynamic-field` preview
 * there; every other section gets a simplified, non-live card. */
const LIVE_PREVIEW_SECTION_KEY = 'personalDetails';

interface NewFieldDraft {
  sectionKey: string;
  sectionHeaderKey: string;
  type: FieldType;
  labelEn: string;
  labelHe: string;
  required: boolean;
}

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'radio', 'checkbox', 'textarea'];

@Component({
  selector: 'app-admin-form-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, TranslatePipe, FieldDetailPanelComponent, DynamicFieldComponent],
  templateUrl: './admin-form-builder.component.html',
  styleUrl: './admin-form-builder.component.scss',
})
export class AdminFormBuilderComponent implements OnInit {
  fieldTypes = FIELD_TYPES;
  livePreviewSectionKey = LIVE_PREVIEW_SECTION_KEY;

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

  // --- Canvas ("try it out") mode: same schema signal above, just a different editing surface.
  // expandedSection doubles as "which section the canvas side-rail is focused on", so switching
  // view modes keeps you on the same section. ---
  viewMode = signal<'list' | 'canvas'>('list');
  canvasFieldModal = signal<{ field: FormField; section: FormSection } | null>(null);
  private canvasControls = new Map<string, FormControl>();
  private canvasValues = signal<Record<string, unknown>>({});
  canvasEvalContext = computed<EvalContext>(() => ({ constants: this.schema()?.constants ?? [], values: this.canvasValues() }));

  isEditable = computed(() => this.activeVersion()?.status === 'DRAFT');
  currentForm = computed(() => this.forms().find((f) => f.formKey === this.selectedFormKey()) ?? null);
  draftVersion = computed(() => this.versions().find((v) => v.status === 'DRAFT') ?? null);
  publishedVersion = computed(() => this.versions().find((v) => v.status === 'PUBLISHED') ?? null);
  archivedVersions = computed(() => this.versions().filter((v) => v.status === 'ARCHIVED'));
  focusedSection = computed(() => this.schema()?.sections.find((s) => s.key === this.expandedSection()) ?? null);
  focusedSectionHeaders = computed(() => [...(this.focusedSection()?.sectionHeaders ?? [])].sort((a, b) => a.order - b.order));

  constructor(private svc: FormBuilderService, public i18n: I18nService) {}

  ngOnInit(): void {
    this.loadForms();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.canvasFieldModal()) this.closeFieldModal();
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
    this.canvasControls.clear();
    this.canvasValues.set({});
    this.canvasFieldModal.set(null);
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
    this.expandedFieldKey.set(this.expandedFieldKey() === field.key ? null : field.key);
  }

  siblingFields(section: FormSection, excludeKey: string): FormField[] {
    return section.fields.filter((f) => f.key !== excludeKey).sort((a, b) => a.order - b.order);
  }

  /** Every field in the form, across every section (a condition can reference any of them, not
   * just same-section siblings — see form-schema-types.ts's condition engine), flattened once per
   * render for the condition-group tree's field pickers. */
  fieldsFlatForPicker(schema: FormVersionSchema): FieldPickerOption[] {
    const out: FieldPickerOption[] = [];
    for (const section of schema.sections) {
      for (const field of section.fields) {
        out.push({ sectionKey: section.key, fieldKey: field.key, label: `${this.sideMenuLabel(section)}: ${this.fieldLabel(field)}` });
      }
    }
    return out;
  }

  // --- Canvas mode: drawer + drag/reorder + double-click popup, editing the same `schema` signal
  // as List mode above (see fieldsFor/moveField/moveHeader) — just through drag gestures instead
  // of buttons, plus the ability to drag a brand-new field in from the type palette. ---

  setViewMode(mode: 'list' | 'canvas'): void {
    this.viewMode.set(mode);
  }

  focusSection(key: string): void {
    this.expandedSection.set(key);
  }

  readonly paletteDropData: CanvasDropData = 'palette';

  headerDropData(header: FormSectionHeader): CanvasDropData {
    return { headerKey: header.key };
  }

  isLivePreviewable(section: FormSection, field: FormField): boolean {
    return section.key === LIVE_PREVIEW_SECTION_KEY && field.kind === 'custom';
  }

  /** A throwaway, canvas-only FormControl per custom field — never touches the real application
   * data. Wired to canvasValues so typing/selecting in the canvas actually re-evaluates other
   * fields' visibility conditions live, mirroring personal-details.component.ts's own
   * recomputeEvalContext pattern (see dynamic-field.component.ts's EvalContext). */
  canvasControlFor(field: FormField): FormControl {
    let control = this.canvasControls.get(field.key);
    if (!control) {
      control = new FormControl(field.type === 'checkbox' ? false : '');
      control.valueChanges.subscribe((value) => {
        this.canvasValues.set({ ...this.canvasValues(), [`${LIVE_PREVIEW_SECTION_KEY}.${field.key}`]: value });
      });
      this.canvasControls.set(field.key, control);
    }
    return control;
  }

  openFieldModal(field: FormField, section: FormSection): void {
    if (field.kind !== 'custom' || !this.isEditable()) return;
    this.canvasFieldModal.set({ field, section });
  }

  closeFieldModal(): void {
    this.canvasFieldModal.set(null);
  }

  onCanvasDrop(event: CdkDragDrop<CanvasDropData, CanvasDropData, FieldType>, section: FormSection, header: FormSectionHeader): void {
    if (!this.isEditable()) return;
    if (event.previousContainer.data === 'palette') {
      const type = event.item.data;
      const key = `field${Date.now()}`;
      const newField: FormField = {
        key,
        sectionHeaderKey: header.key,
        kind: 'custom',
        type,
        label: { en: 'New field', he: 'שדה חדש' },
        required: false,
        order: 0,
      };
      const siblings = this.fieldsFor(section, header.key);
      siblings.splice(event.currentIndex, 0, newField);
      section.fields.push(newField);
      this.reorderFields(siblings);
      this.touch();
      this.openFieldModal(newField, section);
      return;
    }

    if (event.previousContainer === event.container) {
      const siblings = this.fieldsFor(section, header.key);
      moveItemInArray(siblings, event.previousIndex, event.currentIndex);
      this.reorderFields(siblings);
      this.touch();
      return;
    }

    // Cross-header move within the same section — the connected drop-list group below never
    // spans sections, so `previousContainer` is always another header of this same section.
    const fromHeaderKey = (event.previousContainer.data as { headerKey: string }).headerKey;
    const fromSiblings = this.fieldsFor(section, fromHeaderKey);
    const [moved] = fromSiblings.splice(event.previousIndex, 1);
    if (!moved) return;
    moved.sectionHeaderKey = header.key;
    const toSiblings = this.fieldsFor(section, header.key);
    toSiblings.splice(event.currentIndex, 0, moved);
    this.reorderFields(fromSiblings);
    this.reorderFields(toSiblings);
    this.touch();
  }

  private reorderFields(fields: FormField[]): void {
    fields.forEach((f, i) => (f.order = i));
  }

  // --- Form-level named constants (e.g. "standardRetirementAge") a condition can reference by
  // key instead of hardcoding a literal — see form-schema-types.ts's namedConstantSchema. ---

  addConstant(schema: FormVersionSchema): void {
    if (!schema.constants) schema.constants = [];
    schema.constants.push({ key: '', label: '', value: 0 });
    this.touch();
  }

  removeConstant(schema: FormVersionSchema, index: number): void {
    schema.constants?.splice(index, 1);
    this.touch();
  }

  setConstantField(constant: NamedConstant, key: 'key' | 'label', raw: string): void {
    constant[key] = raw;
    this.touch();
  }

  setConstantValue(constant: NamedConstant, raw: string): void {
    constant.value = Number(raw) || 0;
    this.touch();
  }

  touch(): void {
    this.saved.set(false);
    // Trigger change detection for the signal by reassigning a shallow copy of the root object.
    const current = this.schema();
    if (current) this.schema.set({ ...current });
  }
}
