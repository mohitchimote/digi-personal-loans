import { z } from "zod";

// The shape stored in form_versions.schemaJson (see admin-form-builder.ts / form-versions.ts).
// One version of one form (personal-loan-wizard | business-loan-wizard) — sections, their
// sub-headers, and their fields, in display order. This is deliberately a metadata/ordering layer
// over the wizard, not a replacement for it: existing (kind: "existing") fields still render via
// their real hardcoded Angular component and validate via their real Zod schema in
// section-schemas.ts — the schema here only carries their label/required/order/visibility. Only
// kind: "custom" fields (admin-added, no pre-existing business logic) carry a `type` and render
// generically via DynamicFieldComponent. A small, explicitly-named set of existing fields
// (personalDetails' maritalStatus/nationality/preferredBranch/staffName) is the one exception:
// they also carry admin-editable `options`/`optionsDependOn` (see below) while still rendering
// through their real Angular inputs — the admin UI's own allowlist decides which existing fields
// this applies to, this schema layer just needs to be able to carry the data when present.

export const FIELD_TYPES = ["text", "number", "date", "select", "radio", "checkbox", "textarea"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const bilingualLabelSchema = z.object({ en: z.string(), he: z.string() }).strict();

const fieldOptionSchema = z
  .object({ value: z.string(), label: bilingualLabelSchema })
  .strict();

// A field's options can be filtered down based on another field's *currently selected* value —
// e.g. staffName's valid choices depend on which preferredBranch was picked. `map` is keyed by
// the trigger field's own option `value`, listing which of THIS field's own option `value`s are
// valid for that trigger value. Deliberately picker-driven data, not a condition tree: the admin
// UI builds this from a table (trigger options x own options), never freehand text, since that's
// exactly the typo-prone shape the general AND/OR visibility engine would have forced otherwise.
const optionsDependOnSchema = z
  .object({ fieldKey: z.string(), map: z.record(z.string(), z.array(z.string())) })
  .strict();

// A field's options can instead come from a master (reference data defined once, see lib/masters.ts)
// rather than a typed `options` list. The stored/submitted value is then the master item's `code`.
// `dependsOn` makes it a cascade: the field offers only the items whose parent is the item currently
// chosen in an earlier field of the same section (e.g. State depends on Country, City on State). That
// earlier field must itself be sourced from the master that is this master's parent.
const optionsSourceSchema = z
  .object({
    master: z.string().min(1),
    dependsOn: z.object({ fieldKey: z.string() }).strict().optional(),
    // Store this attribute of the chosen item instead of its code. For a bank's branches the stored value
    // is the branch number ("800"), which is what a direct-debit mandate needs, not the item code ("10-800").
    valueAttribute: z.string().optional(),
  })
  .strict();

// --- Visibility condition engine ------------------------------------------------------
//
// A field's `visibility` gates whether it's shown/required right now. Three shapes are
// accepted (see `visibilityNodeSchema`): the legacy single same-section equality rule
// (kept forever so already-published schemas never need migrating), a single condition,
// or a recursive AND/OR group of conditions. Conditions compare two "operands" — a field
// anywhere in the form (any section, including ones later in the wizard — data not yet
// entered simply makes the condition false, never an error), a named form-level constant,
// a literal, or a small computed value (currently: age from a date field, optionally
// projected forward by another field's value) — with a comparison or membership operator.
//
// This whole block is pure/dependency-free (no framework, no DB) so it can be mirrored
// verbatim on the frontend (see dynamic-field.component.ts) exactly like the previous,
// simpler version of this function already was — keep the two in sync by hand.

const fieldRefSchema = z.object({ sectionKey: z.string(), fieldKey: z.string() }).strict();

const computedOperandSchema = z
  .object({
    kind: z.literal("computed"),
    fn: z.literal("age"), // more helpers can be added later as new literal `fn` values
    dateField: fieldRefSchema,
    offsetField: fieldRefSchema.optional(),
    offsetUnit: z.enum(["months", "years"]).optional(),
  })
  .strict();

const scalarOperandSchema = z.union([
  z.object({ kind: z.literal("literal"), value: z.union([z.string(), z.number(), z.boolean()]) }).strict(),
  z.object({ kind: z.literal("field") }).merge(fieldRefSchema).strict(),
  z.object({ kind: z.literal("constant"), key: z.string() }).strict(),
  computedOperandSchema,
]);

const listOperandSchema = z
  .object({ kind: z.literal("list"), values: z.array(z.union([z.string(), z.number()])) })
  .strict();

const COMPARISON_OPS = ["equals", "notEquals", "gt", "gte", "lt", "lte", "contains"] as const;
const MEMBERSHIP_OPS = ["in", "notIn"] as const;
export const CONDITION_OPS = [...COMPARISON_OPS, ...MEMBERSHIP_OPS] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

const conditionSchema = z.union([
  z.object({ kind: z.literal("condition"), left: scalarOperandSchema, op: z.enum(COMPARISON_OPS), right: scalarOperandSchema }).strict(),
  z.object({ kind: z.literal("condition"), left: scalarOperandSchema, op: z.enum(MEMBERSHIP_OPS), right: listOperandSchema }).strict(),
]);

export interface ConditionGroup {
  kind: "group";
  op: "and" | "or";
  conditions: (Condition | ConditionGroup)[];
}
const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z
    .object({
      kind: z.literal("group"),
      op: z.enum(["and", "or"]),
      conditions: z.array(z.union([conditionSchema, conditionGroupSchema])).min(1),
    })
    .strict()
);

