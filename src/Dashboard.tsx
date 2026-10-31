import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Download,
  Layers,
  Play,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import {
  type Report,
  type User,
  type Row,
  useResource,
  money,
  number,
  dateLabel,
  now,
  shiftDate,
  navigate,
} from "./lib";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  PageHeading,
  SectionHeading,
  Skeleton,
  StatCard,
} from "./components";

function RevenueChart({ chart }: { chart: Report["chart"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max =
    Math.max(...chart.map((c) => Math.max(c.collected, c.billed)), 10000) *
    1.15;
  const w = 700,
    h = 214,
    left = 56,
    bottom = 28,
    top = 14;
  const x = (i: number) =>
    left + (i * (w - left - 20)) / Math.max(chart.length - 1, 1);
  const y = (v: number) => top + (h - bottom - top) * (1 - v / max);
  const path = (key: "collected" | "billed") =>
    chart.map((d, i) => `${i ? "L" : "M"} ${x(i)} ${y(d[key])}`).join(" ");
  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Collected and billed revenue by month"
      >
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8065ed" stopOpacity=".20" />
            <stop offset="100%" stopColor="#8065ed" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line
              x1={left}
              y1={y(max * p)}
              x2={w - 12}
              y2={y(max * p)}
              stroke="#efedf4"
              strokeDasharray="4 5"
            />
            <text
              x={left - 12}
              y={y(max * p) + 4}
              textAnchor="end"
              className="chart-label"
            >
              {money(max * p, true)}
            </text>
          </g>
        ))}
        <path
          d={`${path("collected")} L ${x(chart.length - 1)} ${h - bottom} L ${left} ${h - bottom} Z`}
          fill="url(#revenueFill)"
        />
        <path
          d={path("billed")}
          fill="none"
          stroke="#c2b8e8"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <path
          d={path("collected")}
          fill="none"
          stroke="#8065ed"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {chart.map((d, i) => (
          <g key={d.month}>
            <text
              x={x(i)}
              y={h - 5}
              textAnchor="middle"
              className="chart-label"
            >
              {dateLabel(d.month + "-01", { month: "short" })}
            </text>
            <circle
              cx={x(i)}
              cy={y(d.collected)}
              r={hover === i ? 6 : 3.5}
              fill="#8065ed"
              stroke="white"
              strokeWidth="2"
            />
            <rect
              x={x(i) - 22}
              y={top}
              width={44}
              height={h - bottom - top}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            {hover === i && (
              <g>
                <rect
                  x={Math.min(w - 172, Math.max(2, x(i) - 75))}
                  y={Math.max(2, y(d.collected) - 40)}
                  width="160"
                  height="29"
                  rx="6"
                  fill="#27223f"
                />
                <text
                  x={Math.min(w - 92, Math.max(82, x(i) + 5))}
                  y={Math.max(2, y(d.collected) - 40) + 19}
                  textAnchor="middle"
                  fill="white"
                  fontSize="11"
                >
                  Collected {money(d.collected)}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
function MixChart({ breakdown }: { breakdown: Report["breakdown"] }) {
  const colors: Record<string, string> = {
    active: "#8165ed",
    paused: "#f3b665",
    quotation: "#8fb6ff",
    confirmed: "#81c4c1",
    draft: "#ddd9e9",
    closed: "#b4b2c0",
  };
  const total = breakdown.reduce((n, b) => n + b.count, 0);
  let start = 0;
  return (
    <div className="mix-body">
      <div className="donut-wrap">
        <svg
          viewBox="0 0 180 180"
          aria-label="Subscription status distribution"
          role="img"
        >
          <circle
            cx="90"
            cy="90"
            r="65"
            fill="none"
            stroke="#f0edf5"
            strokeWidth="21"
          />
          {breakdown.map((b) => {
            const length = (b.count / (total || 1)) * 408.4;
            const offset = start;
            start += length;
            return (
              <circle
                key={b.status}
                cx="90"
                cy="90"
                r="65"
                fill="none"
                stroke={colors[b.status]}
                strokeWidth="21"
                strokeDasharray={`${Math.max(0, length - 4)} ${408.4 - Math.max(0, length - 4)}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 90 90)"
              />
            );
          })}
          <text x="90" y="90" textAnchor="middle" className="donut-value">
            {total}
          </text>
          <text x="90" y="111" textAnchor="middle" className="donut-caption">
            subscriptions
          </text>
        </svg>
      </div>
      <div className="mix-legend">
        {breakdown.map((b) => (
          <button
            key={b.status}
            onClick={() => navigate(`subscriptions?status=${b.status}`)}
          >
            <span>
              <i style={{ background: colors[b.status] }} />
              {b.status[0].toUpperCase() + b.status.slice(1)}
            </span>
            <b>{b.count}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
export default function Dashboard({
  user,
  version,
  onBilling,
  onCreate,
  reports = false,
}: {
  user: User;
  version: number;
  onBilling: () => void;
  onCreate: () => void;
  reports?: boolean;
}) {
  const [range, setRange] = useState("180");
  const [plan, setPlan] = useState("");
  const [customFrom, setCustomFrom] = useState(shiftDate(now(), -179));
  const [customTo, setCustomTo] = useState(now());
  const from =
    range === "custom" ? customFrom : shiftDate(now(), -Number(range) + 1);
  const to = range === "custom" ? customTo : now();
  const params = new URLSearchParams({
    from,
    to,
    ...(plan ? { plan_id: plan } : {}),
  }).toString();
  const {
    data: r,
    error,
    loading,
  } = useResource<Report>("/reports?" + params, version);
  const { data: lookups } = useResource<{ plans: Row[] }>("/lookups", version);
  const customer = user.role === "customer";
  const { data: recent } = useResource<{ items: Row[] }>(
    customer ? null : "/activity",
    version,
  );
  return (
    <>
      <PageHeading
        eyebrow={
          customer
            ? "YOUR CUSTOMER PORTAL"
            : reports
              ? "MEASURE WHAT MATTERS"
              : "YOUR BUSINESS, AT A GLANCE"
        }
        title={
          reports
            ? "The bigger picture."
            : customer
              ? `Welcome, ${user.name.split(" ")[0]}.`
              : `Good things are growing, ${user.name.split(" ")[0]}.`
        }
        description={
          reports
            ? "Clear numbers. Better decisions. See where your business is headed."
            : customer
              ? "Your subscriptions, invoices, and next steps. All right here."
              : "Here’s what’s happening across your subscription business."
        }
      >
        <div className="select-with-icon">
          <CalendarDays size={16} />
          <select
            aria-label="Report date range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="180">Last 6 months</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        {reports ? (
          <a
            className="btn btn-secondary"
            href={"/api/reports/export?" + params}
          >
            <Download size={16} />
            Export report
          </a>
        ) : (
          !customer && (
            <Button onClick={onCreate} icon={Layers}>
              New subscription
            </Button>
          )
        )}
      </PageHeading>
      {(range === "custom" || reports) && (
        <div className="report-filters">
          {range === "custom" && (
            <>
              <label>
                From
                <input
                  type="date"
                  aria-label="Report from"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  aria-label="Report to"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </>
          )}
          {reports && (
            <label>
              Plan
              <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="">All plans</option>
                {lookups?.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {error && <ErrorBox message={error} />}{" "}
      {!r && loading ? (
        <Skeleton cards />
      ) : (
        r && (
          <>
            <div className="metric-grid">
              <StatCard
                label={
                  customer
                    ? "Your active subscriptions"
                    : "Monthly recurring revenue"
                }
                value={customer ? number(r.active) : money(r.mrr)}
                note={
                  customer
                    ? "All your services, connected"
                    : "Current · before discounts & tax"
                }
                icon={TrendingUp}
                tone="violet"
                action={() => navigate("subscriptions?status=active")}
              />
              <StatCard
                label={customer ? "Payments made" : "Active subscriptions"}
                value={customer ? money(r.collected) : number(r.active)}
                note={
                  customer
                    ? "Collected in the selected period"
                    : `${r.breakdown.reduce((n, b) => n + b.count, 0)} subscriptions in your workspace`
                }
                icon={Layers}
                tone="blue"
                action={() => navigate("subscriptions")}
              />
              <StatCard
                label="Cash collected"
                value={money(r.collected)}
                note={`${number(r.payment_count)} payments · selected period`}
                icon={Wallet}
                tone="mint"
                action={() => navigate(customer ? "invoices" : "payments")}
              />
              <StatCard
                label="Outstanding balance"
                value={money(r.outstanding)}
                note={
                  r.overdue_count
                    ? `${r.overdue_count} overdue invoices need attention`
                    : "All confirmed receivables · today"
                }
                icon={CreditCard}
                tone="peach"
                action={() => navigate("invoices?status=confirmed")}
              />
            </div>
            {!customer && !reports && (
              <div className="billing-banner">
                <span className="banner-icon">
                  <Zap size={22} />
                </span>
                <div>
                  <b>
                    {r.due
                      ? `Your next billing run is ready.`
                      : "You’re all caught up."}
                  </b>
                  <p>
                    {r.due
                      ? `${r.due} subscriptions are due. Turn them into accurate invoices in one click.`
                      : "No subscriptions are due right now. We’ll keep an eye on the next cycle."}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  icon={r.due ? Play : RefreshCw}
                  onClick={onBilling}
                >
                  {r.due ? "Run billing" : "Check billing"}
                </Button>
              </div>
            )}
            <div className="dashboard-charts">
              <section className="panel revenue-panel">
                <SectionHeading
                  title={
                    customer ? "Your payment history" : "Revenue at a glance"
                  }
                  subtitle={`${dateLabel(r.from)} – ${dateLabel(r.to)}`}
                  action={<span className="tiny-pill">INR</span>}
                />
                <div className="revenue-summary">
                  <div>
                    <strong>{money(r.collected)}</strong>
                    <span>total collected</span>
                  </div>
                  <div className="chart-key">
                    <span>
                      <i />
                      Collected
                    </span>
                    <span>
                      <i className="key-billed" />
                      Billed
                    </span>
                  </div>
                </div>
                <RevenueChart chart={r.chart} />
              </section>
              <section className="panel">
                <SectionHeading
                  title="Your subscription mix"
                  subtitle="A little perspective on every stage"
                />
                <MixChart breakdown={r.breakdown} />
              </section>
            </div>
            {reports && (
              <div className="metric-grid report-extra">
                <StatCard
                  label="Annual recurring run rate"
                  value={money(r.arr)}
                  note="Current normalized MRR × 12"
                  icon={TrendingUp}
                />
                <StatCard
                  label="Confirmed billing"
                  value={money(r.billed)}
                  note="Issued in the selected period"
                  icon={CircleDollarSign}
                  tone="blue"
                />
                <StatCard
                  label="Overdue receivables"
                  value={money(r.overdue)}
                  note="Current balances, regardless of period"
                  icon={CreditCard}
                  tone="peach"
                />
                <StatCard
                  label="Due for billing"
                  value={String(r.due)}
                  note="Subscriptions awaiting their next cycle"
                  icon={RefreshCw}
                  tone="mint"
                />
              </div>
            )}
            <div className="dashboard-bottom">
              <section className="panel attention-panel">
                <SectionHeading
                  title="A little attention goes a long way"
                  subtitle={
                    r.overdue_count
                      ? `${r.overdue_count} overdue invoices. Let’s close the loop.`
                      : "Your overdue invoices will appear here."
                  }
                  action={
                    <button
                      className="text-link"
                      onClick={() => navigate("invoices?status=overdue")}
                    >
                      View all <ArrowUpRight size={15} />
                    </button>
                  }
                />
                {r.overdueInvoices.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Invoice</th>
                          <th>Balance due</th>
                          <th>Due date</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {r.overdueInvoices.slice(0, 4).map((i, index) => (
                          <tr key={i.id}>
                            <td>
                              <div className="person-cell">
                                <Avatar
                                  name={i.company || i.customer_name}
                                  index={index}
                                />
                                <div>
                                  <b>{i.company || i.customer_name}</b>
                                  <small>{i.customer_name}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <button
                                className="table-link"
                                onClick={() => navigate("invoices/" + i.id)}
                              >
                                {i.number}
                              </button>
                            </td>
                            <td className="amount">
                              {money(i.total - i.paid)}
                            </td>
                            <td>
                              <span className="overdue-date">
                                {dateLabel(i.due_date, {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon-btn"
                                aria-label={`Open ${i.number}`}
                                onClick={() => navigate("invoices/" + i.id)}
                              >
                                <ArrowUpRight size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="All in good time."
                    description="No overdue invoices. That’s one less thing to think about."
                  />
                )}
              </section>
              <section className="panel renewal-panel">
                <SectionHeading
                  title="Coming around again"
                  subtitle="Renewals in the next 14 days"
                />
                {r.renewals.length ? (
                  <div className="renewal-list">
                    {r.renewals.slice(0, 4).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => navigate("subscriptions/" + s.id)}
                      >
                        <span className="renewal-date">
                          <b>{dateLabel(s.next_billing, { day: "numeric" })}</b>
                          <small>
                            {dateLabel(s.next_billing, { month: "short" })}
                          </small>
                        </span>
                        <span>
                          <b>{s.customer_name}</b>
                          <small>
                            {s.plan_name} · {s.number}
                          </small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="Room to breathe."
                    description="No renewals in the next two weeks."
                  />
                )}
                <button
                  className="panel-footer-link"
                  onClick={() => navigate("subscriptions")}
                >
                  Explore subscriptions <ArrowRight size={15} />
                </button>
              </section>
            </div>
            {!customer && !reports && (
              <div className="dashboard-footnote">
                <div>
                  <span className="live-dot" />
                  Connected to your live workspace <span>·</span> All amounts in
                  INR
                </div>
                <button onClick={() => navigate("activity")}>
                  <Sparkles size={14} />
                  {recent?.items[0]?.action || "Every change tells a story"}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}
