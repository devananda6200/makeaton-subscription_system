import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Box,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  CreditCard,
  FileText,
  Gauge,
  LayoutDashboard,
  Layers,
  LogOut,
  Mail,
  Menu,
  Percent,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  type User,
  type Row,
  type Report,
  type PageResult,
  useResource,
  useRoute,
  useDebounced,
  navigate,
  label,
  money,
  dateLabel,
} from "./lib";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  Logo,
  Modal,
  PageHeading,
  Skeleton,
  Toast,
} from "./components";
import Auth from "./Auth";
import Dashboard from "./Dashboard";
import Records from "./Records";
import RecordForm, { PaymentForm, type FormSpec } from "./Forms";
import Detail from "./Detail";

const navGroups = [
  {
    name: "WORKSPACE",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "subscriptions", label: "Subscriptions", icon: Layers },
      { id: "invoices", label: "Invoices", icon: FileText },
      { id: "payments", label: "Payments", icon: CreditCard },
      { id: "customers", label: "Customers", icon: Users },
    ],
  },
  {
    name: "BUILD & GROW",
    items: [
      { id: "products", label: "Products", icon: Box },
      { id: "plans", label: "Billing plans", icon: Tag },
      { id: "templates", label: "Quote templates", icon: CopyIcon },
      { id: "discounts", label: "Discounts", icon: Percent },
      { id: "reports", label: "Reports", icon: Gauge },
    ],
  },
];
function CopyIcon(props: React.ComponentProps<typeof FileText>) {
  return <FileText {...props} />;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [boot, setBoot] = useState(true);
  const [demo, setDemo] = useState(false);
  const [emailMode, setEmailMode] = useState("outbox");
  const [bootError, setBootError] = useState("");
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [payment, setPayment] = useState<Row | true | null>(null);
  const [panel, setPanel] = useState("");
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const route = useRoute();
  useEffect(() => {
    api("/auth/me")
      .then((r) => {
        setUser(r.user);
        setDemo(r.demo);
        setEmailMode(r.email_mode);
      })
      .catch((e) => setBootError(e.message))
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const expire = () => {
      setUser(null);
      setForm(null);
      setPayment(null);
      setPanel("");
    };
    window.addEventListener("brightloop:session-expired", expire);
    return () =>
      window.removeEventListener("brightloop:session-expired", expire);
  }, []);
  useEffect(() => {
    setMobile(false);
    document.title = `${label(route.section)} · Brightloop`;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [route.section]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (user) setPanel("search");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [user]);
  function changed(text: string) {
    setVersion((v) => v + 1);
    setToast({ text });
  }
  function saved(text: string) {
    setForm(null);
    setPayment(null);
    changed(text);
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST", {});
      setUser(null);
      setPanel("");
      navigate("overview");
    } catch (e) {
      setToast({ text: (e as Error).message, error: true });
    }
  }
  async function invite(row: Row) {
    try {
      await api(`/customers/${row.id}/invite`, "POST", {});
      changed(`Portal invitation queued for ${row.email}.`);
    } catch (e) {
      setToast({ text: (e as Error).message, error: true });
    }
  }
  if (boot)
    return (
      <div className="boot-screen">
        <Logo />
        <span className="loading-line" />
        <p>Connecting the dots…</p>
      </div>
    );
  if (bootError)
    return (
      <div className="boot-screen">
        <Logo />
        <ErrorBox message={bootError} />
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  if (!user) return <Auth demo={demo} onLogin={setUser} />;
  const customer = user.role === "customer";
  const admin = user.role === "admin";
  const allowed = customer
    ? ["overview", "subscriptions", "invoices"]
    : admin
      ? [
          "overview",
          "subscriptions",
          "invoices",
          "payments",
          "customers",
          "products",
          "plans",
          "templates",
          "discounts",
          "reports",
          "taxes",
          "staff",
          "settings",
          "activity",
          "outbox",
        ]
      : [
          "overview",
          "subscriptions",
          "invoices",
          "payments",
          "customers",
          "products",
          "plans",
          "templates",
          "reports",
          "activity",
          "settings",
        ];
  const section = allowed.includes(route.section) ? route.section : "overview";
  const sectionName =
    navGroups.flatMap((g) => g.items).find((i) => i.id === section)?.label ||
    label(section);
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <a href="#/overview" aria-label="Brightloop overview">
          <Logo />
        </a>
        <div className="workspace-switch">
          <span className="workspace-monogram">B</span>
          <div>
            <b>Brightloop Software</b>
            <small>
              {customer
                ? "Your customer portal"
                : demo
                  ? "Demo workspace"
                  : "Business workspace"}
            </small>
          </div>
          <ChevronsUpDown size={15} />
        </div>
        <nav aria-label="Main navigation">
          {navGroups.map((g) => {
            const items = g.items.filter((i) => allowed.includes(i.id));
            return (
              items.length > 0 && (
                <div className="nav-group" key={g.name}>
                  <div className="nav-label">
                    {customer ? "YOUR WORKSPACE" : g.name}
                  </div>
                  {items.map(({ id, label, icon: Icon }) => (
                    <a
                      key={id}
                      href={`#/${id}`}
                      className={`nav-item ${section === id ? "nav-active" : ""}`}
                      aria-current={section === id ? "page" : undefined}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                      {id === "subscriptions" && <span className="nav-dot" />}
                    </a>
                  ))}
                </div>
              )
            );
          })}
        </nav>
        {!customer && (
          <div className="sidebar-bottom-nav">
            <a
              href="#/activity"
              className={`nav-item ${section === "activity" ? "nav-active" : ""}`}
            >
              <Activity size={18} />
              <span>Activity log</span>
            </a>
            <a
              href="#/settings"
              className={`nav-item ${["settings", "taxes", "staff", "outbox"].includes(section) ? "nav-active" : ""}`}
            >
              <Settings2 size={18} />
              <span>Settings</span>
            </a>
          </div>
        )}
        <div className="sidebar-tip">
          <span className="tip-spark">
            <Sparkles size={17} />
          </span>
          <b>
            Less busywork.
            <br />
            More bright ideas.
          </b>
          <p>Keep every part of your subscription business in the loop.</p>
          <button onClick={() => setPanel("guide")}>
            Explore your workspace <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-profile">
          <Avatar name={user.name} />
          <div>
            <b>{user.name}</b>
            <small>
              {customer
                ? "Customer"
                : admin
                  ? "Workspace admin"
                  : "Team member"}
            </small>
          </div>
          <button
            className="icon-btn"
            aria-label="Sign out"
            title="Sign out"
            onClick={logout}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              {customer ? "Portal" : "Workspace"} <span>/</span>{" "}
              <b>{sectionName}</b>
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              onClick={() => setPanel("search")}
            >
              <Search size={16} />
              <span>Search anything…</span>
              <kbd>Ctrl K</kbd>
            </button>
            {demo && (
              <span className="demo-pill">
                <span />
                Demo workspace
              </span>
            )}
            <button
              className="icon-btn"
              aria-label="Workspace guide"
              onClick={() => setPanel("guide")}
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-btn notification-button"
              aria-label="Notifications"
              onClick={() => setPanel("notifications")}
            >
              <Bell size={19} />
              <i />
            </button>
            <span className="topbar-divider" />
            <Avatar name={user.name} size="small" />
          </div>
        </header>
        <main id="main-content" className="main-content">
          {section === "overview" || section === "reports" ? (
            <Dashboard
              key={section}
              user={user}
              version={version}
              onBilling={() => setPanel("billing")}
              onCreate={() => setForm({ collection: "subscriptions" })}
              reports={section === "reports"}
            />
          ) : section === "settings" ? (
            <Settings
              admin={admin}
              demo={demo}
              emailMode={emailMode}
              onGuide={() => setPanel("guide")}
            />
          ) : section === "activity" || section === "outbox" ? (
            <Journal
              section={section}
              version={version}
              emailMode={emailMode}
              onChanged={changed}
            />
          ) : (
            <Records
              key={section}
              section={section}
              user={user}
              version={version}
              initialStatus={route.status}
              onForm={setForm}
              onPayment={() => setPayment(true)}
              onBilling={() => setPanel("billing")}
              onInvite={invite}
            />
          )}
          <footer className="workspace-footer">
            <Logo small />
            <span>A little less friction. A lot more flow.</span>
            <span>
              Brightloop ·{" "}
              {customer
                ? "Your customer portal"
                : "Your subscription workspace"}
            </span>
          </footer>
        </main>
      </div>
      {route.id && ["subscriptions", "invoices"].includes(section) && (
        <Detail
          key={`${section}-${route.id}`}
          section={section}
          id={route.id}
          user={user}
          version={version}
          onClose={() => navigate(section)}
          onChanged={changed}
          onPayment={setPayment}
        />
      )}{" "}
      {form && (
        <RecordForm spec={form} onClose={() => setForm(null)} onSaved={saved} />
      )}{" "}
      {payment && (
        <PaymentForm
          invoice={payment === true ? undefined : payment}
          onClose={() => setPayment(null)}
          onSaved={saved}
        />
      )}{" "}
      {panel === "billing" && (
        <BillingRun onClose={() => setPanel("")} onChanged={changed} />
      )}{" "}
      {panel === "search" && (
        <SearchDialog user={user} onClose={() => setPanel("")} />
      )}{" "}
      {panel === "guide" && (
        <Guide customer={customer} demo={demo} onClose={() => setPanel("")} />
      )}{" "}
      {panel === "notifications" && (
        <Notifications version={version} onClose={() => setPanel("")} />
      )}{" "}
      {toast && <Toast {...toast} />}
    </div>
  );
}