const legacyVisibilityRuleSchema = z
  .object({
    fieldKey: z.string(),
    op: z.enum(["equals", "notEquals"]),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })
  .strict();

export const visibilityNodeSchema = z.union([legacyVisibilityRuleSchema, conditionSchema, conditionGroupSchema]);

export const namedConstantSchema = z.object({ key: z.string(), label: z.string(), value: z.number() }).strict();

export type FieldRef = z.infer<typeof fieldRefSchema>;
export type ScalarOperand = z.infer<typeof scalarOperandSchema>;
export type ListOperand = z.infer<typeof listOperandSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type LegacyVisibilityRule = z.infer<typeof legacyVisibilityRuleSchema>;
export type VisibilityNode = z.infer<typeof visibilityNodeSchema>;
export type ConditionNode = Condition | ConditionGroup;
export type NamedConstant = z.infer<typeof namedConstantSchema>;

function isLegacyRule(node: VisibilityNode): node is LegacyVisibilityRule {
  return !("kind" in node);
}

/** A legacy rule's bare `fieldKey` always meant "same section as the field carrying it" —
 * `currentSectionKey` is what lets that keep meaning the same thing once every field ref
 * everywhere else is fully qualified. */
export function toConditionNode(node: VisibilityNode, currentSectionKey: string): ConditionNode {
  if (isLegacyRule(node)) {
    return {
      kind: "condition",
      left: { kind: "field", sectionKey: currentSectionKey, fieldKey: node.fieldKey },
      op: node.op,
      right: { kind: "literal", value: node.value },
    };
  }
  return node;
}

export interface EvalContext {
  constants: readonly NamedConstant[];
  /** Flat map keyed `"sectionKey.fieldKey"`. */
  values: Record<string, unknown>;
}

