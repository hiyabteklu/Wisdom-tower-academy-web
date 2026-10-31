"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listProfiles,
  getStudentDetail,
  downloadCsv,
  type ProfileRow,
} from "@/lib/admin-data";
import {
  grantAccess,
  grantAllPackages,
  ALL_PACKAGES_ID,
} from "@/lib/access-grants";
import { normalizePhone, phoneToAuthEmail } from "@/lib/authIdentity";
import { academyPackages, formatEtb } from "@/data/packages";
import {
  Users,
  Download,
  Mail,
  GraduationCap,
  Building2,
  MapPin,
  Calendar,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  Award,
  BookOpen,
} from "lucide-react";
import {
  AdminAvatar,
  AdminCard,
  AdminEmpty,
  AdminField,
  AdminInput,
  AdminKeyValue,
  AdminPill,
  AdminSearch,
  AdminSectionTitle,
  AdminSelect,
  AdminSheet,
  AdminSkeleton,
  AdminToast,
} from "./ui";

/**
 * Admin Users tab.
 *
 * 2026-10-15 (Admin mobile redesign, slice A7): LAYOUT ONLY. Compact header, 44 px pills, one-column cards,
 * bottom sheets without blur or animation. Two invented fallback texts were removed (fake-content rule): the
 * inspect window showed the made-up id "WTA-01042" when a student has no id, and the name fallback
 * "Scholar Scholar"; they now show "-" and "Scholar".
 *
 * 2026-10-16 (Admin UI V2, slice U6): LAYOUT ONLY. Kit cards, kit avatar, kit search, kit fields and pills,
 * gold instead of purple, a static skeleton instead of the brand loader, the kit slim toast (it closes itself
 * after 4 seconds, so the old timer effect is gone). The two old pop-up windows (student history, direct grant)
 * are now ONE kit bottom sheet that shows either the history or the grant form. Reason: the kit sheet pushes a
 * history entry for the phone Back button; switching from the history to the grant form inside the same open
 * sheet avoids closing one sheet and opening another in the same moment (the late Back event of the first would
 * close the second). "Grant New Package" in the history therefore swaps the content of the open sheet.
 * Search text, filters, database calls (listProfiles, getStudentDetail, grantAccess, grantAllPackages),
 * the CSV export and every text are unchanged.
 *
 * 2026-10-31 (phone-student parity): students who registered with a phone number have an EMPTY profiles.email;
 * their real login is the synthetic address p<digits>@phone.wisdomtower.app (authIdentity.ts). The grant form,
 * the history lookup (grants + orders by e-mail) and the user-id link all need an e-mail, so they silently did
 * nothing for phone students. accountEmail() now falls back to the synthetic address built from the phone, the
 * same address their orders and enrollments already use. The search box also matches the phone number.
 */

type Props = {
  adminEmail?: string;
};

/**
 * The e-mail an account really signs in with: the profile e-mail, or for phone-registered students the
 * synthetic p<digits>@phone.wisdomtower.app address. Null only when the student has neither.
 */
function accountEmail(u: ProfileRow | null): string | null {
  if (!u) return null;
  const real = (u.email || "").trim();
  if (real) return real;
  const digits = normalizePhone(u.phone || "");
  return digits.length >= 9 ? phoneToAuthEmail(digits) : null;
}

