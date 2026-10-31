import { z } from "zod";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const assert = (condition, message, status = 400) => {
  if (!condition) throw new HttpError(status, message);
};
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (date, days) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);

// Preserve the original day across short months: Jan 31 -> Feb 28 -> Mar 31.
export function nextCycle(
  date,
  interval,
  anchorDay = Number(date.slice(8, 10)),
) {
  if (interval === "daily") return addDays(date, 1);
  if (interval === "weekly") return addDays(date, 7);
  const d = new Date(date + "T12:00:00Z");
  const months = interval === "yearly" ? 12 : 1;
  const first = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12),
  );
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(anchorDay, last));
  return first.toISOString().slice(0, 10);
}

const text = z.string().trim().min(1).max(160);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Use a valid calendar date");
const cents = z.number().int().min(0).max(100_000_000);
const id = z.number().int().positive();
export const email = z.email().trim().toLowerCase().max(254);
export const password = z
  .string()
  .min(9, "Use at least 9 characters")
  .max(128)
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[^A-Za-z0-9\s]/, "Add a special character");
export const lineSchema = z.object({
  product_id: id,
  quantity: z.number().int().min(1).max(10000),
  variant: z.string().max(80).default(""),
});
const datesValid = (v) =>
  !v.available_until || v.available_until >= v.available_from;
export const schemas = {
  customers: z.object({
    name: text,
    email,
    company: z.string().trim().max(160).default(""),
    phone: z.string().max(40).default(""),
    address: z.string().max(500).default(""),
  }),
  products: z
    .object({
      name: text,
      type: z.enum(["software", "service", "addon"]),
      price: cents,
      cost: cents,
      notes: z.string().max(1000).default(""),
      variants: z
        .array(z.object({ name: text, extra: cents }))
        .max(30)
        .default([]),
      tax_id: id.nullable().default(null),
      archived: z.boolean().default(false),
    })
    .refine(
      (v) => new Set(v.variants.map((x) => x.name)).size === v.variants.length,
      "Variant names must be unique",
    ),
  plans: z
    .object({
      name: text,
      description: z.string().max(500).default(""),
      price: cents,
      interval: z.enum(["daily", "weekly", "monthly", "yearly"]),
      min_quantity: z.number().int().min(1).max(10000).default(1),
      available_from: date,
      available_until: date.nullable().default(null),
      auto_close: z.boolean().default(true),
      allow_pause: z.boolean().default(true),
      allow_close: z.boolean().default(true),
      allow_renew: z.boolean().default(true),
      tax_id: id.nullable().default(null),
      archived: z.boolean().default(false),
    })
    .refine(datesValid, "Availability end must follow its start"),
  taxes: z.object({ name: text, rate_bps: z.number().int().min(0).max(10000) }),
  templates: z.object({
    name: text,
    plan_id: id,
    valid_days: z.number().int().min(1).max(365),
    lines: z.array(lineSchema).min(1).max(50),
  }),
  discounts: z
    .object({
      name: text,
      kind: z.enum(["fixed", "percentage"]),
      value: z.number().int().positive().max(100_000_000),
      min_purchase: cents.default(0),
      min_quantity: z.number().int().min(0).max(10000).default(0),
      starts_on: date,
      ends_on: date,
      usage_limit: z.number().int().min(1).max(1000000),
      product_id: id.nullable().default(null),
      subscription_id: id.nullable().default(null),
      enabled: z.boolean().default(true),
    })
    .refine((v) => v.ends_on >= v.starts_on, "Discount end must follow start")
    .refine(
      (v) => v.kind !== "percentage" || v.value <= 10000,
      "Percentage cannot exceed 100%",
    ),
};
export const subscriptionSchema = z
  .object({
    customer_id: id,
    plan_id: id,
    start_date: date,
    expiry_date: date,
    payment_terms: z.number().int().min(0).max(120).default(14),
    template_id: id.optional(),
    lines: z.array(lineSchema).min(1).max(50),
  })
  .refine(
    (v) => v.expiry_date > v.start_date,
    "Expiry must be after the start date",
  );

export function hydrate(row) {
  if (!row) return null;
  const result = { ...row };
  for (const key of ["lines", "variants", "discount_ids", "customer_snapshot"])
    if (typeof result[key] === "string") result[key] = JSON.parse(result[key]);
  return result;
}

export function snapshotLines(db, lines) {
  return lines.map((line) => {
    const product = hydrate(
      db
        .prepare("SELECT * FROM products WHERE id=? AND archived=0")
        .get(line.product_id),
    );
    assert(product, "A selected product is unavailable");
    const variant = line.variant
      ? product.variants.find((v) => v.name === line.variant)
      : null;
    assert(!line.variant || variant, "Selected product variant is unavailable");
    return {
      ...line,
      name: product.name,
      unit_price: product.price + (variant?.extra || 0),
      tax_id: product.tax_id,
    };
  });
}

export function validateRelations(db, table, value) {
  for (const [key, target] of Object.entries({
    tax_id: "taxes",
    plan_id: "plans",
    product_id: "products",
    subscription_id: "subscriptions",
  })) {
    if (value[key] != null)
      assert(
        db.prepare(`SELECT id FROM ${target} WHERE id=?`).get(value[key]),
        `Selected ${target} record does not exist`,
      );
  }
  if (table === "templates") snapshotLines(db, value.lines);
}

export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n / 100);
export const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