function resolveComputed(op: z.infer<typeof computedOperandSchema>, ctx: EvalContext): number | undefined {
  const dobRaw = ctx.values[`${op.dateField.sectionKey}.${op.dateField.fieldKey}`];
  if (typeof dobRaw !== "string" || !dobRaw) return undefined;
  const dob = new Date(dobRaw);
  if (Number.isNaN(dob.getTime())) return undefined;

  let asOf = new Date();
  if (op.offsetField) {
    const offsetRaw = ctx.values[`${op.offsetField.sectionKey}.${op.offsetField.fieldKey}`];
    const offset = Number(offsetRaw);
    if (offsetRaw == null || offsetRaw === "" || Number.isNaN(offset)) return undefined; // offset not answered yet
    const days = op.offsetUnit === "years" ? offset * 365.25 : offset * 30.4375;
    asOf = new Date(asOf.getTime() + days * 86400000);
  }

  let age = asOf.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear = asOf.getMonth() > dob.getMonth() || (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

function resolveOperand(operand: ScalarOperand, ctx: EvalContext): unknown {
  switch (operand.kind) {
    case "literal":
      return operand.value;
    case "field":
      return ctx.values[`${operand.sectionKey}.${operand.fieldKey}`];
    case "constant":
      return ctx.constants.find((c) => c.key === operand.key)?.value;
    case "computed":
      return resolveComputed(operand, ctx);
  }
}

function evaluateNode(node: ConditionNode, ctx: EvalContext): boolean {
  if (node.kind === "group") {
    const results = node.conditions.map((c) => evaluateNode(c, ctx));
    return node.op === "and" ? results.every(Boolean) : results.some(Boolean);
  }

  const left = resolveOperand(node.left, ctx);

  switch (node.op) {
    case "in":
    case "notIn": {
      if (left === null || left === undefined) return false;
      const found = node.right.values.some((v) => String(v) === String(left));
      return node.op === "in" ? found : !found;
    }
    default: {
      const right = resolveOperand(node.right, ctx);
      // An unresolved operand (a field not yet answered, an offset field missing, an
      // unknown constant key) makes the condition false rather than throwing or defaulting
      // to true — this is what makes referencing a field the applicant hasn't reached yet
      // safe.
      if (left === null || left === undefined || right === null || right === undefined) return false;
      switch (node.op) {
        case "equals":
          return left === right;
        case "notEquals":
          return left !== right;
        case "gt":
          return Number(left) > Number(right);
        case "gte":
          return Number(left) >= Number(right);
        case "lt":
          return Number(left) < Number(right);
        case "lte":
          return Number(left) <= Number(right);
        case "contains":
          return String(left).toLowerCase().includes(String(right).toLowerCase());
      }
    }
  }
}

/** Shared by every place that decides whether a field's `required`/display state should
 * currently apply — worker/src/routes/applications.ts (submit-time validation),
 * worker/src/lib/sections.ts (needsAttentionSections), and the frontend's
 * DynamicFieldComponent/personal-details.component.ts (client-side display + validators).
 * `currentSectionKey` is the section the field-carrying-this-visibility lives in (only
 * matters for upgrading a legacy rule — see toConditionNode). */
export function isFieldVisible(
  field: { visibility?: VisibilityNode | null },
  currentSectionKey: string,
  ctx: EvalContext
): boolean {
  if (!field.visibility) return true;
  return evaluateNode(toConditionNode(field.visibility, currentSectionKey), ctx);
}

const fieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
  })
  .strict();

export const formFieldSchema = z
  .object({
    key: z.string(),
    sectionHeaderKey: z.string(),
    kind: z.enum(["existing", "custom"]),
    type: z.enum(FIELD_TYPES).optional(),
    labelKey: z.string().optional(),
    label: bilingualLabelSchema.optional(),
    helpText: bilingualLabelSchema.optional(),
    tooltip: bilingualLabelSchema.optional(),
    required: z.boolean(),
    hidden: z.boolean().optional(), // unconditionally hidden — distinct from `visibility`'s conditional rule
    order: z.number(),
    options: z.array(fieldOptionSchema).optional(),
    optionsDependOn: optionsDependOnSchema.optional(),
    optionsSource: optionsSourceSchema.optional(),
    validation: fieldValidationSchema.optional(),
    visibility: visibilityNodeSchema.nullable().optional(),
    // Admin-authored copy shown alongside the field's own live validity state, in place of the
    // generic "this field is required" fallback. errorMessage: shown when the control is invalid
    // and touched. successMessage: shown when the control is valid, touched, and has a value —
    // a positive confirmation, not shown for an untouched-but-technically-valid empty optional
    // field. warningMessage: a static admin caution note, shown whenever the field is visible,
    // independent of validity (e.g. "this will be visible to the credit bureau") — not tied to a
    // specific rule/condition outcome; that's a larger, separate feature, deliberately deferred.
    errorMessage: bilingualLabelSchema.optional(),
    successMessage: bilingualLabelSchema.optional(),
    warningMessage: bilingualLabelSchema.optional(),
  })
  .strict()
  .refine((f) => f.kind === "existing" || !!f.type, {
    message: "custom fields must declare a type",
    path: ["type"],
  })
  .refine((f) => f.labelKey || f.label, {
    message: "a field needs either labelKey (existing i18n key) or an inline label",
    path: ["label"],
  })
  // One source of options per field: a typed list (with its own optional dependency map) or a master.
  .refine((f) => !f.optionsSource || (!f.options?.length && !f.optionsDependOn), {
    message: "a field's options come either from a typed list or from a master, not both",
    path: ["optionsSource"],
  });

export const sectionHeaderSchema = z
  .object({
    key: z.string(),
    labelKey: z.string().optional(),
    label: bilingualLabelSchema.optional(),
    order: z.number(),
  })
  .strict()
  .refine((h) => h.labelKey || h.label, {
    message: "a section header needs either labelKey or an inline label",
    path: ["label"],
  });

