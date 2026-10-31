import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Layers,
  CreditCard,
  ChartNoAxesCombined,
  Sparkles,
  ArrowUpRight,
  Mail,
  KeyRound,
} from "lucide-react";
import { api, type User } from "./lib";
import { Logo, Button, ErrorBox } from "./components";

export default function Auth({
  demo,
  onLogin,
}: {
  demo: boolean;
  onLogin: (user: User) => void;
}) {
  const resetToken = new URLSearchParams(window.location.search).get("reset");
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
    resetToken ? "reset" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login" || mode === "register") {
        const result = await api(`/auth/${mode}`, "POST", {
          email,
          password,
          name,
          company,
        });
        onLogin(result.user);
      } else if (mode === "forgot") {
        const result = await api("/auth/forgot", "POST", { email });
        setMessage(result.message);
      } else {
        const result = await api("/auth/reset", "POST", {
          token: resetToken,
          password,
        });
        setMessage(result.message);
        setMode("login");
        setPassword("");
        window.history.replaceState(
          {},
          "",
          window.location.pathname + window.location.hash,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enterDemo(role: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/login", "POST", {
        email: `${role}@brightloop.demo`,
        password: "LoopDemo!2026",
      });
      onLogin(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    login: "Welcome to your next chapter.",
    register: "Let’s grow something great.",
    forgot: "A fresh start for your password.",
    reset: "Make yourself at home.",
  };
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="story-content">
          <div className="story-kicker">
            <span />
            LESS ADMIN. MORE POSSIBILITY.
          </div>
          <h1>
            Good business <br />
            goes in <span>loops.</span>
          </h1>
          <p>
            From the first hello to the next renewal.
            <br />
            Everything you need to keep growing, together.
          </p>
          <div className="orbit-visual" aria-hidden="true">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-center">
              <Logo small />
            </div>
            <span className="orbit-node node-one">
              <Layers />
              <small>Subscribe</small>
            </span>
            <span className="orbit-node node-two">
              <CreditCard />
              <small>Collect</small>
            </span>
            <span className="orbit-node node-three">
              <ChartNoAxesCombined />
              <small>Grow</small>
            </span>
            <div className="floating-receipt">
              <span className="receipt-check">✓</span>
              <div>
                <b>Another cycle, connected.</b>
                <small>From subscription to payment</small>
              </div>
              <Sparkles size={18} />
            </div>
          </div>
        </div>
        <div className="story-footer">
          <span>Built for the way your business grows.</span>
          <span>© {new Date().getFullYear()} Brightloop</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-top">
          <span>One workspace. Every subscription.</span>
          <ShieldCheck size={18} />
        </div>
        <div className="auth-form-wrap">
          <span className="auth-symbol">
            {mode === "forgot" ? (
              <Mail />
            ) : mode === "reset" ? (
              <KeyRound />
            ) : (
              <ArrowUpRight />
            )}
          </span>
          <h2>{titles[mode]}</h2>
          <p className="auth-description">
            {mode === "login"
              ? "Sign in and see your business in a whole new light."
              : mode === "register"
                ? "Create your customer account to manage your subscriptions."
                : mode === "forgot"
                  ? "We’ll email a single-use link to your registered address."
                  : "Choose a secure password for your Brightloop account."}
          </p>
          {error && <ErrorBox message={error} />}{" "}
          {message && (
            <div className="success-box" role="status">
              {message}
            </div>
          )}
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <>
                <label>
                  Your name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Alex Morgan"
                  />
                </label>
                <label>
                  Company <span className="optional">optional</span>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    autoComplete="organization"
                    placeholder="Your company"
                  />
                </label>
              </>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "login" ? 1 : 9}
                  placeholder={
                    mode === "login"
                      ? "Enter your password"
                      : "Create a strong password"
                  }
                />
                {mode !== "login" && (
                  <small>
                    9+ characters, with uppercase, lowercase, and a symbol.
                  </small>
                )}
              </label>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="text-link forgot-link"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                }}
              >
                Forgot password?
              </button>
            )}
            <Button busy={busy} type="submit" icon={ArrowRight}>
              {mode === "login"
                ? "Sign in to Brightloop"
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Set new password"}
            </Button>
          </form>
          {mode === "login" ? (
            <p className="auth-switch">
              New to Brightloop?{" "}
              <button
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Create an account
              </button>
            </p>
          ) : (
            <p className="auth-switch">
              <button
                onClick={() => {
                  setMode("login");
                  setError("");
                  setMessage("");
                }}
              >
                Back to sign in
              </button>
            </p>
          )}
          {demo && mode === "login" && (
            <div className="demo-login">
              <div className="demo-divider">
                <span>TAKE A LOOK AROUND</span>
              </div>
              <p>A ready-to-explore workspace with fictional data.</p>
              <div className="demo-buttons">
                {["admin", "staff", "customer"].map((role) => (
                  <button
                    key={role}
                    disabled={busy}
                    onClick={() => enterDemo(role)}
                  >
                    <span>
                      {role === "admin"
                        ? "Workspace admin"
                        : role === "staff"
                          ? "Team member"
                          : "Customer portal"}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
              <small>
                Demo password: <code>LoopDemo!2026</code>
              </small>
            </div>
          )}
        </div>
        <div className="auth-bottom">
          <span className="dot-green" />
          Secure accounts. Clear permissions. Peace of mind.
        </div>
      </section>
    </div>
  );
}
