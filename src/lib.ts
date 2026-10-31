import { useEffect, useState } from "react";

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "staff" | "customer";
  customer_id: number | null;
}
export interface Line {
  product_id: number;
  name?: string;
  quantity: number;
  variant: string;
  unit_price?: number;
  tax_id?: number;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
}
// Catalog forms share one metadata-driven renderer; financial views use explicit fields.
export interface Row {
  id: number;
  [key: string]: any;
}
export interface PageResult {
  items: Row[];
  total: number;
  page: number;
  limit: number;
}
export interface Lookups {
  products: Row[];
  plans: Row[];
  taxes: Row[];
  templates: Row[];
  customers: Row[];
}
export interface Report {
  from: string;
  to: string;
  active: number;
  mrr: number;
  arr: number;
  outstanding: number;
  overdue: number;
  overdue_count: number;
  collected: number;
  payment_count: number;
  billed: number;
  due: number;
  chart: { month: string; collected: number; billed: number }[];
  breakdown: { status: string; count: number }[];
  overdueInvoices: Row[];
  renewals: Row[];
  plans: { name: string; count: number }[];
}

export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
export function useResource<T>(url: string | null, version = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(url, "GET", undefined, controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, version]);
  return { data, error, loading };
}
export function useDebounced<T>(value: T, delay = 250) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setResult(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return result;
}
export const money = (value: number, compact = false) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format((value || 0) / 100);
export const number = (value: number) =>
  new Intl.NumberFormat("en-IN").format(value);
export const now = () => new Date().toISOString().slice(0, 10);
export const shiftDate = (day: string, days: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const dateLabel = (
  day?: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
) =>
  day
    ? new Date(day.slice(0, 10) + "T12:00:00Z").toLocaleDateString(
        "en-GB",
        options,
      )
    : "—";
export const label = (text: string) =>
  text.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export const navigate = (path: string) => {
  window.location.hash = "/" + path;
};
export function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const fn = () => setHash(window.location.hash);
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  const url = new URL(hash.replace(/^#/, "") || "/overview", "http://local");
  const [section = "overview", id] = url.pathname.slice(1).split("/");
  return {
    section: section || "overview",
    id: id ? Number(id) : undefined,
    status: url.searchParams.get("status") || "",
  };
}