export const formSectionSchema = z
  .object({
    key: z.string(),
    order: z.number(),
    sideMenuLabelKey: z.string(),
    sectionHeaders: z.array(sectionHeaderSchema),
    fields: z.array(formFieldSchema),
  })
  .strict()
  // Cross-field checks that need every field in the section in scope at once, so they can't live
  // on formFieldSchema's own .refine: (a) a field's own option codes must be unique/non-empty —
  // they're used as comparison/lookup keys, a duplicate or blank one would make option-membership
  // checks (applications.ts's validateSectionData) and cascading maps ambiguous; (b)
  // optionsDependOn.fieldKey must point at another field in this same section, earlier in display
  // order — same-section keeps evaluation simple (no cross-section live-value tracking needed),
  // earlier-order keeps the trigger's own options already meaningful in the admin UI when this
  // field's picker is opened. Deliberately NOT checked here: whether optionsDependOn.map's keys/
  // values still match the trigger/own field's *current* options — an admin mid-edit (e.g. adding
  // a branch row before finishing that branch's staff codes) shouldn't be blocked from saving;
  // the admin UI surfaces that as a soft, self-healing warning instead (field-detail-panel).
  .superRefine((section, ctx) => {
    const fieldsByKey = new Map(section.fields.map((f) => [f.key, f]));
    section.fields.forEach((field, fieldIndex) => {
      if (field.options) {
        const seen = new Map<string, number>();
        field.options.forEach((opt, optIndex) => {
          if (!opt.value) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Field '${field.key}': option value must not be empty`,
              path: ["fields", fieldIndex, "options", optIndex, "value"],
            });
          } else if (seen.has(opt.value)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Field '${field.key}': duplicate option value '${opt.value}'`,
              path: ["fields", fieldIndex, "options", optIndex, "value"],
            });
          } else {
            seen.set(opt.value, optIndex);
          }
        });
      }
      if (field.optionsSource?.dependsOn) {
        // Same rule as optionsDependOn: an earlier field of this section. That it is itself sourced
        // from this master's parent master needs the master definitions, so it is checked on save
        // (lib/master-options.ts).
        const trigger = fieldsByKey.get(field.optionsSource.dependsOn.fieldKey);
        if (!trigger) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field '${field.key}': dependsOn references unknown field '${field.optionsSource.dependsOn.fieldKey}'`,
            path: ["fields", fieldIndex, "optionsSource", "dependsOn", "fieldKey"],
          });
        } else if (trigger.order >= field.order) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field '${field.key}': dependsOn field '${trigger.key}' must come before it in display order`,
            path: ["fields", fieldIndex, "optionsSource", "dependsOn", "fieldKey"],
          });
        } else if (!trigger.optionsSource) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field '${field.key}': dependsOn field '${trigger.key}' must itself take its options from a master`,
            path: ["fields", fieldIndex, "optionsSource", "dependsOn", "fieldKey"],
          });
        }
      }
      if (field.optionsDependOn) {
        const trigger = fieldsByKey.get(field.optionsDependOn.fieldKey);
        if (!trigger) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field '${field.key}': optionsDependOn references unknown field '${field.optionsDependOn.fieldKey}'`,
            path: ["fields", fieldIndex, "optionsDependOn", "fieldKey"],
          });
        } else if (trigger.order >= field.order) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field '${field.key}': optionsDependOn field '${trigger.key}' must come before it in display order`,
            path: ["fields", fieldIndex, "optionsDependOn", "fieldKey"],
          });
        }
      }
    });
  });

export const formVersionSchemaSchema = z
  .object({
    sections: z.array(formSectionSchema),
    // Named numeric business constants (e.g. "standardRetirementAge") a visibility condition can
    // reference by key instead of hardcoding a literal — one list per form, usable from any
    // section's rules. Optional so every already-published schema without one still parses.
    constants: z.array(namedConstantSchema).optional(),
  })
  .strict();

export type BilingualLabel = z.infer<typeof bilingualLabelSchema>;
export type FieldOption = z.infer<typeof fieldOptionSchema>;
export type OptionsDependOn = z.infer<typeof optionsDependOnSchema>;
export type OptionsSource = z.infer<typeof optionsSourceSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type FormSectionHeader = z.infer<typeof sectionHeaderSchema>;
export type FormSection = z.infer<typeof formSectionSchema>;
export type FormVersionSchema = z.infer<typeof formVersionSchemaSchema>;

export const FORM_KEYS = ["personal-loan-wizard", "business-loan-wizard"] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export function isFormKey(value: string): value is FormKey {
  return (FORM_KEYS as readonly string[]).includes(value);
}