function BillingRun({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const { data } = useResource<Report>("/reports");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    created: number;
    total: number;
    closed: number;
    remaining: number;
  } | null>(null);
  async function run() {
    setBusy(true);
    setError("");
    try {
      const r = await api("/billing/run", "POST", {});
      setResult(r);
      onChanged(`Billing complete: ${r.created} draft invoices created.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Let’s close the billing loop."
      subtitle="All due subscriptions. One simple step."
      onClose={onClose}
    >
      {error && <ErrorBox message={error} />}
      <div className="billing-preview">
        <span className="billing-preview-icon">
          {result ? <Check size={30} /> : <Zap size={30} />}
        </span>
        <h3>
          {result
            ? `${result.created} invoices, ready for review.`
            : `${data?.due ?? "…"} subscriptions ready to bill.`}
        </h3>
        <p>
          {result
            ? `${money(result.total)} in new invoices. ${result.closed} expired subscriptions closed.${result.remaining ? ` ${result.remaining} subscriptions remain; run billing again to continue.` : ""}`
            : "We’ll calculate product lines, eligible discounts, and taxes for every due cycle. Your invoices start as drafts so you can review them."}
        </p>
        <div className="billing-steps">
          <span>
            <Check size={15} />
            Automatic tax & discounts
          </span>
          <span>
            <Check size={15} />
            Existing cycles won’t be billed again
          </span>
          <span>
            <Check size={15} />
            Expired terms handled automatically
          </span>
        </div>
      </div>
      <div className="form-footer">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {result && !result.remaining ? (
          <Button
            icon={ArrowRight}
            onClick={() => {
              onClose();
              navigate("invoices?status=draft");
            }}
          >
            Review draft invoices
          </Button>
        ) : (
          <Button icon={Zap} busy={busy} onClick={run}>
            {result ? "Continue billing" : "Run billing now"}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function SearchDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const { data: subs } = useResource<PageResult>(
    search ? "/subscriptions?limit=5&q=" + encodeURIComponent(search) : null,
  );
  const { data: invoices } = useResource<PageResult>(
    search ? "/invoices?limit=5&q=" + encodeURIComponent(search) : null,
  );
  function go(path: string) {
    navigate(path);
    onClose();
  }
  return (
    <Modal
      title="Find your way around."
      subtitle="Search by customer, company, subscription, or invoice number."
      onClose={onClose}
    >
      <div className="search-input search-large">
        <Search size={20} />
        <input
          autoFocus
          aria-label="Search workspace"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try Acme, SUB-00001, or INV…"
        />
      </div>
      {!search ? (
        <div className="quick-links">
          {[
            "overview",
            "subscriptions",
            "invoices",
            ...(user.role !== "customer" ? ["customers", "reports"] : []),
          ].map((s) => (
            <button key={s} onClick={() => go(s)}>
              <Layers size={17} />
              {label(s)}
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <div className="search-results">
          {[
            ["Subscriptions", subs, "subscriptions"],
            ["Invoices", invoices, "invoices"],
          ].map(([title, data, section]) => (
            <div key={String(title)}>
              <h3>{String(title)}</h3>
              {(data as PageResult | undefined)?.items.map((r) => (
                <button key={r.id} onClick={() => go(`${section}/${r.id}`)}>
                  <span>
                    <b>{r.number}</b>
                    <small>{r.company || r.customer_name}</small>
                  </span>
                  <Badge status={r.status} />
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ))}
          {subs?.items.length === 0 && invoices?.items.length === 0 && (
            <Empty
              title="No matches yet."
              description="Try a different name or record number."
            />
          )}
        </div>
      )}
    </Modal>
  );
}

function Notifications({
  version,
  onClose,
}: {
  version: number;
  onClose: () => void;
}) {
  const { data: r, error } = useResource<Report>("/reports", version);
  return (
    <Modal
      title="A few things on your radar."
      subtitle="Live signals from your subscription workspace."
      onClose={onClose}
    >
      {error ? (
        <ErrorBox message={error} />
      ) : !r ? (
        <Skeleton />
      ) : (
        <div className="notifications-list">
          {[
            [
              r.overdue_count,
              "Invoices need a little nudge",
              `${money(r.overdue)} in overdue balances`,
              "invoices?status=overdue",
            ],
            [
              r.due,
              "Subscriptions ready for billing",
              "Create the next set of draft invoices",
              "subscriptions?status=active",
            ],
            [
              r.renewals.length,
              "Renewals around the corner",
              "Coming up in the next 14 days",
              "subscriptions",
            ],
          ].map(([count, title, note, path]) => (
            <button
              key={String(title)}
              onClick={() => {
                navigate(String(path));
                onClose();
              }}
            >
              <span className="notification-count">{count}</span>
              <div>
                <b>{title}</b>
                <p>{note}</p>
              </div>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Settings({
  admin,
  demo,
  emailMode,
  onGuide,
}: {
  admin: boolean;
  demo: boolean;
  emailMode: string;
  onGuide: () => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE SETTINGS"
        title="Set up for smoother days."
        description="The small details that help your whole business work better."
      />
      <div className="settings-grid">
        {(admin
          ? [
              {
                icon: Users,
                title: "Your team",
                description:
                  "Invite internal staff. Keep admin controls where they belong.",
                path: "staff",
              },
              {
                icon: Percent,
                title: "Tax rules",
                description:
                  "Configure rates that automatically apply to product and plan lines.",
                path: "taxes",
              },
              {
                icon: Mail,
                title: "Email outbox",
                description:
                  emailMode === "smtp"
                    ? "Inspect email delivery and retry failed messages."
                    : "Preview queued invoices, reminders, and password-reset messages.",
                path: "outbox",
              },
            ]
          : []
        ).map(({ icon: Icon, title, description, path }) => (
          <button
            className="panel setting-card"
            key={path}
            onClick={() => navigate(path)}
          >
            <span className="catalog-icon">
              <Icon size={23} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="text-link">
              Open settings <ArrowUpRight size={15} />
            </span>
          </button>
        ))}
        <button className="panel setting-card" onClick={onGuide}>
          <span className="catalog-icon mint">
            <BookOpen size={23} />
          </span>
          <h3>A little guidance</h3>
          <p>
            Walk through your first billing cycle and discover your workspace.
          </p>
          <span className="text-link">
            Explore the guide <ArrowUpRight size={15} />
          </span>
        </button>
      </div>
      <section className="panel workspace-info">
        <h2>Workspace details</h2>
        <div>
          <span>Company</span>
          <b>Brightloop Software</b>
        </div>
        <div>
          <span>Ledger currency</span>
          <b>INR · Indian Rupee</b>
        </div>
        <div>
          <span>Workspace mode</span>
          <Badge status={demo ? "quotation" : "active"}>
            {demo ? "Fictional demo data" : "Production workspace"}
          </Badge>
        </div>
        <div>
          <span>Email delivery</span>
          <b>
            {emailMode === "smtp"
              ? "SMTP delivery enabled"
              : "Outbox preview · SMTP not configured"}
          </b>
        </div>
        <div>
          <span>Account protection</span>
          <span>
            <ShieldCheck size={15} />
            Secure sessions & role permissions
          </span>
        </div>
      </section>
    </>
  );
}

function Journal({
  section,
  version,
  emailMode,
  onChanged,
}: {
  section: string;
  version: number;
  emailMode: string;
  onChanged: (message: string) => void;
}) {
  const { data, error, loading } = useResource<{ items: Row[] }>(
    `/${section}`,
    version,
  );
  const [expanded, setExpanded] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  async function retry(id: number) {
    try {
      await api(`/outbox/${id}/retry`, "POST", {});
      onChanged("Message queued for another delivery attempt.");
    } catch (e) {
      setActionError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={section === "outbox" ? "EMAIL OUTBOX" : "ACTIVITY LOG"}
        title={
          section === "outbox"
            ? "Every message, in the loop."
            : "A clear trail of what changed."
        }
        description={
          section === "outbox"
            ? emailMode === "smtp"
              ? "Delivery status for invoices, reminders, and account messages."
              : "Email preview is active. Messages are queued here until SMTP is configured."
            : "A shared view of the work that keeps your business moving."
        }
      />
      {error || actionError ? (
        <ErrorBox message={error || actionError} />
      ) : null}
      <section className="panel journal">
        {!data && loading ? (
          <Skeleton />
        ) : data?.items.length === 0 ? (
          <Empty
            title={
              section === "outbox"
                ? "Your outbox is quiet."
                : "Your story starts here."
            }
            description={
              section === "outbox"
                ? "Send an invoice or request a password reset to see a message here."
                : "Changes to subscriptions, billing, and payments will appear here."
            }
          />
        ) : (
          data?.items.map((r) => (
            <div key={r.id} className="journal-entry">
              <span
                className={`journal-icon ${section === "outbox" ? "blue" : ""}`}
              >
                {section === "outbox" ? (
                  <Mail size={18} />
                ) : r.entity === "invoice" ? (
                  <FileText size={18} />
                ) : (
                  <Activity size={18} />
                )}
              </span>
              <div className="journal-content">
                <div>
                  <b>{section === "outbox" ? r.subject : r.action}</b>
                  <time>
                    {dateLabel(r.created_at)} · {r.created_at.slice(11, 16)} UTC
                  </time>
                </div>
                <p>
                  {section === "outbox"
                    ? r.recipient
                    : `${r.actor} · ${r.detail}`}
                </p>
                {section === "outbox" && (
                  <>
                    <div className="email-entry-actions">
                      <Badge
                        status={
                          r.status === "sent"
                            ? "paid"
                            : r.status === "failed"
                              ? "overdue"
                              : "draft"
                        }
                      >
                        {label(r.status)}
                      </Badge>
                      <button
                        className="text-link"
                        onClick={() =>
                          setExpanded(expanded === r.id ? null : r.id)
                        }
                      >
                        {expanded === r.id ? "Hide message" : "Read message"}
                      </button>
                      {r.status === "failed" && (
                        <button
                          className="text-link"
                          onClick={() => retry(r.id)}
                        >
                          Retry delivery
                        </button>
                      )}
                    </div>
                    {expanded === r.id && (
                      <pre className="email-preview">{r.body}</pre>
                    )}
                    {r.error && <p className="overdue-date">{r.error}</p>}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </section>
      <p className="page-note">
        Showing the latest 60 {section === "outbox" ? "messages" : "events"}.
      </p>
    </>
  );
}

function Guide({
  customer,
  demo,
  onClose,
}: {
  customer: boolean;
  demo: boolean;
  onClose: () => void;
}) {
  const steps = customer
    ? [
        [
          "Your services, at a glance",
          "Open Subscriptions to see your plan, product lines, next billing date, and term.",
        ],
        [
          "Make it work for you",
          "Pause, resume, renew, or close a subscription when your plan permits.",
        ],
        [
          "Every invoice, in one place",
          "Open Invoices to see balances, payment history, and a printable copy.",
        ],
      ]
    : [
        [
          "Make your offer",
          "Create products and plans, or start with one of the ready-to-use quotation templates.",
        ],
        [
          "Build the relationship",
          "Create a draft subscription. Move it through Quotation, Confirmed, and Active.",
        ],
        [
          "Let billing do its thing",
          "Run billing from Overview. Due cycles become draft invoices with applicable discounts and tax.",
        ],
        [
          "Close the loop",
          "Confirm an invoice, email it, and record a partial or full payment. Your reports update instantly.",
        ],
      ];
  return (
    <Modal
      title="Good business, one loop at a time."
      subtitle="A quick guide to your Brightloop workspace."
      onClose={onClose}
    >
      <div className="guide-steps">
        {steps.map(([title, description], i) => (
          <div key={title}>
            <span>{i + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </div>
        ))}
      </div>
      {demo && (
        <div className="info-note">
          <b>You’re exploring a demo.</b>
          <p>
            All companies, balances, and receipts are fictional. Changes persist
            on this server, so you can demonstrate the whole journey. Sign out
            to try the staff or customer view.
          </p>
        </div>
      )}
      <div className="form-footer">
        <Button icon={ArrowRight} onClick={onClose}>
          Let’s get started
        </Button>
      </div>
    </Modal>
  );
}
