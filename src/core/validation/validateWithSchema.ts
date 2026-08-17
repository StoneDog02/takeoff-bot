import type { z } from "zod";

export function validateWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  label = "Value",
): z.infer<TSchema> {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");

  throw new Error(`${label} failed schema validation: ${details}`);
}
