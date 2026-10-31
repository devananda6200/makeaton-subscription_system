import {
  useEffect,
  useRef,
  useId,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  X,
  LoaderCircle,
  ArrowUpRight,
  Inbox,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  type LucideIcon,
} from "lucide-react";
import { initials, label } from "./lib";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <ellipse
            cx="16"
            cy="20"
            rx="7"
            ry="12"
            transform="rotate(30 16 20)"
            stroke="currentColor"
            strokeWidth="4"
          />
          <ellipse
            cx="24"
            cy="20"
            rx="7"
            ry="12"
            transform="rotate(30 24 20)"
            stroke="currentColor"
            strokeWidth="4"
          />
        </svg>
      </span>
      {!small && (
        <span>
          brightloop<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function Button({
  children,
  icon: Icon,
  variant = "primary",
  busy,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy ? (
        <LoaderCircle size={16} className="spin" />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  );
}
export function Badge({
  status,
  children,
}: {
  status: string;
  children?: ReactNode;
}) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="status-dot" />
      {children || label(status)}
    </span>
  );
}
export function Avatar({
  name,
  index = 0,
  size = "normal",
}: {
  name: string;
  index?: number;
  size?: "normal" | "small" | "large";
}) {
  return (
    <span className={`avatar avatar-${index % 6} avatar-${size}`}>
      {initials(name || "?")}
    </span>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    document.body.classList.add("modal-open");
    return () => {
      dialog.close();
      if (!document.querySelector("dialog[open]"))
        document.body.classList.remove("modal-open");
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "Your next chapter starts with a new record.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  );
}
export function Skeleton({ cards = false }: { cards?: boolean }) {
  return (
    <div
      aria-label="Loading"
      className={cards ? "metric-grid" : "skeleton-stack"}
    >
      {Array.from({ length: cards ? 4 : 5 }, (_, i) => (
        <div key={i} className={`skeleton ${cards ? "skeleton-card" : ""}`} />
      ))}
    </div>
  );
}
export function Pagination({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}`
          : "0 records"}
      </span>
      <div>
        <Button
          variant="secondary"
          aria-label="Previous page"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          icon={ChevronLeft}
        />
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / limit))}
        </span>
        <Button
          variant="secondary"
          aria-label="Next page"
          onClick={() => onPage(page + 1)}
          disabled={page * limit >= total}
          icon={ChevronRight}
        />
      </div>
    </div>
  );
}
export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function StatCard({
  label: title,
  value,
  note,
  icon: Icon,
  tone = "violet",
  action,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: string;
  action?: () => void;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-bottom">
        <span>{note}</span>
        {action && (
          <button
            className="mini-link"
            onClick={action}
            aria-label={`View ${title}`}
          >
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
export function Toast({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <div className={`toast ${error ? "toast-error" : ""}`} role="status">
      {error ? <AlertCircle size={18} /> : <Check size={18} />}
      <span>{text}</span>
    </div>
  );
}
