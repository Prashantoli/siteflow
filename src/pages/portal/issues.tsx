import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Modal, Badge, EmptyState, fmtDateTime } from "@/components/ui";
import { PRIORITY_COLOR } from "@/lib/workforce";
import { homeFor, isManagement } from "@/lib/rbac";

type Issue = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
  site: { id: string; name: string; code: string } | null;
  task: { id: string; title: string } | null;
  raisedBy: { id: string; name: string; jobTitle: string | null };
  resolvedBy: { id: string; name: string } | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700",
  IN_REVIEW: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  DISMISSED: "bg-slate-100 text-slate-500",
};

const CATEGORY_ICON: Record<string, string> = {
  SAFETY: "🦺",
  EQUIPMENT: "🔧",
  MATERIAL: "🧱",
  SITE: "🏗️",
  PAYROLL: "💰",
  OTHER: "📌",
};

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [resolving, setResolving] = useState<Issue | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/issues");
    if (res.ok) setIssues((await res.json()).issues);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function updateIssue(issue: Issue, status: string, resolutionNote?: string) {
    setBusy(true);
    await fetch("/api/issues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: issue.id, status, resolutionNote }),
    });
    setBusy(false);
    setResolving(null);
    setNote("");
    load();
  }

  const filtered = issues.filter(
    (i) =>
      (filter === "ALL" || i.status === filter) &&
      (q === "" ||
        i.title.toLowerCase().includes(q.toLowerCase()) ||
        i.raisedBy.name.toLowerCase().includes(q.toLowerCase()) ||
        (i.site?.name ?? "").toLowerCase().includes(q.toLowerCase()))
  );
  const openCount = issues.filter((i) => i.status === "OPEN").length;

  return (
    <Shell title="Issues" subtitle="Worker-raised issues — triage, track and resolve">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-56" placeholder="Search issues…" value={q} onChange={(e) => setQ(e.target.value)} />
          {["ALL", "OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
        {openCount > 0 && <Badge className="bg-red-100 text-red-700">{openCount} open</Badge>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No issues found" hint="When workers report issues from My Day, they appear here." />
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => (
            <div key={i.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg">{CATEGORY_ICON[i.category] ?? "📌"}</span>
                    <p className="text-sm font-bold text-slate-900">{i.title}</p>
                    <Badge className={STATUS_COLOR[i.status]}>{i.status.replace("_", " ")}</Badge>
                    <Badge className={PRIORITY_COLOR[i.priority]}>{i.priority}</Badge>
                    <Badge className="bg-slate-100 text-slate-600">{i.category}</Badge>
                  </div>
                  {i.description ? <p className="mt-1.5 text-xs text-slate-600">{i.description}</p> : null}
                  {i.status === "RESOLVED" && i.resolutionNote && (
                    <p className="mt-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">✔ {i.resolutionNote}</p>
                  )}
                  <p className="mt-1.5 text-xs text-slate-500">
                    👷 {i.raisedBy.name}{i.raisedBy.jobTitle ? ` · ${i.raisedBy.jobTitle}` : ""} · {fmtDateTime(i.createdAt)}
                    {i.site ? ` · 🏗️ ${i.site.name}` : ""}
                    {i.task ? ` · 📋 ${i.task.title}` : ""}
                  </p>
                </div>
                {(i.status === "OPEN" || i.status === "IN_REVIEW") && (
                  <div className="flex flex-wrap gap-1.5">
                    {i.status === "OPEN" && (
                      <button className="btn-outline !px-2.5 !py-1 text-[11px]" disabled={busy} onClick={() => updateIssue(i, "IN_REVIEW")}>
                        👀 Acknowledge
                      </button>
                    )}
                    <button className="btn-primary !px-2.5 !py-1 text-[11px]" disabled={busy} onClick={() => { setResolving(i); setNote(""); }}>
                      ✔ Resolve
                    </button>
                    <button className="btn-outline !px-2.5 !py-1 text-[11px] text-red-600" disabled={busy} onClick={() => updateIssue(i, "DISMISSED")}>
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!resolving} onClose={() => setResolving(null)} title={`Resolve: ${resolving?.title ?? ""}`}>
        <div className="space-y-3">
          <div>
            <label className="label">Resolution note (sent to {resolving?.raisedBy.name})</label>
            <textarea className="input" rows={3} placeholder="e.g. New scaffold installed and inspected — please verify." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-outline" onClick={() => setResolving(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={() => resolving && updateIssue(resolving, "RESOLVED", note.trim() || undefined)}>
              Mark resolved
            </button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getSession(ctx);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (!isManagement(session.user as never)) return { redirect: { destination: homeFor(session.user.role), permanent: false } };
  return { props: {} };
}
