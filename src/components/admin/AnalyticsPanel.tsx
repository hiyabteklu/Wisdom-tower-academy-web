"use client";

import { useCallback, useEffect, useState, useMemo, type ReactNode } from "react";
import { fetchAdminStats, type AdminStats } from "@/lib/admin-data";
import {
  listOrdersFromDb,
  rejectOrder,
  statusLabel,
  verifyOrder,
  type ManualOrder,
} from "@/lib/orders";
import { supabase } from "@/lib/supabase";
import { formatEtb } from "@/data/packages";
import BrandLoader from "@/components/BrandLoader";
import {
  AdminCard,
  AdminChip,
  AdminChips,
  AdminEmpty,
  AdminPill,
  AdminToast,
  type AdminChipOption,
  type AdminIcon,
} from "@/components/admin/ui";
import {
  Users,
  CreditCard,
  GraduationCap,
  Activity,
  RefreshCw,
  TrendingUp,
  Percent,
  Wallet,
  Clock,
  AlertCircle,
  Award,
  CheckCircle2,
} from "lucide-react";

/**
 * Admin Overview (analytics) tab.
 *
 * 2026-10-15 (Admin mobile redesign, slice A9): LAYOUT ONLY. Audit hits before the change: `animate-ping` (pulse
 * dot), `animate-spin` (Refresh icon), `transition-*` on bars and cards, a 5-button segmented activity filter,
 * a nested `max-h-[460px] overflow-y-auto` feed, `truncate` rows that cut the text, text under 11 px, and a
 * 44 px-short Refresh button. Now: one 44 px pill, a 2-column KPI grid, a static pulse dot, charts stacked in one
 * column, activity filter as wrapping pills, feed rows that wrap (no nested scroller; the list was already capped
 * at 16 items). Data loading, calculations and the activity list are unchanged.
 * Fake-content rule (HANDOFF section 7): removed three claims that were not real data: "Updated in real time"
 * (the page loads once and on Refresh), "100% Ethiopian Rail", and "Live stream" / "Real-Time" in the feed
 * title and subtitle (now "Recent Activity"). The unused `activityOpen` state and unused icon imports were dropped.
 *
 * 2026-10-16 (slice U3 of docs/ADMIN_UI_V2_PLAN.md): LOOK ONLY, same data and texts. Uses the shared kit
 * (`ui.tsx`): gold icon chips on every card (the unused per-card accent colours and the never-passed `trend`
 * prop were dropped), kit cards, the kit filter chips (gold when active), the kit Refresh pill and the kit
 * empty state. Chart bar colours stay: they carry meaning (orders, revenue, payment rails, streams).
 *
 * 2026-10-31: NEW "Needs your approval" queue under Today's Pulse. Lists every order in status
 * pending_verification (oldest first, red after 2 hours) with a one-tap Verify / Reject (second tap confirms).
 * Verify uses verifyOrder(), which also notifies the student. Orders are read with listOrdersFromDb(), so the
 * queue is not limited to the 10 recent orders in the stats.
 */

type ActivityFilter = "all" | "order" | "enroll" | "inquiry" | "user";

const ACTIVITY_FILTERS: AdminChipOption<ActivityFilter>[] = [
  { id: "all", label: "All" },
  { id: "order", label: "Orders" },
  { id: "enroll", label: "Grants" },
  { id: "inquiry", label: "Inquiries" },
  { id: "user", label: "Scholars" },
];

const URGENT_MS = 2 * 60 * 60 * 1000;

function MetricCard({
  label,
  value,
  secondary,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  secondary?: string;
  hint?: string;
  icon: AdminIcon;
}) {
  return (
    <AdminCard className="flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-wisdom-muted">{label}</p>
          <p className="mt-1 break-words text-xl font-extrabold tabular-nums tracking-tight text-white">{value}</p>
          {secondary && <p className="mt-0.5 text-xs font-semibold text-wisdom-muted">{secondary}</p>}
        </div>
        <AdminChip icon={icon} size="sm" />
      </div>

      {hint && <div className="mt-2.5 border-t border-white/10 pt-2 text-xs text-wisdom-muted">{hint}</div>}
    </AdminCard>
  );
}

function InfoTile({ label, value, valueClass, note }: { label: string; value: ReactNode; valueClass?: string; note: string }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-wider text-wisdom-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass ?? "text-white"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-wisdom-muted">{note}</p>
    </AdminCard>
  );
}

