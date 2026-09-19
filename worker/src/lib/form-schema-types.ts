import { z } from "zod";

// The shape stored in form_versions.schemaJson (see admin-form-builder.ts / form-versions.ts).
// One version of one form (personal-loan-wizard | business-loan-wizard) — sections, their
// sub-headers, and their fields, in display order. This is deliberately a metadata/ordering layer
// over the wizard, not a replacement for it: existing (kind: "existing") fields still render via
// their real hardcoded Angular component and validate via their real Zod schema in
// section-schemas.ts — the schema here only carries their label/required/order/visibility. Only
// kind: "custom" fields (admin-added, no pre-existing business logic) carry a `type` and render
// generically via DynamicFieldComponent.

export const FIELD_TYPES = ["text", "number", "date", "select", "radio", "checkbox", "textarea"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const bilingualLabelSchema = z.object({ en: z.string(), he: z.string() }).strict();

const fieldOptionSchema = z
  .object({ value: z.string(), label: bilingualLabelSchema })
  .strict();

const visibilityRuleSchema = z
  .object({
    fieldKey: z.string(),
    op: z.enum(["equals", "notEquals"]),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })
  .strict();

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
    required: z.boolean(),
    hidden: z.boolean().optional(), // unconditionally hidden — distinct from `visibility`'s conditional rule
    order: z.number(),
    options: z.array(fieldOptionSchema).optional(),
    validation: fieldValidationSchema.optional(),
    visibility: visibilityRuleSchema.nullable().optional(),
  })
  .strict()
  .refine((f) => f.kind === "existing" || !!f.type, {
    message: "custom fields must declare a type",
    path: ["type"],
  })
  .refine((f) => f.labelKey || f.label, {
    message: "a field needs either labelKey (existing i18n key) or an inline label",
    path: ["label"],
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
  .strict();

export const formVersionSchemaSchema = z
  .object({
    sections: z.array(formSectionSchema),
  })
  .strict();

export type BilingualLabel = z.infer<typeof bilingualLabelSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type FormSectionHeader = z.infer<typeof sectionHeaderSchema>;
export type FormSection = z.infer<typeof formSectionSchema>;
export type FormVersionSchema = z.infer<typeof formVersionSchemaSchema>;

export const FORM_KEYS = ["personal-loan-wizard", "business-loan-wizard"] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export function isFormKey(value: string): value is FormKey {
  return (FORM_KEYS as readonly string[]).includes(value);
}