export default function UsersPanel({ adminEmail = "admin@wisdomtower.tech" }: Props) {
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [streamFilter, setStreamFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [toast, setToast] = useState("");

  // Inspect Student sheet state
  const [inspectStudent, setInspectStudent] = useState<ProfileRow | null>(null);
  const [inspectDetail, setInspectDetail] = useState<{
    academicResults: Record<string, unknown>[];
    enrollments: Record<string, unknown>[];
    accessGrants: Record<string, unknown>[];
    orders: Record<string, unknown>[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Quick Grant sheet state (never set together with inspectStudent)
  const [grantModalUser, setGrantModalUser] = useState<ProfileRow | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string>(ALL_PACKAGES_ID);
  const [grantNote, setGrantNote] = useState("Direct scholar grant");
  const [grantBusy, setGrantBusy] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listProfiles();
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Load detailed history when inspecting student
  useEffect(() => {
    if (!inspectStudent) {
      setInspectDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    getStudentDetail(inspectStudent.id, accountEmail(inspectStudent)).then((detail) => {
      if (!cancelled) {
        setInspectDetail(detail);
        setLoadingDetail(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [inspectStudent]);

  const handleCopy = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleExportCsv = () => {
    if (users.length === 0) return;
    const headers = [
      "Student ID",
      "Full Name",
      "Email",
      "Phone",
      "School Name",
      "Town/Region",
      "Stream",
      "Education Level",
      "Target Exam",
      "Joined Date",
    ];
    const rows = users.map((u) => [
      u.student_id_number || "WTA-UNASSIGNED",
      u.full_name || "Scholar",
      u.email || "",
      u.phone || "",
      u.school_name || "",
      u.town_region || "",
      u.stream || "",
      u.education_level || "",
      u.target_exam || "",
      u.created_at ? new Date(u.created_at).toLocaleDateString() : "",
    ]);
    downloadCsv(`wisdom_tower_scholars_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const handleExecuteGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = accountEmail(grantModalUser);
    if (!grantModalUser || !targetEmail) {
      setToast("This student has no email or phone number on file");
      return;
    }
    setGrantBusy(true);

    if (selectedPackageId === ALL_PACKAGES_ID) {
      const res = await grantAllPackages({
        email: targetEmail,
        grantedBy: adminEmail,
        note: grantNote || "Direct Admin Grant",
      });
      setGrantBusy(false);
      if (res.ok) {
        setToast(`Granted full platform pass to ${grantModalUser.email || grantModalUser.phone || targetEmail} (${res.count} packages)`);
        setGrantModalUser(null);
      } else {
        setToast(res.error || "Failed to grant all packages");
      }
    } else {
      const pkg = academyPackages.find((p) => p.id === selectedPackageId);
      const res = await grantAccess({
        email: targetEmail,
        packageId: selectedPackageId,
        grantedBy: adminEmail,
        note: grantNote || "Direct Admin Grant",
      });
      setGrantBusy(false);
      if (res.ok) {
        setToast(`Granted ${pkg?.name || selectedPackageId} to ${grantModalUser.email || grantModalUser.phone || targetEmail}`);
        setGrantModalUser(null);
      } else {
        setToast(res.error || "Failed to grant package");
      }
    }
  };

  // Filtered scholars list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Search matching
      const q = searchQuery.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, "");
      const phoneDigits = (u.phone || "").replace(/\D/g, "");
      const matchPhone =
        qDigits.length >= 4 &&
        (phoneDigits.includes(qDigits) ||
          // typed as 09xxxxxxxx or 9xxxxxxxx while the stored number is 251...
          (qDigits.startsWith("0") && phoneDigits.includes(qDigits.slice(1))));
      const matchSearch =
        !q ||
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.student_id_number || "").toLowerCase().includes(q) ||
        (u.school_name || "").toLowerCase().includes(q) ||
        (u.town_region || "").toLowerCase().includes(q) ||
        matchPhone;

      // Stream matching
      const streamVal = (u.stream || "").toLowerCase();
      let matchStream = true;
      if (streamFilter === "natural") {
        matchStream = streamVal.includes("nat");
      } else if (streamFilter === "social") {
        matchStream = streamVal.includes("soc");
      }

      // Level matching
      let matchLevel = true;
      if (levelFilter !== "all") {
        matchLevel = (u.education_level || "").toLowerCase() === levelFilter.toLowerCase();
      }

      return matchSearch && matchStream && matchLevel;
    });
  }, [users, searchQuery, streamFilter, levelFilter]);

  // One sheet for both the history and the grant form
  const sheetOpen = inspectStudent !== null || grantModalUser !== null;

  function closeSheet() {
    setInspectStudent(null);
    setGrantModalUser(null);
  }

  const sheetFooter = grantModalUser ? (
    <div className="flex gap-2">
      <AdminPill fullWidth onClick={closeSheet}>
        Cancel
      </AdminPill>
      <AdminPill fullWidth tone="primary" type="submit" form="grant-form" disabled={grantBusy}>
        {grantBusy ? "Granting..." : "Confirm & Unlock"}
      </AdminPill>
    </div>
  ) : inspectStudent ? (
    <div className="flex gap-2">
      <AdminPill fullWidth onClick={closeSheet}>
        Close
      </AdminPill>
      <AdminPill
        fullWidth
        tone="primary"
        onClick={() => {
          const u = inspectStudent;
          setInspectStudent(null);
          setGrantModalUser(u);
          setSelectedPackageId(ALL_PACKAGES_ID);
        }}
      >
        Grant New Package
      </AdminPill>
    </div>
  ) : undefined;

  return (
    <div className="min-w-0 space-y-4">
      {/* Title, description and actions */}
      <div>
        <AdminSectionTitle>Scholar Directory ({users.length})</AdminSectionTitle>
        <p className="text-xs leading-relaxed text-wisdom-muted">
          Registered students, school details and direct access controls
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <AdminPill icon={Download} onClick={handleExportCsv} disabled={users.length === 0}>
          Export CSV ({users.length})
        </AdminPill>
        <AdminPill tone="gold" icon={RefreshCw} onClick={() => void load()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </AdminPill>
      </div>

      {/* Search and Filters */}
      <AdminCard className="space-y-2.5">
        <AdminSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search name, email, phone, student ID, school, town"
        />

        <div className="grid grid-cols-2 gap-2">
          {/* Stream Filter */}
          <AdminSelect
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            className="font-semibold"
          >
            <option value="all">All Streams</option>
            <option value="natural">Natural Science</option>
            <option value="social">Social Science</option>
          </AdminSelect>

          {/* Level Filter */}
          <AdminSelect
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="font-semibold"
          >
            <option value="all">All Levels</option>
            <option value="grade-12">Grade 12</option>
            <option value="grade-11">Grade 11</option>
            <option value="freshman">University Freshman</option>
            <option value="remedial">Remedial</option>
          </AdminSelect>
        </div>

        <p className="text-xs tabular-nums text-wisdom-muted">
          Showing {filteredUsers.length} of {users.length}
        </p>
      </AdminCard>

      {/* Scholars List */}
      {loading && users.length === 0 ? (
        <AdminSkeleton rows={4} />
      ) : filteredUsers.length === 0 ? (
        <AdminEmpty
          icon={Users}
          title="No matching scholars found"
          hint="Try adjusting your search criteria or stream filters."
        />
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((u) => (
            <AdminCard key={u.id} className="space-y-3">
              {/* Top Row: Avatar, Name, Email */}
              <div className="flex min-w-0 items-center gap-3">
                {u.avatar_url ? (
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-amber-400/20 bg-amber-500/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                  </span>
                ) : (
                  <AdminAvatar label={u.full_name || u.email || "S"} />
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold text-white">{u.full_name || "Scholar"}</h4>
                  <p className="flex items-center gap-1 text-xs text-wisdom-muted">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{u.email || u.phone || "No email"}</span>
                  </p>
                </div>
              </div>

              {/* Student ID (tap to copy) */}
              {u.student_id_number && (
                <div>
                  <AdminPill
                    tone="gold"
                    className="font-mono text-xs"
                    aria-label="Copy student ID"
                    onClick={() => handleCopy(u.student_id_number!, `id-${u.id}`)}
                  >
                    {copiedId === `id-${u.id}` ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-300" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <span>{u.student_id_number}</span>
                        <Copy className="h-3.5 w-3.5 opacity-60" />
                      </>
                    )}
                  </AdminPill>
                </div>
              )}

              {/* Secondary Academic Details */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-y border-white/10 py-2.5 text-xs text-wisdom-muted">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                  <span className="truncate">{u.school_name || "School: Not specified"}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                  <span className="truncate">{u.town_region || "Region: Not set"}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                  <span className="truncate">{u.stream || "General Stream"}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                  <span className="truncate">Joined {new Date(u.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Bottom Quick Controls */}
              <div className="grid grid-cols-2 gap-2">
                <AdminPill icon={BookOpen} onClick={() => setInspectStudent(u)}>
                  History & Scores
                </AdminPill>
                <AdminPill
                  tone="gold"
                  icon={KeyRound}
                  onClick={() => {
                    setGrantModalUser(u);
                    setSelectedPackageId(ALL_PACKAGES_ID);
                  }}
                >
                  Grant Package
                </AdminPill>
              </div>
            </AdminCard>
          ))}
        </div>
      )}

      {/* One bottom sheet: student history, or the direct grant form */}
      <AdminSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={grantModalUser ? "Direct Scholar Access Grant" : "Student Scholar Profile"}
        footer={sheetFooter}
      >
        {grantModalUser ? (
          <form id="grant-form" onSubmit={handleExecuteGrant} className="space-y-3">
            <p className="break-words text-lg font-bold text-white">
              Unlock Materials for {grantModalUser.full_name || grantModalUser.email || grantModalUser.phone}
            </p>

            <AdminField label="Recipient Scholar">
              <AdminInput
                type="text"
                disabled
                value={`${grantModalUser.full_name || "Scholar"} (${grantModalUser.email || grantModalUser.phone || "No email or phone"})`}
              />
            </AdminField>

            <AdminField label="Package to Unlock">
              <AdminSelect
                value={selectedPackageId}
                onChange={(e) => setSelectedPackageId(e.target.value)}
                className="font-semibold"
              >
                <option value={ALL_PACKAGES_ID}>★ All Packages (Full Academy Access)</option>
                {academyPackages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatEtb(p.priceEtb)})
                  </option>
                ))}
              </AdminSelect>
            </AdminField>

            <AdminField label="Administrative Note">
              <AdminInput
                type="text"
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                placeholder="e.g. Scholarship award, beta tester, payment verified"
              />
            </AdminField>
          </form>
        ) : inspectStudent ? (
          <div className="space-y-4">
            <p className="break-words text-lg font-bold text-white">{inspectStudent.full_name || "Scholar"}</p>

            {/* Quick Profile Summary */}
            <AdminCard>
              <AdminKeyValue
                items={[
                  {
                    label: "Student ID",
                    value: (
                      <span className="break-all font-mono font-bold text-cyan-300">
                        {inspectStudent.student_id_number || "-"}
                      </span>
                    ),
                  },
                  {
                    label: "Email",
                    value: <span className="break-all">{inspectStudent.email || "-"}</span>,
                  },
                  { label: "Phone", value: inspectStudent.phone || "-" },
                  { label: "School", value: inspectStudent.school_name || "-" },
                  { label: "Stream", value: inspectStudent.stream || "-" },
                  { label: "Town / Region", value: inspectStudent.town_region || "-" },
                ]}
              />
            </AdminCard>

            {loadingDetail ? (
              <AdminSkeleton rows={2} />
            ) : (
              <div className="space-y-4">
                {/* Active Enrollments & Grants */}
                <div>
                  <h4 className="mb-2 flex items-start gap-1.5 text-xs font-extrabold uppercase tracking-wider text-wisdom-muted">
                    <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                    <span>
                      Unlocked Packages & Access Grants (
                      {(inspectDetail?.enrollments.length || 0) + (inspectDetail?.accessGrants.length || 0)})
                    </span>
                  </h4>
                  {(inspectDetail?.enrollments.length || 0) === 0 &&
                  (inspectDetail?.accessGrants.length || 0) === 0 ? (
                    <AdminCard>
                      <p className="text-xs text-wisdom-muted">No active packages unlocked yet.</p>
                    </AdminCard>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {inspectDetail?.enrollments.map((enr, i) => (
                        <span
                          key={`enr-${i}`}
                          className="break-words rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-200"
                        >
                          {String(enr.package_name || enr.package_id)} (Verified Order)
                        </span>
                      ))}
                      {inspectDetail?.accessGrants.map((grant, i) => (
                        <span
                          key={`grant-${i}`}
                          className="break-words rounded-xl border border-amber-400/30 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-200"
                        >
                          {String(grant.package_name || grant.package_id)} (Manual Grant)
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Academic Results History */}
                <div>
                  <h4 className="mb-2 flex items-start gap-1.5 text-xs font-extrabold uppercase tracking-wider text-wisdom-muted">
                    <Award className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                    <span>Recent Test & Examination Scores ({inspectDetail?.academicResults.length || 0})</span>
                  </h4>
                  {(inspectDetail?.academicResults.length || 0) === 0 ? (
                    <AdminCard>
                      <p className="text-xs text-wisdom-muted">No recorded quiz or test submissions yet.</p>
                    </AdminCard>
                  ) : (
                    <div className="space-y-2">
                      {inspectDetail?.academicResults.map((r, i) => (
                        <AdminCard key={`score-${i}`}>
                          <p className="break-words text-sm font-semibold text-white">
                            {String(r.title || r.scope_id)}
                          </p>
                          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                            <span className="text-wisdom-muted">
                              {r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : ""}
                            </span>
                            <span className="font-bold tabular-nums text-cyan-300">
                              {String(r.correct)}/{String(r.total)} ({String(r.percent)}%)
                            </span>
                          </div>
                        </AdminCard>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </AdminSheet>

      <AdminToast message={toast || null} onClose={() => setToast("")} />
    </div>
  );
}
