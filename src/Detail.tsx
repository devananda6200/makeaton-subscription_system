import { useState } from "react";
import {
  ArrowRight,
  Check,
  CirclePause,
  CreditCard,
  Download,
  Mail,
  Play,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import {
  api,
  type Row,
  type User,
  useResource,
  money,
  dateLabel,
  label,
  navigate,
  now,
  shiftDate,
} from "./lib";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  Modal,
  Skeleton,
} from "./components";

export default function Detail({
  section,
  id,
  user,
  version,
  onClose,
  onChanged,
  onPayment,
}: {
  section: string;
  id: number;
  user: User;
  version: number;
  onClose: () => void;
  onChanged: (message: string) => void;
  onPayment: (invoice: Row) => void;
}) {
  const {
    data: r,
    error,
    loading,
  } = useResource<Row>(`/${section}/${id}`, version);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const [expiry, setExpiry] = useState("");
  const invoice = section === "invoices";
  const team = user.role !== "customer";
  async function action(action: string) {
    setBusy(action);
    setActionError("");
    try {
      await api(`/${section}/${id}/action`, "POST", {
        action,
        ...(action === "renew" ? { expiry_date: expiry } : {}),
      });
      setConfirm("");
      onChanged(
        ["send", "remind"].includes(action)
          ? "Email queued. Delivery status is available in the admin outbox."
          : `${invoice ? "Invoice" : "Subscription"} updated.`,
      );
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const stageIndex = [
    "draft",
    "quotation",
    "confirmed",
    "active",
    "closed",
  ].indexOf(r?.status);
  return (
    <Modal
      wide
      title={r?.number || "Loading details…"}
      subtitle={
        invoice
          ? "Every line, every payment, the whole picture."
          : `Subscription details · internal ID ${id}`
      }
      onClose={onClose}
    >
      {error ? (
        <ErrorBox message={error} />
      ) : !r && loading ? (
        <Skeleton />
      ) : (
        r && (
          <>
            <div className="detail-identity">
              <div className="person-cell">
                <Avatar
                  size="large"
                  name={
                    r.company || r.customer_snapshot?.company || r.customer_name
                  }
                />
                <div>
                  <h3>
                    {r.company ||
                      r.customer_snapshot?.company ||
                      r.customer_name}
                  </h3>
                  <p>
                    {r.customer_snapshot?.email ||
                      `${r.customer_name} · ${r.plan_name}`}
                  </p>
                </div>
              </div>
              <Badge
                status={
                  invoice && r.status === "confirmed" && r.due_date < now()
                    ? "overdue"
                    : r.status
                }
              />
            </div>
            {actionError && <ErrorBox message={actionError} />}{" "}
            {!invoice && (
              <div className="lifecycle">
                {["draft", "quotation", "confirmed", "active", "closed"].map(
                  (s, i) => (
                    <div
                      className={`${i <= stageIndex ? "complete" : ""} ${s === r.status ? "current" : ""}`}
                      key={s}
                    >
                      <span>
                        {i < stageIndex ? <Check size={14} /> : i + 1}
                      </span>
                      <small>{label(s)}</small>
                    </div>
                  ),
                )}
              </div>
            )}
            <div className="detail-facts">
              {(invoice
                ? [
                    ["Issued", dateLabel(r.issued_on)],
                    ["Due date", dateLabel(r.due_date)],
                    ["Billing cycle", dateLabel(r.cycle_date)],
                    ["Subscription", r.subscription_number],
                  ]
                : [
                    ["Started", dateLabel(r.start_date)],
                    ["Term expiry", dateLabel(r.expiry_date)],
                    ["Next bill", dateLabel(r.next_billing)],
                    ["Payment terms", `Net ${r.payment_terms} days`],
                  ]
              ).map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <b>{v}</b>
                </div>
              ))}
            </div>
            {!invoice &&
              r.quote_until &&
              ["draft", "quotation"].includes(r.status) && (
                <div className="info-note">
                  Quotation valid until {dateLabel(r.quote_until)}. Plan base
                  fee: {money(r.plan_price)} per {r.billing_interval}.
                </div>
              )}
            <div className="detail-table table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product / service</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    {invoice && (
                      <>
                        <th>Discount</th>
                        <th>Tax</th>
                      </>
                    )}
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {!invoice && (
                    <tr>
                      <td>{r.plan_name} · base fee</td>
                      <td>1</td>
                      <td>{money(r.plan_price)}</td>
                      <td className="amount">{money(r.plan_price)}</td>
                    </tr>
                  )}
                  {r.lines.map((l: Row, i: number) => (
                    <tr key={i}>
                      <td>
                        <b>{l.name}</b>
                        {l.variant && (
                          <small className="cell-sub">{l.variant}</small>
                        )}
                      </td>
                      <td>{l.quantity}</td>
                      <td>{money(l.unit_price)}</td>
                      {invoice && (
                        <>
                          <td>{money(l.discount)}</td>
                          <td>
                            {money(l.tax)}
                            <small className="cell-sub">
                              {l.tax_bps / 100}%
                            </small>
                          </td>
                        </>
                      )}
                      <td className="amount">
                        {money(invoice ? l.total : l.unit_price * l.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invoice ? (
              <>
                <div className="invoice-totals">
                  <div>
                    <span>Subtotal</span>
                    <b>{money(r.subtotal)}</b>
                  </div>
                  <div>
                    <span>
                      Discount
                      {r.discount_ids?.length
                        ? ` · ${r.discount_ids.map((d: Row) => d.name).join(", ")}`
                        : ""}
                    </span>
                    <b>−{money(r.discount)}</b>
                  </div>
                  <div>
                    <span>Tax</span>
                    <b>{money(r.tax)}</b>
                  </div>
                  <div className="total-line">
                    <span>Invoice total</span>
                    <b>{money(r.total)}</b>
                  </div>
                  <div>
                    <span>Paid to date</span>
                    <b className="positive">{money(r.paid)}</b>
                  </div>
                  <div className="balance-line">
                    <span>
                      {r.status === "cancelled"
                        ? "Cancelled invoice"
                        : "Outstanding"}
                    </span>
                    <b>
                      {r.status === "cancelled" ? "—" : money(r.total - r.paid)}
                    </b>
                  </div>
                </div>
                {r.payments?.length > 0 && (
                  <div className="payment-history">
                    <h3>Payment history</h3>
                    {r.payments.map((p: Row) => (
                      <div key={p.id}>
                        <span className="payment-check">
                          <Check size={16} />
                        </span>
                        <span>
                          <b>{money(p.amount)}</b>
                          <small>
                            {label(p.method)} · {dateLabel(p.paid_on)}
                          </small>
                        </span>
                        <span className="muted">
                          {p.note || "Payment received"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="subscription-invoices">
                <h3>Related invoices</h3>
                {r.invoices?.length ? (
                  <div className="related-list">
                    {r.invoices.map((i: Row) => (
                      <button
                        key={i.id}
                        onClick={() => navigate("invoices/" + i.id)}
                      >
                        <span>{i.number}</span>
                        <Badge status={i.status} />
                        <b>{money(i.total)}</b>
                        <ArrowRight size={15} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted">
                    Invoices will appear here after activation and the first
                    billing run.
                  </p>
                )}
              </div>
            )}
            {confirm && (
              <div className="confirm-action">
                <h3>
                  {confirm === "renew"
                    ? "Give this relationship more room."
                    : confirm === "cancel"
                      ? "Cancel this invoice?"
                      : "Close this subscription?"}
                </h3>
                {confirm === "renew" ? (
                  <label>
                    New term expiry
                    <input
                      type="date"
                      min={shiftDate(r.expiry_date, 1)}
                      required
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                    />
                  </label>
                ) : (
                  <p>
                    {confirm === "cancel"
                      ? "This waives the charge for this billing cycle. It will not be billed again."
                      : "Future billing will stop. Existing invoices and balances remain available."}
                  </p>
                )}
                <div>
                  <Button variant="secondary" onClick={() => setConfirm("")}>
                    Keep as is
                  </Button>
                  <Button
                    variant={confirm === "renew" ? "primary" : "danger"}
                    busy={busy === confirm}
                    disabled={confirm === "renew" && !expiry}
                    onClick={() => action(confirm)}
                  >
                    {confirm === "renew"
                      ? "Renew subscription"
                      : confirm === "cancel"
                        ? "Cancel invoice"
                        : "Close subscription"}
                  </Button>
                </div>
              </div>
            )}
            <div className="detail-actions">
              {invoice ? (
                <>
                  <a
                    className="btn btn-secondary"
                    href={`/api/invoices/${id}/print`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} />
                    Print / PDF
                  </a>
                  {team && r.status === "draft" && (
                    <Button
                      icon={Check}
                      busy={busy === "confirm"}
                      onClick={() => action("confirm")}
                    >
                      Confirm invoice
                    </Button>
                  )}
                  {team && ["confirmed", "paid"].includes(r.status) && (
                    <Button
                      variant="secondary"
                      icon={Mail}
                      busy={busy === "send"}
                      onClick={() => action("send")}
                    >
                      Email invoice
                    </Button>
                  )}
                  {team && r.status === "confirmed" && (
                    <>
                      <Button
                        variant="secondary"
                        icon={Send}
                        busy={busy === "remind"}
                        onClick={() => action("remind")}
                      >
                        Send reminder
                      </Button>
                      <Button icon={CreditCard} onClick={() => onPayment(r)}>
                        Record payment
                      </Button>
                    </>
                  )}
                  {team &&
                    ["draft", "confirmed"].includes(r.status) &&
                    r.paid === 0 && (
                      <Button
                        variant="ghost"
                        onClick={() => setConfirm("cancel")}
                      >
                        Cancel invoice
                      </Button>
                    )}
                </>
              ) : (
                <>
                  {team && r.status === "draft" && (
                    <Button
                      icon={Send}
                      busy={busy === "quote"}
                      onClick={() => action("quote")}
                    >
                      Create quotation
                    </Button>
                  )}
                  {team && r.status === "quotation" && (
                    <Button
                      icon={Check}
                      busy={busy === "confirm"}
                      onClick={() => action("confirm")}
                    >
                      Confirm subscription
                    </Button>
                  )}
                  {team && r.status === "confirmed" && (
                    <Button
                      icon={Play}
                      busy={busy === "activate"}
                      onClick={() => action("activate")}
                    >
                      Activate subscription
                    </Button>
                  )}
                  {r.status === "active" && Boolean(r.allow_pause) && (
                    <Button
                      variant="secondary"
                      icon={CirclePause}
                      busy={busy === "pause"}
                      onClick={() => action("pause")}
                    >
                      Pause subscription
                    </Button>
                  )}
                  {r.status === "paused" && (
                    <Button
                      icon={Play}
                      busy={busy === "resume"}
                      onClick={() => action("resume")}
                    >
                      Resume subscription
                    </Button>
                  )}
                  {["active", "paused", "closed"].includes(r.status) &&
                    Boolean(r.allow_renew) && (
                      <Button
                        variant="secondary"
                        icon={RefreshCw}
                        onClick={() => {
                          setExpiry(
                            shiftDate(
                              r.expiry_date > now() ? r.expiry_date : now(),
                              365,
                            ),
                          );
                          setConfirm("renew");
                        }}
                      >
                        Renew term
                      </Button>
                    )}
                  {r.status !== "closed" && Boolean(r.allow_close) && (
                    <Button
                      variant="ghost"
                      icon={X}
                      onClick={() => setConfirm("close")}
                    >
                      Close subscription
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )
      )}
    </Modal>
  );
}
