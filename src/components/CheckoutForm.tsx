"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Check,
  Shield,
  Smartphone,
  Building2,
  Upload,
  FileText,
  LogIn,
  Zap,
} from "lucide-react";
import {
  getPackage,
  paymentMethods,
  formatEtb,
  type PaymentMethodId,
} from "@/data/packages";
import { getPackageResolved } from "@/lib/catalog";
import BrandLoader from "@/components/BrandLoader";
import {
  generateOrderRef,
  saveOrder,
  uploadPaymentReceipt,
  type ManualOrder,
} from "@/lib/orders";
import { removeFromCart } from "@/lib/cart";
import { supabase } from "@/lib/supabase";

type ConfirmMode = "receipt" | "details";

type Props = {
  packageId?: string;
  packageIds?: string[];
};

function BankLogo({
  src,
  label,
  fallback,
}: {
  src: string;
  label: string;
  fallback: "phone" | "bank";
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return fallback === "phone" ? (
      <Smartphone className="w-7 h-7 text-cyan-400" />
    ) : (
      <Building2 className="w-7 h-7 text-cyan-400" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      className="w-8 h-8 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

// Automatic approval is OFF (owner order 2026-10-23): every order goes to an admin.
const AUTO_VERIFY_METHODS: PaymentMethodId[] = [];

export default function CheckoutForm({ packageId, packageIds }: Props) {
  const pkgs = useMemo(() => {
    const ids =
      packageIds && packageIds.length > 0
        ? packageIds
        : packageId
          ? [packageId]
          : [];
    return ids
      .map((id) => getPackageResolved(id) || getPackage(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [packageId, packageIds]);

  const pkg = pkgs[0];
  const totalEtb = pkgs.reduce((s, p) => s + p.priceEtb, 0);
  const displayName =
    pkgs.length <= 1
      ? pkg?.name || ""
      : pkgs.map((p) => p.shortName || p.name).join(" + ");
  const allPackageIds = pkgs.map((p) => p.id);
  const multiNote = pkgs.length > 1 ? `packages:${allPackageIds.join(",")}` : "";

  const [authLoading, setAuthLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethodId>("telebirr");
  const [orderRef] = useState(() => generateOrderRef());
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [txRef, setTxRef] = useState("");
  const [note, setNote] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [autoVerified, setAutoVerified] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const canAutoVerify = AUTO_VERIFY_METHODS.includes(method);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setSignedIn(Boolean(session?.user));
      setUserId(session?.user?.id ?? null);
      if (session?.user?.email) setEmail(session.user.email);
      const meta = session?.user?.user_metadata;
      if (meta?.full_name || meta?.name) {
        setName(String(meta.full_name || meta.name));
      }
      setAuthLoading(false);
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(Boolean(session?.user));
      setUserId(session?.user?.id ?? null);
      if (session?.user?.email) setEmail(session.user.email);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreview(null);
      return;
    }
    if (receiptFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(receiptFile);
      setReceiptPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setReceiptPreview(null);
  }, [receiptFile]);

  const pay = paymentMethods.find((m) => m.id === method) || paymentMethods[0];

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Could not copy. Long-press to copy manually.");
    }
  }

  function clearSelectedFromCart() {
    allPackageIds.forEach((id) => removeFromCart(id));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg || pkgs.length === 0 || !signedIn) return;
    setError("");
    setInfo("");
    setSubmitting(true);

    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      setSubmitting(false);
      return;
    }

    const orderBase = {
      id: orderRef,
      packageId: pkg.id,
      packageName: displayName,
      amountEtb: totalEtb,
      paymentMethod: method,
      studentName: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      userId,
      createdAt: new Date().toISOString(),
    };

    let receiptUrl: string | undefined;
    if (confirmMode === "receipt") {
      if (!receiptFile) {
        setError("Upload a receipt screenshot or PDF.");
        setSubmitting(false);
        return;
      }
      const up = await uploadPaymentReceipt(orderRef, receiptFile);
      if (up.error || !up.url) {
        setError(up.error || "Receipt upload failed");
        setSubmitting(false);
        return;
      }
      receiptUrl = up.url;
    } else if (!txRef.trim()) {
      setError("Enter the transaction reference.");
      setSubmitting(false);
      return;
    }

    // Always saved as pending: only an admin can approve it.
    const order: ManualOrder = {
      ...orderBase,
      status: "pending_verification",
      transactionRef:
        confirmMode === "details" ? txRef.trim() : `receipt:${receiptFile?.name || "file"}`,
      note: [note.trim(), multiNote].filter(Boolean).join(" | ") || undefined,
      receiptUrl,
    };

    const res = await saveOrder(order);
    setSubmitting(false);
    if (!res.ok && res.error) {
      setError(res.error);
      return;
    }
    clearSelectedFromCart();
    setDone(true);
  }

  if (!pkg || pkgs.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-wisdom-muted">Package not found.</p>
        <Link href="/packages" className="text-amber-400 font-semibold hover:underline">
          Browse packages
        </Link>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center" data-wta-spinner="true">
        <BrandLoader size="md" />
      </div>
    );
  }

  if (!signedIn) {
    const next =
      pkgs.length > 1
        ? `/checkout/multi?ids=${allPackageIds.join(",")}`
        : `/checkout/${pkg.id}`;
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <LogIn className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-white mb-2">Sign in to checkout</h1>
        <p className="text-sm text-wisdom-muted mb-6">
          You need an account so we can unlock {displayName} upon verification.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="inline-flex rounded-xl bg-cyan-400 hover:bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition-all active:scale-[0.98]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="rounded-3xl border border-emerald-400/30 bg-wisdom-card p-8">
          <Check className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">
            {autoVerified ? "Payment verified" : "Submitted for verification"}
          </h1>
          <p className="text-sm text-wisdom-muted mb-2">
            Order <span className="font-mono text-amber-300">{orderRef}</span>
          </p>
          {autoVerified ? (
            <p className="text-sm text-wisdom-muted mb-6">
              {displayName} is unlocked in My Learning. You can start studying now.
            </p>
          ) : (
            <p className="text-sm text-wisdom-muted mb-6">
              {info ||
                `We will unlock ${displayName} in My Learning after confirming your payment.`}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <Link
              href="/learning"
              className="btn-accent px-6 py-2.5 text-sm"
            >
              My Learning
            </Link>
            <Link
              href="/orders"
              className="btn-secondary px-6 py-2.5 text-sm"
            >
              View orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10 md:py-14">
      <Link
        href="/cart"
        className="inline-flex items-center gap-1 text-sm text-wisdom-muted hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Cart
      </Link>

      <h1 className="font-display text-2xl font-bold text-white mb-1">Checkout</h1>
      <p className="text-wisdom-muted text-sm mb-6">
        {displayName} ·{" "}
        <span className="text-amber-300 font-semibold">{formatEtb(totalEtb)}</span>
      </p>

      <div className="rounded-2xl border border-white/12 bg-wisdom-card p-4 mb-6">
        <p className="text-xs text-wisdom-muted mb-1">Order reference (put in transfer remark)</p>
        <div className="flex items-center justify-between gap-2">
          <code className="text-amber-300 font-mono font-bold">{orderRef}</code>
          <button
            type="button"
            onClick={() => copyText("ref", orderRef)}
            className="inline-flex items-center gap-1 text-xs text-cyan-300"
          >
            {copied === "ref" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            Copy
          </button>
        </div>
      </div>

      <p className="text-sm font-semibold text-white mb-3">Payment method</p>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {paymentMethods.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMethod(m.id)}
            className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm ${
              method === m.id
                ? "border-amber-400/50 bg-amber-500/10"
                : "border-white/10 hover:border-white/20"
            }`}
          >
            <BankLogo
              src={m.logo}
              label={m.shortLabel}
              fallback={m.id === "telebirr" ? "phone" : "bank"}
            />
            <span className="font-medium text-white">{m.shortLabel}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/12 bg-wisdom-dark/40 p-4 mb-6 space-y-2">
        <p className="text-sm font-semibold text-white">{pay.name}</p>
        <p className="text-xs text-wisdom-muted">{pay.accountLabel}</p>
        <div className="flex items-center justify-between gap-2">
          <code className="text-cyan-300 font-mono text-sm">{pay.accountValue}</code>
          <button
            type="button"
            onClick={() => copyText("acc", pay.accountValue)}
            className="text-xs text-cyan-300"
          >
            {copied === "acc" ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-wisdom-muted">Name: {pay.accountName}</p>
        <p className="text-xs text-amber-200/90 pt-1">
          Transfer the full amount: <strong>{formatEtb(totalEtb)}</strong>
        </p>
        <ul className="text-xs text-wisdom-muted list-disc pl-4 space-y-1 pt-2">
          {pay.instructions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setConfirmMode("details")}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
              confirmMode === "details"
                ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                : "border-white/10 text-wisdom-muted"
            }`}
          >
            Enter TX ID
            {canAutoVerify && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-emerald-300">
                <Zap className="w-3 h-3" /> auto
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirmMode("receipt")}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
              confirmMode === "receipt"
                ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                : "border-white/10 text-wisdom-muted"
            }`}
          >
            Upload receipt
          </button>
        </div>

        {confirmMode === "receipt" ? (
          <div>
            <label className="block text-xs text-wisdom-muted mb-1">Receipt (image or PDF)</label>
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-wisdom-dark/30 px-4 py-8 cursor-pointer hover:border-amber-400/40">
              <Upload className="w-6 h-6 text-amber-400" />
              <span className="text-sm text-white/80">
                {receiptFile ? receiptFile.name : "Tap to upload"}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
            </label>
            {receiptPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receiptPreview} alt="Preview" className="mt-2 max-h-40 rounded-lg mx-auto" />
            )}
            {receiptFile && !receiptPreview && (
              <p className="mt-2 text-xs text-wisdom-muted flex items-center gap-1 justify-center">
                <FileText className="w-3.5 h-3.5" /> PDF selected
              </p>
            )}
          </div>
        ) : (
          <label className="block text-xs text-wisdom-muted">
            Transaction reference
            <input
              value={txRef}
              onChange={(e) => setTxRef(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-wisdom-dark/50 px-3 py-2.5 text-sm text-white"
              placeholder="From SMS or bank receipt"
            />
          </label>
        )}

        <label className="block text-xs text-wisdom-muted">
          Full name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-wisdom-dark/50 px-3 py-2.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-wisdom-muted">
          Phone
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-wisdom-dark/50 px-3 py-2.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-wisdom-muted">
          Email (optional)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-wisdom-dark/50 px-3 py-2.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-wisdom-muted">
          Note (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-white/15 bg-wisdom-dark/50 px-3 py-2.5 text-sm text-white"
          />
        </label>

        {error && (
          <p className="text-sm text-red-400 flex items-start gap-2">
            <Shield className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-accent w-full py-3.5 text-sm disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Confirm payment"}
        </button>
      </form>
    </div>
  );
}
