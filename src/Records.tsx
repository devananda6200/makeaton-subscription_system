import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Box,
  Check,
  Copy,
  CreditCard,
  Download,
  Edit3,
  FileText,
  Layers,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import {
  type User,
  type Row,
  type PageResult,
  useResource,
  useDebounced,
  money,
  dateLabel,
  label,
  navigate,
  now,
} from "./lib";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  PageHeading,
  Pagination,
  Skeleton,
} from "./components";
import type { FormSpec } from "./Forms";

const descriptions: Record<
  string,
  { title: string; eyebrow: string; description: string; singular: string }
> = {
  subscriptions: {
    title: "Every relationship, in one place.",
    eyebrow: "SUBSCRIPTIONS",
    description:
      "From the first quotation to the next renewal. Keep the whole story connected.",
    singular: "subscription",
  },
  invoices: {
    title: "Close the loop on billing.",
    eyebrow: "INVOICES",
    description:
      "Accurate invoices, clear balances, and one less thing on your mind.",
    singular: "invoice",
  },
  customers: {
    title: "The people behind your growth.",
    eyebrow: "CUSTOMERS",
    description: "A little context makes every customer conversation better.",
    singular: "customer",
  },
  payments: {
    title: "Good things coming in.",
    eyebrow: "PAYMENTS",
    description:
      "Every receipt, matched to the right invoice. Simple as it should be.",
    singular: "payment",
  },
  products: {
    title: "Make room for what you offer.",
    eyebrow: "PRODUCT CATALOG",
    description:
      "Your products, add-ons, and services. Ready for their next subscription.",
    singular: "product",
  },
  plans: {
    title: "A plan for every possibility.",
    eyebrow: "BILLING PLANS",
    description: "Flexible billing rhythms for the way your customers grow.",
    singular: "plan",
  },
  templates: {
    title: "A head start on the next hello.",
    eyebrow: "QUOTATION TEMPLATES",
    description:
      "Build your best offers once. Start the next conversation in seconds.",
    singular: "template",
  },
  discounts: {
    title: "A little extra reason to stay.",
    eyebrow: "DISCOUNTS",
    description:
      "Thoughtful offers that find the right invoice, automatically.",
    singular: "discount",
  },
  taxes: {
    title: "Every detail, accounted for.",
    eyebrow: "TAX RULES",
    description: "Set clear rules. Let every invoice do the calculation.",
    singular: "tax rule",
  },
  staff: {
    title: "Better, together.",
    eyebrow: "YOUR TEAM",
    description: "Give your team the access they need to keep things moving.",
    singular: "team member",
  },
};