function CardHeader({ icon, title, meta }: { icon: AdminIcon; title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <AdminChip icon={icon} size="sm" />
        <h3 className="min-w-0 text-sm font-semibold leading-tight text-white">{title}</h3>
      </div>
      {meta ? <span className="shrink-0 text-xs text-wisdom-muted">{meta}</span> : null}
    </div>
  );
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AnalyticsPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  // Approval queue
  const [pendingOrders, setPendingOrders] = useState<ManualOrder[]>([]);
  const [confirm, setConfirm] = useState<{ id: string; action: "verify" | "reject" } | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [data, orders] = await Promise.all([fetchAdminStats(), listOrdersFromDb()]);
    setStats(data);
    setPendingOrders(
      orders
        .filter((o) => o.status === "pending_verification")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOrderAction = async (order: ManualOrder, action: "verify" | "reject") => {
    // First tap arms the button, second tap on the same button runs it.
    if (!confirm || confirm.id !== order.id || confirm.action !== action) {
      setConfirm({ id: order.id, action });
      return;
    }
    setConfirm(null);
    setBusyOrderId(order.id);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const adminEmail = session?.user?.email || "admin";

    if (action === "verify") {
      const res = await verifyOrder(order.id, adminEmail);
      if (res.ok) {
        setToast(
          res.notified
            ? `Verified ${order.id}. ${order.studentName} was notified.`
            : `Verified ${order.id}. The student could not be notified, message them yourself.`
        );
      } else {
        setToast(res.error || "Could not verify the order");
      }
    } else {
      const res = await rejectOrder(order.id, adminEmail);
      setToast(res.ok ? `Rejected ${order.id}.` : res.error || "Could not reject the order");
    }
    setBusyOrderId(null);
    await load();
  };

  const activityItems = useMemo(() => {
    if (!stats) return [];
    type ActivityItem = { id: string; text: string; when: string; kind: "order" | "enroll" | "inquiry" | "user"; detail?: string };
    const list: ActivityItem[] = [];

    for (const o of stats.recentOrders) {
      list.push({
        id: `o-${o.id}`,
        kind: "order",
        when: o.createdAt,
        text: `Order ${o.id} · ${o.packageName} · ${o.studentName}`,
        detail: `${statusLabel(o.status)} (${formatEtb(o.amountEtb)}) via ${o.paymentMethod || "bank"}`,
      });
    }
    for (const e of stats.recentEnrollments) {
      list.push({
        id: `e-${e.id}`,
        kind: "enroll",
        when: e.created_at,
        text: `Unlocked · ${e.package_name}`,
        detail: e.email || "Active Enrollment",
      });
    }
    for (const i of stats.recentInquiries) {
      list.push({
        id: `i-${i.id}`,
        kind: "inquiry",
        when: i.created_at,
        text: `Inquiry from ${i.name} (${i.service || "General"})`,
        detail: i.message.slice(0, 90) + (i.message.length > 90 ? "…" : ""),
      });
    }
    for (const u of stats.recentUsers) {
      list.push({
        id: `u-${u.id}`,
        kind: "user",
        when: u.created_at,
        text: `New student registration: ${u.full_name || u.email || "Scholar"}`,
        detail: [u.school_name, u.stream, u.town_region].filter(Boolean).join(" · ") || u.email || "Registered profile",
      });
    }

    list.sort((a, b) => b.when.localeCompare(a.when));
    return list;
  }, [stats]);

  const filteredActivity = useMemo(() => {
    if (activityFilter === "all") return activityItems.slice(0, 16);
    return activityItems.filter((i) => i.kind === activityFilter).slice(0, 16);
  }, [activityItems, activityFilter]);

  if (loading && !stats) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3" data-wta-spinner="true">
        <BrandLoader size="md" label="Loading executive metrics..." />
      </div>
    );
  }

  const s = stats!;
  const maxDayOrders = Math.max(1, ...s.last7Days.map((d) => d.orders));

  return (
    <div className="space-y-3">
      {/* Header and Refresh */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <AdminChip icon={TrendingUp} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-snug text-white">Executive Intelligence & Operational Overview</h2>
            <p className="mt-1 text-xs leading-relaxed text-wisdom-muted">
              Financial, student enrollment, and platform usage metrics
            </p>
          </div>
        </div>

        <AdminPill type="button" onClick={load} disabled={loading} icon={RefreshCw} fullWidth>
          {loading ? "Loading..." : "Refresh Data"}
        </AdminPill>
      </div>

      {/* Today's Pulse */}
      <div className="space-y-2.5 rounded-2xl border border-cyan-400/20 bg-cyan-950/20 p-3 text-sm">
        <div className="flex items-start gap-2.5">
          <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full bg-cyan-500" />
          <div className="min-w-0">
            <span className="font-bold text-white">Today&apos;s Pulse:</span>{" "}
            <span className="text-cyan-200">
              {s.todayOrdersCount} order{s.todayOrdersCount === 1 ? "" : "s"} placed today
            </span>
            <span className="text-wisdom-muted"> · </span>
            <span className="font-semibold text-emerald-300">
              {formatEtb(s.todayRevenueEtb)} verified today
            </span>
          </div>
        </div>

        {s.urgentPendingOrdersCount > 0 && (
          <div className="flex items-start gap-1.5 rounded-2xl border border-amber-400/30 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {s.urgentPendingOrdersCount} order{s.urgentPendingOrdersCount === 1 ? "" : "s"} awaiting approval &gt; 2 hrs
            </span>
          </div>
        )}
      </div>

      {/* Needs your approval */}
      {pendingOrders.length > 0 && (
        <div>
          <CardHeader
            icon={CheckCircle2}
            title="Needs your approval"
            meta={`${pendingOrders.length} waiting`}
          />
          <div className="space-y-2">
            {pendingOrders.map((o) => {
              const waitedMs = Date.now() - new Date(o.createdAt).getTime();
              const urgent = waitedMs > URGENT_MS;
              const busy = busyOrderId === o.id;
              const verifyArmed = confirm?.id === o.id && confirm.action === "verify";
              const rejectArmed = confirm?.id === o.id && confirm.action === "reject";
              return (
                <AdminCard key={o.id} className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-white">{o.studentName}</p>
                      <p className="mt-0.5 break-words text-xs text-wisdom-muted">
                        {o.packageName} · {formatEtb(o.amountEtb)} · {o.paymentMethod || "bank"}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-wisdom-muted">
                        {o.id}
                        {o.transactionRef ? ` · ref ${o.transactionRef}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${
                        urgent
                          ? "border-red-400/40 bg-red-500/20 text-red-300"
                          : "border-white/10 bg-white/5 text-wisdom-muted"
                      }`}
                    >
                      {timeAgo(o.createdAt)}
                    </span>
                  </div>

                  {o.receiptUrl && (
                    <a
                      href={o.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center text-xs font-semibold text-cyan-300 underline"
                    >
                      View receipt
                    </a>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <AdminPill
                      type="button"
                      disabled={busy}
                      onClick={() => void handleOrderAction(o, "reject")}
                    >
                      {rejectArmed ? "Tap again to reject" : "Reject"}
                    </AdminPill>
                    <AdminPill
                      type="button"
                      tone="primary"
                      disabled={busy}
                      onClick={() => void handleOrderAction(o, "verify")}
                    >
                      {busy ? "Working..." : verifyArmed ? "Tap again to verify" : "Verify & unlock"}
                    </AdminPill>
                  </div>
                </AdminCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Main KPI Grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Verified Revenue"
          value={formatEtb(s.revenueVerifiedEtb)}
          hint={`${s.ordersVerified} approved orders`}
          secondary={`avg ${formatEtb(s.avgOrderEtb)}`}
          icon={Wallet}
        />
        <MetricCard
          label="Pending Pipeline"
          value={formatEtb(s.pipelineEtb)}
          hint={`${s.ordersPending} pending payment confirmation`}
          icon={Clock}
        />
        <MetricCard
          label="Registered Scholars"
          value={s.users}
          hint={`${s.enrollments} total unlocked package grants`}
          icon={Users}
        />
        <MetricCard
          label="Order Conversion"
          value={`${s.conversionPct}%`}
          hint={`${s.ordersTotal} checkouts initiated`}
          icon={Percent}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <InfoTile label="Course Enrollments" value={s.enrollments} note="Active scholar access seats" />
        <InfoTile label="AI Explanations" value={s.explanationsCached} valueClass="text-cyan-300" note="Cached tutor explanations" />
        <InfoTile label="Quiz Submissions" value={s.academicResults} valueClass="text-emerald-300" note="Completed exam sessions" />
        <InfoTile
          label="Inquiries & Support"
          value={
            <>
              {s.inquiriesTotal}
              {s.inquiriesNew > 0 && (
                <span className="ml-1.5 text-xs font-semibold text-amber-400">({s.inquiriesNew} new)</span>
              )}
            </>
          }
          note="Student support messages"
        />
      </div>

      {/* Last 7 days */}
      <AdminCard>
        <CardHeader icon={Activity} title="Daily Order & Revenue Velocity" meta="Last 7 Days" />

        <div className="flex h-40 items-end justify-between gap-1.5 border-b border-white/10 pb-3 pt-2">
          {s.last7Days.map((d) => {
            const heightPct = Math.round((d.orders / maxDayOrders) * 100);
            return (
              <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <div className="flex h-28 w-full max-w-[40px] flex-col justify-end overflow-hidden rounded-lg bg-white/5 p-0.5">
                  <div
                    className="w-full rounded-md bg-gradient-to-t from-cyan-600 via-cyan-400 to-amber-300"
                    style={{ height: `${Math.max(d.orders ? 10 : 2, heightPct)}%` }}
                    title={`${d.day}: ${d.orders} orders (${d.verified} verified, ${formatEtb(d.revenue)})`}
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold tabular-nums text-white">{d.orders}</p>
                  <p className="text-[11px] uppercase tracking-wider text-wisdom-muted">{d.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-3 text-xs text-wisdom-muted">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            <span>Orders placed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span>Verified revenue</span>
          </div>
        </div>
      </AdminCard>

      {/* Payment method share */}
      <AdminCard>
        <CardHeader icon={CreditCard} title="Payment Rail Share" meta={`${s.ordersTotal} transactions`} />

        {s.byMethod.length === 0 ? (
          <p className="py-8 text-center text-sm text-wisdom-muted">No orders recorded yet</p>
        ) : (
          <div className="space-y-3">
            {s.byMethod.map((m) => {
              const pct = s.ordersTotal > 0 ? Math.round((m.count / s.ordersTotal) * 100) : 0;
              return (
                <div key={m.method} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="min-w-0 break-words font-semibold uppercase tracking-wider text-white">
                      {m.method}
                    </span>
                    <span className="shrink-0 text-right text-wisdom-muted">
                      <strong className="text-emerald-300">{formatEtb(m.totalEtb)}</strong> · {m.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {/* Top packages */}
      <AdminCard>
        <CardHeader icon={Award} title="Top Packages by Enrollment" meta="By order volume" />

        {s.byPackage.length === 0 ? (
          <p className="py-6 text-center text-sm text-wisdom-muted">No package enrollments yet</p>
        ) : (
          <div className="space-y-3">
            {s.byPackage.map((pkg, idx) => (
              <div key={pkg.name} className="flex items-start justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/5 text-xs font-bold text-wisdom-muted">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 break-words font-medium text-white/90">{pkg.name}</span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-bold text-amber-300">{formatEtb(pkg.revenue)}</span>
                  <span className="block text-xs text-wisdom-muted">{pkg.count} orders</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      {/* Stream demographics */}
      <AdminCard>
        <CardHeader icon={GraduationCap} title="Scholar Stream Demographics" meta={`${s.users} registered`} />

        {s.byStream.length === 0 ? (
          <p className="py-6 text-center text-sm text-wisdom-muted">No student profiles registered yet</p>
        ) : (
          <div className="space-y-3">
            {s.byStream.map((stream) => {
              const pct = s.users > 0 ? Math.round((stream.count / s.users) * 100) : 0;
              return (
                <div key={stream.stream} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="min-w-0 break-words font-medium text-white/90">{stream.stream}</span>
                    <span className="shrink-0 text-wisdom-muted">
                      {stream.count} scholars ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-purple-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {/* Recent activity */}
      <div className="pt-1">
        <CardHeader icon={Activity} title="Recent Activity" />
        <p className="-mt-1 mb-3 text-xs text-wisdom-muted">
          Latest student signups, order payments, access grants, and inquiries
        </p>

        <AdminChips options={ACTIVITY_FILTERS} value={activityFilter} onChange={setActivityFilter} />

        <div className="mt-3 space-y-2">
          {filteredActivity.length === 0 ? (
            <AdminEmpty title="No events found in this filter category" />
          ) : (
            filteredActivity.map((item) => (
              <AdminCard key={item.id} className="text-sm">
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                      item.kind === "order"
                        ? "bg-amber-400"
                        : item.kind === "enroll"
                          ? "bg-emerald-400"
                          : item.kind === "inquiry"
                            ? "bg-sky-400"
                            : "bg-purple-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-white/95">{item.text}</p>
                    {item.detail && <p className="mt-0.5 break-words text-xs text-wisdom-muted">{item.detail}</p>}
                    <p className="mt-1 text-xs tabular-nums text-wisdom-muted">{timeAgo(item.when)}</p>
                  </div>
                </div>
              </AdminCard>
            ))
          )}
        </div>
      </div>

      <AdminToast message={toast || null} onClose={() => setToast("")} />
    </div>
  );
}
