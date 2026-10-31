import { useEffect, useState, type FormEvent } from "react";
import {
  Plus,
  Trash2,
  Check,
  ArrowRight,
  ReceiptText,
  Layers,
} from "lucide-react";
import {
  api,
  type Lookups,
  type Row,
  type Line,
  money,
  now,
  shiftDate,
  useResource,
  useDebounced,
} from "./lib";
import { Modal, Button, ErrorBox, Skeleton } from "./components";

export interface FormSpec {
  collection: string;
  row?: Row;
  templateId?: number;
  customerId?: number;
  planId?: number;
}
type Values = Record<string, any>;
interface Field {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string | number; label: string }[];
  hint?: string;
  min?: number;
  step?: string;
  full?: boolean;
}
const dollar = (n: number | undefined) => (n === undefined ? "" : n / 100);
const cents = (n: unknown) => Math.round(Number(n) * 100);

export default function RecordForm({
  spec,
  onClose,
  onSaved,
}: {
  spec: FormSpec;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { collection, row } = spec;
  const { data: refs, error: lookupError } = useResource<Lookups>("/lookups");
  const [customerSearch, setCustomerSearch] = useState("");
  const debounced = useDebounced(customerSearch);
  const { data: searchRefs } = useResource<Lookups>(
    debounced ? "/lookups?q=" + encodeURIComponent(debounced) : null,
  );
  const filteredRefs = debounced ? searchRefs || refs : refs;
  const [values, setValues] = useState<Values>(() => ({
    name: "",
    email: "",
    company: "",
    phone: "",
    address: "",
    type: "software",
    price: "",
    cost: "",
    notes: "",
    description: "",
    interval: "monthly",
    min_quantity: 1,
    available_from: now(),
    available_until: "",
    auto_close: true,
    allow_pause: true,
    allow_close: true,
    allow_renew: true,
    tax_id: "",
    archived: false,
    rate_bps: "18",
    valid_days: 30,
    kind: "percentage",
    value: 10,
    min_purchase: 0,
    min_quantity_discount: 0,
    starts_on: now(),
    ends_on: shiftDate(now(), 30),
    usage_limit: 100,
    product_id: "",
    subscription_id: "",
    enabled: true,
    customer_id: spec.customerId || "",
    plan_id: spec.planId || "",
    start_date: now(),
    expiry_date: shiftDate(now(), 365),
    payment_terms: 14,
    password: "",
    ...row,
    ...(row
      ? {
          price: dollar(row.price),
          cost: dollar(row.cost),
          value: dollar(row.value),
          min_purchase: dollar(row.min_purchase),
          rate_bps: dollar(row.rate_bps),
          available_until: row.available_until || "",
          tax_id: row.tax_id || "",
          product_id: row.product_id || "",
          subscription_id: row.subscription_id || "",
          min_quantity_discount: row.min_quantity,
        }
      : {}),
    ...(collection === "discounts" && !row ? { min_quantity: 0 } : {}),
  }));
  const [variants, setVariants] = useState<
    { name: string; extra: number | string }[]
  >(
    row?.variants?.map((v: Row) => ({ name: v.name, extra: v.extra / 100 })) ||
      [],
  );
  const [lines, setLines] = useState<Line[]>(
    row?.lines || [{ product_id: 0, quantity: 1, variant: "" }],
  );
  const [templateId, setTemplateId] = useState<number | undefined>(
    spec.templateId,
  );
  const [templateApplied, setTemplateApplied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: any) =>
    setValues((v) => ({ ...v, [key]: value }));
  function applyTemplate(id: number) {
    const template = refs?.templates.find((t) => t.id === id);
    setTemplateId(id || undefined);
    if (template) {
      set("plan_id", template.plan_id);
      setLines(template.lines.map((l: Line) => ({ ...l })));
    }
  }
  useEffect(() => {
    if (refs && templateId && !templateApplied) {
      const template = refs.templates.find((t) => t.id === templateId);
      if (template) {
        setValues((v) => ({ ...v, plan_id: template.plan_id }));
        setLines(template.lines);
      }
      setTemplateApplied(true);
    }
  }, [refs, templateId, templateApplied]);
  const taxOptions = [
    { value: "", label: "No tax" },
    ...(refs?.taxes.map((t) => ({
      value: t.id,
      label: `${t.name} (${t.rate_bps / 100}%)`,
    })) || []),
  ];
  const planOptions = [
    { value: "", label: "Choose a plan" },
    ...(refs?.plans.map((p) => ({
      value: p.id,
      label: `${p.name} · ${money(p.price)}/${p.interval}`,
    })) || []),
  ];
  let fields: Field[] = [];
  if (collection === "customers")
    fields = [
      { key: "name", label: "Contact name", required: true },
      { key: "email", label: "Email address", type: "email", required: true },
      { key: "company", label: "Company" },
      { key: "phone", label: "Phone number" },
      {
        key: "address",
        label: "Billing address",
        type: "textarea",
        full: true,
      },
    ];
  if (collection === "products")
    fields = [
      { key: "name", label: "Product name", required: true },
      {
        key: "type",
        label: "Product type",
        options: ["software", "service", "addon"].map((v) => ({
          value: v,
          label: v === "addon" ? "Add-on" : v[0].toUpperCase() + v.slice(1),
        })),
      },
      {
        key: "price",
        label: "Sales price (₹)",
        type: "number",
        required: true,
        min: 0,
        step: "0.01",
      },
      {
        key: "cost",
        label: "Cost price (₹)",
        type: "number",
        required: true,
        min: 0,
        step: "0.01",
      },
      { key: "tax_id", label: "Tax rule", options: taxOptions },
      { key: "notes", label: "Product notes", type: "textarea", full: true },
    ];
  if (collection === "plans")
    fields = [
      { key: "name", label: "Plan name", required: true },
      {
        key: "interval",
        label: "Billing interval",
        options: ["daily", "weekly", "monthly", "yearly"].map((v) => ({
          value: v,
          label: v[0].toUpperCase() + v.slice(1),
        })),
      },
      {
        key: "price",
        label: "Base fee per cycle (₹)",
        type: "number",
        required: true,
        min: 0,
        step: "0.01",
        hint: "Added to the subscription’s product lines.",
      },
      {
        key: "min_quantity",
        label: "Minimum total product quantity",
        type: "number",
        required: true,
        min: 1,
      },
      {
        key: "available_from",
        label: "Available from",
        type: "date",
        required: true,
      },
      {
        key: "available_until",
        label: "Available until",
        type: "date",
        hint: "Leave blank for ongoing availability.",
      },
      { key: "tax_id", label: "Base fee tax", options: taxOptions },
      {
        key: "description",
        label: "Description",
        type: "textarea",
        full: true,
      },
    ];
  if (collection === "taxes")
    fields = [
      { key: "name", label: "Tax name", required: true },
      {
        key: "rate_bps",
        label: "Tax rate (%)",
        type: "number",
        required: true,
        min: 0,
        step: "0.01",
      },
    ];
  if (collection === "discounts")
    fields = [
      { key: "name", label: "Discount name", required: true },
      {
        key: "kind",
        label: "Discount type",
        options: [
          { value: "percentage", label: "Percentage" },
          { value: "fixed", label: "Fixed amount" },
        ],
      },
      {
        key: "value",
        label: values.kind === "percentage" ? "Discount (%)" : "Discount (₹)",
        type: "number",
        required: true,
        min: 0.01,
        step: "0.01",
      },
      {
        key: "usage_limit",
        label: "Maximum invoice uses",
        type: "number",
        required: true,
        min: 1,
      },
      {
        key: "min_purchase",
        label: "Minimum purchase (₹)",
        type: "number",
        min: 0,
        step: "0.01",
      },
      {
        key: "min_quantity",
        label: "Minimum product quantity",
        type: "number",
        min: 0,
      },
      { key: "starts_on", label: "Starts on", type: "date", required: true },
      { key: "ends_on", label: "Ends on", type: "date", required: true },
      {
        key: "product_id",
        label: "Product scope",
        options: [
          { value: "", label: "All products and base fee" },
          ...(refs?.products.map((p) => ({ value: p.id, label: p.name })) ||
            []),
        ],
      },
      {
        key: "subscription_id",
        label: "Subscription scope",
        options: [
          { value: "", label: "All subscriptions" },
          ...(filteredRefs?.subscriptions?.map((s) => ({
            value: s.id,
            label: `${s.number} · ${s.company || s.customer_name}`,
          })) || []),
        ],
      },
    ];
  if (collection === "templates")
    fields = [
      { key: "name", label: "Template name", required: true },
      {
        key: "valid_days",
        label: "Quotation valid for (days)",
        type: "number",
        min: 1,
        required: true,
      },
      {
        key: "plan_id",
        label: "Subscription plan",
        options: planOptions,
        required: true,
        full: true,
      },
    ];
  if (collection === "subscriptions")
    fields = [
      {
        key: "customer_id",
        label: "Customer",
        required: true,
        options: [
          { value: "", label: "Choose a customer" },
          ...(filteredRefs?.customers.map((c) => ({
            value: c.id,
            label: `${c.company || c.name} · ${c.email}`,
          })) || []),
        ],
      },
      {
        key: "plan_id",
        label: "Subscription plan",
        options: planOptions,
        required: true,
      },
      { key: "start_date", label: "Start date", type: "date", required: true },
      {
        key: "expiry_date",
        label: "Term expiry",
        type: "date",
        required: true,
      },
      {
        key: "payment_terms",
        label: "Payment due within (days)",
        type: "number",
        required: true,
        min: 0,
        hint: "Measured from the billing cycle date.",
      },
    ];
  if (collection === "staff")
    fields = [
      { key: "name", label: "Full name", required: true },
      { key: "email", label: "Email address", type: "email", required: true },
      {
        key: "password",
        label: "Initial password",
        type: "password",
        required: true,
        full: true,
        hint: "At least 9 characters with uppercase, lowercase, and a symbol.",
      },
    ];
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload: Values = { ...values };
    for (const k of ["price", "cost", "min_purchase"])
      if (payload[k] !== undefined) payload[k] = cents(payload[k]);
    for (const k of [
      "min_quantity",
      "valid_days",
      "usage_limit",
      "payment_terms",
    ])
      payload[k] = Number(payload[k]);
    for (const k of ["plan_id", "customer_id"]) payload[k] = Number(payload[k]);
    for (const k of ["tax_id", "product_id", "subscription_id"])
      payload[k] = payload[k] ? Number(payload[k]) : null;
    for (const k of [
      "auto_close",
      "allow_pause",
      "allow_close",
      "allow_renew",
      "enabled",
      "archived",
    ])
      payload[k] = Boolean(payload[k]);
    payload.rate_bps = cents(payload.rate_bps);
    payload.value = cents(payload.value);
    payload.available_until = payload.available_until || null;
    payload.variants = variants.map((v) => ({
      name: v.name,
      extra: cents(v.extra),
    }));
    payload.lines = lines.map((l) => ({
      product_id: Number(l.product_id),
      quantity: Number(l.quantity),
      variant: l.variant || "",
    }));
    if (templateId && collection === "subscriptions")
      payload.template_id = templateId;
    try {
      await api(
        `/${collection}${row ? "/" + row.id : ""}`,
        row ? "PUT" : "POST",
        payload,
      );
      onSaved(
        `${row ? "Updated" : "Created"} ${collection === "staff" ? "team member" : collection.replace(/ies$/, "y").replace(/s$/, "")}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedPlan = refs?.plans.find((p) => p.id === Number(values.plan_id));
  const total =
    (selectedPlan?.price || 0) +
    lines.reduce((sum, l) => {
      const p = refs?.products.find((p) => p.id === Number(l.product_id));
      return (
        sum +
        ((p?.price || 0) +
          (p?.variants.find((v: Row) => v.name === l.variant)?.extra || 0)) *
          l.quantity
      );
    }, 0);
  const title =
    collection === "staff"
      ? "team member"
      : collection === "taxes"
        ? "tax rule"
        : collection.replace(/ies$/, "y").replace(/s$/, "");
  return (
    <Modal
      title={`${row ? "Edit" : "New"} ${title}`}
      subtitle={
        collection === "subscriptions"
          ? "Start with a draft. Build the relationship from there."
          : "A few details now. A smoother workflow later."
      }
      onClose={onClose}
      wide={["subscriptions", "plans", "templates", "discounts"].includes(
        collection,
      )}
    >
      {lookupError ? (
        <ErrorBox message={lookupError} />
      ) : !refs ? (
        <Skeleton />
      ) : (
        <form className="record-form" onSubmit={submit}>
          {error && <ErrorBox message={error} />}{" "}
          {collection === "subscriptions" && (
            <div className="template-picker">
              <Layers size={20} />
              <label>
                Start from a quotation template
                <select
                  aria-label="Quotation template"
                  value={templateId || ""}
                  onChange={(e) => applyTemplate(Number(e.target.value))}
                >
                  <option value="">Build from scratch</option>
                  {refs.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · valid {t.valid_days} days
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {["subscriptions", "discounts"].includes(collection) && (
            <label className="customer-lookup">
              {collection === "subscriptions"
                ? "Find a customer"
                : "Find a subscription"}
              <input
                placeholder={
                  collection === "subscriptions"
                    ? "Search all customers by name, company, or email"
                    : "Search by subscription number, customer, or company"
                }
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </label>
          )}
          <div className="form-grid">
            {fields.map((f) => (
              <label key={f.key} className={f.full ? "full-width" : ""}>
                {f.label}
                {!f.required && !f.options && (
                  <span className="optional">optional</span>
                )}
                {f.options ? (
                  <select
                    required={f.required}
                    value={values[f.key] ?? ""}
                    onChange={(e) => {
                      set(f.key, e.target.value);
                      if (f.key === "plan_id") setTemplateId(undefined);
                    }}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    rows={3}
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    maxLength={1000}
                  />
                ) : (
                  <input
                    type={f.type || "text"}
                    required={f.required}
                    min={f.min}
                    step={f.step || "1"}
                    max={
                      f.key === "rate_bps" ||
                      (f.key === "value" && values.kind === "percentage")
                        ? 100
                        : undefined
                    }
                    maxLength={f.type === "password" ? 128 : 500}
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}{" "}
                {f.hint && <small>{f.hint}</small>}
              </label>
            ))}
          </div>
          {collection === "plans" && (
            <div className="checkbox-grid">
              {[
                ["auto_close", "Close automatically when the term ends"],
                ["allow_pause", "Allow subscriptions to be paused"],
                ["allow_close", "Allow early closure"],
                ["allow_renew", "Allow subscriptions to be renewed"],
              ].map(([key, text]) => (
                <label className="check-label" key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(values[key])}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
          )}
          {collection === "discounts" && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={Boolean(values.enabled)}
                onChange={(e) => set("enabled", e.target.checked)}
              />
              Enable automatic application
            </label>
          )}
          {["products", "plans"].includes(collection) && row && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={Boolean(values.archived)}
                onChange={(e) => set("archived", e.target.checked)}
              />
              Archive for new subscriptions
            </label>
          )}
          {collection === "products" && (
            <div className="line-editor">
              <div className="subsection-title">
                <h3>Product variants</h3>
                <Button
                  type="button"
                  variant="ghost"
                  icon={Plus}
                  onClick={() =>
                    setVariants((v) => [...v, { name: "", extra: 0 }])
                  }
                >
                  Add variant
                </Button>
              </div>
              {variants.length === 0 && (
                <p className="muted small-text">
                  Variants let customers choose an option with its own price
                  adjustment.
                </p>
              )}
              {variants.map((v, i) => (
                <div className="variant-row" key={i}>
                  <label>
                    Variant name
                    <input
                      required
                      value={v.name}
                      placeholder="e.g. Odoo"
                      onChange={(e) =>
                        setVariants((vs) =>
                          vs.map((v, j) =>
                            j === i ? { ...v, name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Additional price (₹)
                    <input
                      type="number"
                      min="0"
                      step=".01"
                      required
                      value={v.extra}
                      onChange={(e) =>
                        setVariants((vs) =>
                          vs.map((v, j) =>
                            j === i ? { ...v, extra: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove variant ${i + 1}`}
                    onClick={() =>
                      setVariants((vs) => vs.filter((_, j) => i !== j))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {["subscriptions", "templates"].includes(collection) && (
            <div className="line-editor">
              <div className="subsection-title">
                <div>
                  <h3>Product lines</h3>
                  <small>
                    {selectedPlan
                      ? `${selectedPlan.name} requires at least ${selectedPlan.min_quantity} total units.`
                      : "Choose your products, quantities, and variants."}
                  </small>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  icon={Plus}
                  onClick={() =>
                    setLines((v) => [
                      ...v,
                      { product_id: 0, quantity: 1, variant: "" },
                    ])
                  }
                >
                  Add line
                </Button>
              </div>
              {lines.map((l, i) => {
                const p = refs.products.find(
                  (p) => p.id === Number(l.product_id),
                );
                return (
                  <div className="product-line" key={i}>
                    <label>
                      Product
                      <select
                        required
                        value={l.product_id || ""}
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l, j) =>
                              i === j
                                ? {
                                    ...l,
                                    product_id: Number(e.target.value),
                                    variant: "",
                                  }
                                : l,
                            ),
                          )
                        }
                      >
                        <option value="">Choose a product</option>
                        {refs.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {money(p.price)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Variant
                      <select
                        value={l.variant}
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l, j) =>
                              i === j ? { ...l, variant: e.target.value } : l,
                            ),
                          )
                        }
                      >
                        <option value="">Base product</option>
                        {p?.variants?.map((v: Row) => (
                          <option key={v.name} value={v.name}>
                            {v.name} (+{money(v.extra)})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        required
                        value={l.quantity}
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l, j) =>
                              i === j
                                ? { ...l, quantity: Number(e.target.value) }
                                : l,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={lines.length === 1}
                      aria-label={`Remove product line ${i + 1}`}
                      onClick={() =>
                        setLines((ls) => ls.filter((_, j) => i !== j))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              <div className="quote-total">
                <span>
                  <b>{money(total)}</b> / {selectedPlan?.interval || "cycle"}
                  <small>
                    Base fee + products, before discounts and taxes.
                  </small>
                </span>
                <ReceiptText size={24} />
              </div>
            </div>
          )}
          <div className="form-footer">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" busy={busy} icon={row ? Check : ArrowRight}>
              {row
                ? "Save changes"
                : collection === "subscriptions"
                  ? "Create draft"
                  : `Create ${title}`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function PaymentForm({
  invoice,
  onClose,
  onSaved,
}: {
  invoice?: Row;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { data } = useResource<{ items: Row[] }>(
    invoice ? null : "/invoices?status=confirmed&limit=100",
  );
  const [selected, setSelected] = useState(invoice?.id || 0);
  const current = invoice || data?.items.find((i) => i.id === selected);
  const [amount, setAmount] = useState(
    invoice ? (invoice.total - invoice.paid) / 100 : 0,
  );
  const [method, setMethod] = useState("bank_transfer");
  const [paidOn, setPaidOn] = useState(now());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/invoices/${selected}/payments`, "POST", {
        amount: cents(amount),
        method,
        paid_on: paidOn,
        note,
        idempotency_key: key,
      });
      onSaved("Payment recorded. The invoice balance is up to date.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Record a payment"
      subtitle="Match an incoming payment to its invoice."
      onClose={onClose}
    >
      <form onSubmit={submit} className="record-form">
        {error && <ErrorBox message={error} />}{" "}
        {!invoice && (
          <label>
            Invoice
            <select
              required
              value={selected || ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelected(id);
                const i = data?.items.find((i) => i.id === id);
                if (i) setAmount((i.total - i.paid) / 100);
              }}
            >
              <option value="">Select an outstanding invoice</option>
              {data?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} · {i.customer_name} · {money(i.total - i.paid)}
                </option>
              ))}
            </select>
            <small>
              Showing up to 100 confirmed invoices. You can also open any
              invoice directly to record its payment.
            </small>
          </label>
        )}
        {current && (
          <div className="payment-summary">
            <span>
              {current.number}
              <small>{current.customer_name}</small>
            </span>
            <strong>
              {money(current.total - current.paid)}
              <small>outstanding</small>
            </strong>
          </div>
        )}
        <div className="form-grid">
          <label>
            Amount received (₹)
            <input
              type="number"
              min=".01"
              step=".01"
              required
              max={current ? (current.total - current.paid) / 100 : undefined}
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <label>
            Payment method
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {[
                ["bank_transfer", "Bank transfer"],
                ["upi", "UPI"],
                ["card", "Card"],
                ["cash", "Cash"],
                ["other", "Other"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date received
            <input
              type="date"
              min={current?.issued_on}
              max={now()}
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              required
            />
          </label>
          <label className="full-width">
            Reference or note
            <textarea
              placeholder="e.g. Bank reference or receipt number"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </label>
        </div>
        <p className="form-note">
          This records a payment already received. It does not charge a card or
          move funds.
        </p>
        <div className="form-footer">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!current} icon={Check}>
            Record payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