export default function Records({
  section,
  user,
  version,
  initialStatus = "",
  onForm,
  onPayment,
  onBilling,
  onInvite,
}: {
  section: string;
  user: User;
  version: number;
  initialStatus?: string;
  onForm: (spec: FormSpec) => void;
  onPayment: () => void;
  onBilling: () => void;
  onInvite: (row: Row) => void;
}) {
  const meta = descriptions[section] || descriptions.subscriptions;
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setStatus(initialStatus);
    setPage(1);
  }, [initialStatus, section]);
  useEffect(() => setPage(1), [search, status]);
  const params = new URLSearchParams({
    q: search,
    status,
    page: String(page),
    limit: section === "plans" ? "12" : "10",
  }).toString();
  const { data, error, loading } = useResource<PageResult>(
    `/${section}?${params}`,
    version,
  );
  const canEdit =
    user.role === "admin" || (section === "customers" && user.role === "staff");
  const isTeam = user.role !== "customer";
  const statuses =
    section === "subscriptions"
      ? ["", "active", "draft", "quotation", "confirmed", "paused", "closed"]
      : section === "invoices"
        ? ["", "draft", "confirmed", "paid", "overdue", "cancelled"]
        : [];
  const create = () => onForm({ collection: section });
  function mainAction() {
    if (section === "invoices")
      return (
        isTeam && (
          <Button icon={Zap} onClick={onBilling}>
            Run billing
          </Button>
        )
      );
    if (section === "payments")
      return (
        <Button icon={Plus} onClick={onPayment}>
          Record payment
        </Button>
      );
    return (
      (canEdit || (section === "subscriptions" && isTeam)) && (
        <Button icon={Plus} onClick={create}>
          New {meta.singular}
        </Button>
      )
    );
  }
  function statusFor(row: Row) {
    return section === "invoices" &&
      row.status === "confirmed" &&
      row.due_date < now()
      ? "overdue"
      : row.status;
  }
  const total = data?.total ?? data?.items.length ?? 0;
  const cardView = ["plans", "templates", "discounts"].includes(section);
  return (
    <>
      <PageHeading
        {...meta}
        description={
          user.role === "customer"
            ? "Your subscriptions and invoices, with everything you need to stay in control."
            : meta.description
        }
      >
        {mainAction()}
      </PageHeading>
      <section
        className={cardView ? "records-container" : "panel records-panel"}
      >
        <div className="records-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label={`Search ${section}`}
              placeholder={`Search ${section === "staff" ? "your team" : section}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
          <div className="toolbar-meta">
            <span>
              {total} {section === "staff" ? "team members" : section}
            </span>
            <span className="tiny-pill">
              <span className="live-dot" />
              Live
            </span>
          </div>
        </div>
        {statuses.length > 0 && (
          <div
            className="status-tabs"
            role="tablist"
            aria-label={`${section} status`}
          >
            {statuses.map((s) => (
              <button
                role="tab"
                aria-selected={status === s}
                className={status === s ? "active" : ""}
                key={s}
                onClick={() => setStatus(s)}
              >
                {s ? label(s) : `All ${section}`}
              </button>
            ))}
          </div>
        )}
        {error && <ErrorBox message={error} />}{" "}
        {!data && loading ? (
          <Skeleton />
        ) : data?.items.length === 0 ? (
          <Empty
            title={
              q ? "No matches just yet." : `A fresh start for your ${section}.`
            }
            description={
              q
                ? "Try another name, number, or keyword."
                : "Add your first record and the rest will follow."
            }
            action={
              (canEdit || (section === "subscriptions" && isTeam)) && (
                <Button icon={Plus} onClick={create}>
                  New {meta.singular}
                </Button>
              )
            }
          />
        ) : cardView ? (
          <div
            className={`catalog-grid ${section === "plans" ? "plans-grid" : ""}`}
          >
            {[...(data?.items || [])]
              .sort((a, b) => a.id - b.id)
              .map((row) =>
                section === "plans" ? (
                  <article
                    className={`plan-card ${row.name === "Growth" ? "featured-plan" : ""}`}
                    key={row.id}
                  >
                    {row.name === "Growth" && (
                      <div className="plan-featured-label">
                        <Sparkles size={13} />
                        ROOM TO GROW
                      </div>
                    )}
                    <div className="catalog-card-top">
                      <span className="catalog-icon">
                        <Layers size={22} />
                      </span>
                      {canEdit && (
                        <button
                          className="icon-btn"
                          aria-label={`Edit ${row.name}`}
                          onClick={() => onForm({ collection: section, row })}
                        >
                          <Edit3 size={16} />
                        </button>
                      )}
                    </div>
                    <h2>{row.name}</h2>
                    <p>
                      {row.description ||
                        "A flexible foundation for your next chapter."}
                    </p>
                    <div className="plan-price">
                      {money(row.price)}
                      <span>
                        /{row.interval.replace("ly", "").replace("dai", "day")}
                      </span>
                    </div>
                    <small className="plan-price-note">
                      Base fee + selected product lines
                    </small>
                    <div className="plan-features">
                      {[
                        [true, `From ${row.min_quantity} total product units`],
                        [row.allow_pause, "Pause when you need to"],
                        [row.allow_renew, "Renew for the next chapter"],
                        [row.allow_close, "Close your subscription early"],
                        [row.auto_close, "Automatic end-of-term closure"],
                      ]
                        .filter(([v]) => v)
                        .map(([, s]) => (
                          <span key={String(s)}>
                            <Check size={15} />
                            {s}
                          </span>
                        ))}
                    </div>
                    <div className="plan-availability">
                      {row.archived ? (
                        <Badge status="closed">Archived</Badge>
                      ) : (
                        <>
                          <span className="dot-green" />
                          Available{" "}
                          {dateLabel(row.available_from, {
                            day: "numeric",
                            month: "short",
                          })}
                          {row.available_until
                            ? ` – ${dateLabel(row.available_until)}`
                            : " onwards"}
                        </>
                      )}
                    </div>
                    <Button
                      variant={row.name === "Growth" ? "primary" : "secondary"}
                      onClick={() =>
                        onForm({ collection: "subscriptions", planId: row.id })
                      }
                      disabled={Boolean(row.archived)}
                      icon={ArrowUpRight}
                    >
                      Create subscription
                    </Button>
                  </article>
                ) : section === "templates" ? (
                  <article className="catalog-card" key={row.id}>
                    <div className="catalog-card-top">
                      <span className="catalog-icon blue">
                        <FileText size={22} />
                      </span>
                      {canEdit && (
                        <button
                          className="icon-btn"
                          aria-label={`Edit ${row.name}`}
                          onClick={() => onForm({ collection: section, row })}
                        >
                          <Edit3 size={16} />
                        </button>
                      )}
                    </div>
                    <h3>{row.name}</h3>
                    <p>
                      {row.plan_name} · valid for {row.valid_days} days
                    </p>
                    <div className="template-lines">
                      {row.lines.map((l: Row, i: number) => (
                        <span key={i}>
                          <Box size={15} />
                          Product #{l.product_id}
                          {l.variant ? ` · ${l.variant}` : ""}
                          <b>× {l.quantity}</b>
                        </span>
                      ))}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onForm({
                          collection: "subscriptions",
                          templateId: row.id,
                        })
                      }
                      icon={Copy}
                    >
                      Use this template
                    </Button>
                  </article>
                ) : (
                  <article className="catalog-card discount-card" key={row.id}>
                    <div className="catalog-card-top">
                      <span className="discount-value">
                        {row.kind === "percentage"
                          ? `${row.value / 100}%`
                          : money(row.value)}
                        <small>off</small>
                      </span>
                      <Badge
                        status={
                          !row.enabled
                            ? "closed"
                            : row.ends_on < now()
                              ? "closed"
                              : row.uses >= row.usage_limit
                                ? "paused"
                                : row.starts_on > now()
                                  ? "draft"
                                  : "active"
                        }
                      >
                        {!row.enabled
                          ? "Disabled"
                          : row.ends_on < now()
                            ? "Expired"
                            : row.uses >= row.usage_limit
                              ? "Used up"
                              : row.starts_on > now()
                                ? "Scheduled"
                                : "Active"}
                      </Badge>
                    </div>
                    <h3>{row.name}</h3>
                    <p>
                      {dateLabel(row.starts_on)} – {dateLabel(row.ends_on)}
                    </p>
                    <div className="discount-details">
                      <span>
                        Minimum purchase <b>{money(row.min_purchase)}</b>
                      </span>
                      <span>
                        Minimum quantity <b>{row.min_quantity}</b>
                      </span>
                      <span>
                        Applies to{" "}
                        <b>
                          {row.product_id
                            ? `Product #${row.product_id}`
                            : "All products"}
                          {row.subscription_id
                            ? ` · Sub #${row.subscription_id}`
                            : ""}
                        </b>
                      </span>
                    </div>
                    <div className="usage-label">
                      <span>
                        {row.uses} of {row.usage_limit} uses
                      </span>
                      <span>
                        {Math.round((row.uses / row.usage_limit) * 100)}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width:
                            Math.min(100, (row.uses / row.usage_limit) * 100) +
                            "%",
                        }}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      icon={Edit3}
                      onClick={() => onForm({ collection: section, row })}
                    >
                      Edit discount
                    </Button>
                  </article>
                ),
              )}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {section === "subscriptions" ? (
                    <>
                      <th>Subscription / customer</th>
                      <th>Plan</th>
                      <th>Status</th>
                      <th>Recurring amount</th>
                      <th>Next bill</th>
                      <th />
                    </>
                  ) : section === "invoices" ? (
                    <>
                      <th>Invoice / customer</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th>Outstanding</th>
                      <th>Due date</th>
                      <th />
                    </>
                  ) : section === "customers" ? (
                    <>
                      <th>Customer</th>
                      <th>Email address</th>
                      <th>Phone</th>
                      <th>Added</th>
                      <th />
                    </>
                  ) : section === "payments" ? (
                    <>
                      <th>Customer / invoice</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Date received</th>
                      <th>Reference</th>
                    </>
                  ) : section === "products" ? (
                    <>
                      <th>Product</th>
                      <th>Type</th>
                      <th>Sales price</th>
                      <th>Cost price</th>
                      <th>Variants</th>
                      <th />
                    </>
                  ) : section === "taxes" ? (
                    <>
                      <th>Tax rule</th>
                      <th>Rate</th>
                      <th>Applies</th>
                      <th />
                    </>
                  ) : (
                    <>
                      <th>Team member</th>
                      <th>Email address</th>
                      <th>Role</th>
                      <th>Joined</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data?.items.map((r, index) => (
                  <tr key={r.id}>
                    {section === "subscriptions" ? (
                      <>
                        <td>
                          <div className="person-cell">
                            <Avatar
                              name={r.company || r.customer_name}
                              index={index}
                            />
                            <div>
                              <button
                                className="table-link"
                                onClick={() =>
                                  navigate(`subscriptions/${r.id}`)
                                }
                              >
                                {r.number}
                              </button>
                              <small>{r.company || r.customer_name}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="plan-tag">{r.plan_name}</span>
                          <small className="cell-sub">
                            {label(r.billing_interval)}
                          </small>
                        </td>
                        <td>
                          <Badge status={r.status} />
                        </td>
                        <td className="amount">
                          {money(
                            r.plan_price +
                              r.lines.reduce(
                                (n: number, l: Row) =>
                                  n + l.quantity * l.unit_price,
                                0,
                              ),
                          )}
                          <small className="cell-sub">
                            before discounts & tax
                          </small>
                        </td>
                        <td>
                          {["closed", "paused"].includes(r.status)
                            ? "—"
                            : dateLabel(r.next_billing)}
                        </td>
                        <td>
                          <button
                            className="icon-btn"
                            aria-label={`Open ${r.number}`}
                            onClick={() => navigate(`subscriptions/${r.id}`)}
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </td>
                      </>
                    ) : section === "invoices" ? (
                      <>
                        <td>
                          <div className="person-cell">
                            <span className="table-doc-icon">
                              <FileText size={19} />
                            </span>
                            <div>
                              <button
                                className="table-link"
                                onClick={() => navigate(`invoices/${r.id}`)}
                              >
                                {r.number}
                              </button>
                              <small>{r.company || r.customer_name}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge status={statusFor(r)} />
                          {r.paid > 0 && r.paid < r.total && (
                            <small className="cell-sub">Partially paid</small>
                          )}
                        </td>
                        <td className="amount">{money(r.total)}</td>
                        <td className="amount">
                          {r.status === "cancelled"
                            ? "—"
                            : money(r.total - r.paid)}
                        </td>
                        <td
                          className={
                            statusFor(r) === "overdue" ? "overdue-date" : ""
                          }
                        >
                          {dateLabel(r.due_date)}
                        </td>
                        <td>
                          <button
                            className="icon-btn"
                            aria-label={`Open ${r.number}`}
                            onClick={() => navigate(`invoices/${r.id}`)}
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </td>
                      </>
                    ) : section === "customers" ? (
                      <>
                        <td>
                          <div className="person-cell">
                            <Avatar name={r.company || r.name} index={index} />
                            <div>
                              <b>{r.company || r.name}</b>
                              <small>{r.name}</small>
                            </div>
                          </div>
                        </td>
                        <td>{r.email}</td>
                        <td>{r.phone || "—"}</td>
                        <td>{dateLabel(r.created_at)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-btn"
                              title="New subscription"
                              aria-label={`New subscription for ${r.name}`}
                              onClick={() =>
                                onForm({
                                  collection: "subscriptions",
                                  customerId: r.id,
                                })
                              }
                            >
                              <Plus size={16} />
                            </button>
                            {user.role === "admin" && (
                              <button
                                className="icon-btn"
                                title="Invite to portal"
                                aria-label={`Invite ${r.name} to portal`}
                                onClick={() => onInvite(r)}
                              >
                                <Mail size={16} />
                              </button>
                            )}
                            <button
                              className="icon-btn"
                              aria-label={`Edit ${r.name}`}
                              onClick={() =>
                                onForm({ collection: section, row: r })
                              }
                            >
                              <Edit3 size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : section === "payments" ? (
                      <>
                        <td>
                          <div className="person-cell">
                            <Avatar
                              name={r.company || r.customer_name}
                              index={index}
                            />
                            <div>
                              <b>{r.company || r.customer_name}</b>
                              <button
                                className="small-table-link"
                                onClick={() =>
                                  navigate("invoices/" + r.invoice_id)
                                }
                              >
                                {r.invoice_number}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="amount positive">+{money(r.amount)}</td>
                        <td>
                          <span className="method-tag">
                            <CreditCard size={13} />
                            {label(r.method)}
                          </span>
                        </td>
                        <td>{dateLabel(r.paid_on)}</td>
                        <td className="note-cell">{r.note || "—"}</td>
                      </>
                    ) : section === "products" ? (
                      <>
                        <td>
                          <div className="person-cell">
                            <span className="catalog-icon">
                              <Box size={20} />
                            </span>
                            <div>
                              <b>{r.name}</b>
                              <small>{r.notes}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="tiny-pill">
                            {r.type === "addon" ? "Add-on" : label(r.type)}
                          </span>
                          {Boolean(r.archived) && (
                            <small className="cell-sub">Archived</small>
                          )}
                        </td>
                        <td className="amount">{money(r.price)}</td>
                        <td>{money(r.cost)}</td>
                        <td>
                          {r.variants.length
                            ? r.variants.map((v: Row) => v.name).join(", ")
                            : "Base product"}
                        </td>
                        <td>
                          {canEdit && (
                            <button
                              className="icon-btn"
                              aria-label={`Edit ${r.name}`}
                              onClick={() =>
                                onForm({ collection: section, row: r })
                              }
                            >
                              <Edit3 size={16} />
                            </button>
                          )}
                        </td>
                      </>
                    ) : section === "taxes" ? (
                      <>
                        <td>
                          <b>{r.name}</b>
                        </td>
                        <td>
                          <span className="tax-rate">{r.rate_bps / 100}%</span>
                        </td>
                        <td className="muted">After line discounts</td>
                        <td>
                          <button
                            className="icon-btn"
                            aria-label={`Edit ${r.name}`}
                            onClick={() =>
                              onForm({ collection: section, row: r })
                            }
                          >
                            <Edit3 size={16} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div className="person-cell">
                            <Avatar name={r.name} index={index} />
                            <b>{r.name}</b>
                          </div>
                        </td>
                        <td>{r.email}</td>
                        <td>
                          <Badge
                            status={r.role === "admin" ? "active" : "confirmed"}
                          >
                            {label(r.role)}
                          </Badge>
                        </td>
                        <td>{dateLabel(r.created_at)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && section !== "staff" && (
          <Pagination
            page={page}
            total={total}
            limit={data.limit || 10}
            onPage={setPage}
          />
        )}
      </section>
      {section === "subscriptions" && (
        <div className="process-strip">
          <span>The subscription journey</span>
          {["draft", "quotation", "confirmed", "active", "closed"].map(
            (s, i) => (
              <span key={s}>
                {i > 0 && <ArrowUpRight size={13} />}
                <i className={s} />
                {label(s)}
              </span>
            ),
          )}
        </div>
      )}
      {section === "payments" && (
        <p className="page-note">
          Receipts record funds already received. Payment processing is handled
          by your bank or payment provider.
        </p>
      )}
    </>
  );
}
