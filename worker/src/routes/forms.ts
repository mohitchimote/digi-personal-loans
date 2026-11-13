import { Hono } from "hono";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { isFormKey } from "../lib/form-schema-types";
import { getPublishedVersion, parseSchema } from "../lib/form-versions";

// The currently published definition of an application form, for any signed-in user. Screens that list
// applications (the staff pipeline) have no single application to read the definition from, but still
// need it to show a stored value's label the same way every other screen does.
export const forms = new Hono<AppEnv>();
forms.use("*", requireAuth);

forms.get("/:formKey/published-schema", async (c) => {
  const formKey = c.req.param("formKey");
  if (!isFormKey(formKey)) throw new AppError(`Unknown form: ${formKey}`, 404);
  const version = await getPublishedVersion(getDb(c.env.DB), formKey);
  if (!version) throw new AppError("No published version for this form yet.", 404);
  return c.json({ version: version.version, schema: parseSchema(version) });
});
