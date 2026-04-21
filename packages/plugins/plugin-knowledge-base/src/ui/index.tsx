import { useState } from "react";
import {
  useHostContext,
  usePluginData,
  type PluginDetailTabProps,
  type PluginPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";

type KBEntry = {
  id: string;
  title: string;
  status: string;
  externalId?: string | null;
  data?: {
    description?: string;
    type?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
    deprecatedAt?: string;
    deprecatedReason?: string;
  };
};

// Minimal inline styles — the plugin cannot use host design-system components
const s = {
  container: { fontFamily: "sans-serif", padding: "16px", maxWidth: "900px" } as React.CSSProperties,
  heading: { fontSize: "18px", fontWeight: 600, marginBottom: "12px" } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
    boxSizing: "border-box" as const,
    marginBottom: "12px",
  } as React.CSSProperties,
  tag: {
    display: "inline-block",
    background: "#e5e7eb",
    borderRadius: "4px",
    padding: "2px 6px",
    fontSize: "12px",
    marginRight: "4px",
  } as React.CSSProperties,
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "8px",
  } as React.CSSProperties,
  cardTitle: { fontWeight: 600, fontSize: "15px", marginBottom: "4px" } as React.CSSProperties,
  cardDesc: { color: "#4b5563", fontSize: "14px", marginBottom: "6px" } as React.CSSProperties,
  meta: { color: "#9ca3af", fontSize: "12px" } as React.CSSProperties,
  badge: {
    display: "inline-block",
    borderRadius: "4px",
    padding: "2px 6px",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    marginRight: "6px",
  } as React.CSSProperties,
  emptyState: { color: "#9ca3af", textAlign: "center" as const, padding: "32px" } as React.CSSProperties,
};

function statusColor(status: string) {
  return status === "deprecated" ? "#f3f4f6" : "#ecfdf5";
}

function EntryCard({ entry }: { entry: KBEntry }) {
  const d = entry.data ?? {};
  const tags = d.tags ?? [];
  return (
    <div style={{ ...s.card, background: statusColor(entry.status) }}>
      <div style={s.cardTitle}>{entry.title}</div>
      {d.description && <div style={s.cardDesc}>{d.description}</div>}
      <div>
        {d.type && <span style={{ ...s.badge, background: "#dbeafe", color: "#1e40af" }}>{d.type}</span>}
        {tags.map((t: string) => (
          <span key={t} style={s.tag}>
            {t}
          </span>
        ))}
      </div>
      <div style={s.meta}>
        {entry.status === "deprecated"
          ? "Deprecated" + (d.deprecatedReason ? ": " + d.deprecatedReason : "")
          : d.createdAt
            ? new Date(d.createdAt).toLocaleDateString()
            : ""}
      </div>
    </div>
  );
}

export function KBPage(_props: PluginPageProps) {
  const { companyId } = useHostContext();
  const [query, setQuery] = useState("");
  const [showDeprecated, setShowDeprecated] = useState(false);
  const { data: entries, loading } = usePluginData<KBEntry[]>("kb-entries", {
    companyId,
    status: showDeprecated ? "deprecated" : "active",
    query: query.trim() || undefined,
  });

  return (
    <div style={s.container}>
      <div style={s.heading}>Knowledge Base</div>
      <input style={s.input} placeholder="Search entries..." value={query} onChange={(e) => setQuery(e.target.value)} />
      <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "12px" }}>
        <input
          type="checkbox"
          checked={showDeprecated}
          onChange={(e) => setShowDeprecated(e.target.checked)}
          style={{ marginRight: "6px" }}
        />
        Show deprecated entries
      </label>
      {loading && <div style={s.emptyState}>Loading...</div>}
      {!loading && (!entries || entries.length === 0) && (
        <div style={s.emptyState}>No knowledge base entries found.</div>
      )}
      {entries?.map((e) => (
        <EntryCard key={e.id} entry={e} />
      ))}
    </div>
  );
}

export function KBDashboardWidget(_props: PluginWidgetProps) {
  const { companyId } = useHostContext();
  const { data: entries, loading } = usePluginData<KBEntry[]>("kb-entries", { companyId, limit: 5 });

  return (
    <div style={{ padding: "12px" }}>
      <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>Knowledge Base</div>
      {loading && <div style={s.meta}>Loading...</div>}
      {!loading && (!entries || entries.length === 0) && <div style={s.meta}>No entries yet.</div>}
      {entries?.map((e) => (
        <div key={e.id} style={{ fontSize: "13px", padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
          {e.title}
          <span style={{ ...s.tag, marginLeft: "6px" }}>{(e.data as { type?: string })?.type ?? "fact"}</span>
        </div>
      ))}
      <div style={{ ...s.meta, marginTop: "8px" }}>{entries?.length ?? 0} active entries</div>
    </div>
  );
}

export function KBIssueTab(_props: PluginDetailTabProps) {
  const { companyId } = useHostContext();
  const { data: entries, loading } = usePluginData<KBEntry[]>("kb-entries", { companyId, limit: 10 });

  return (
    <div style={{ padding: "12px" }}>
      <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>Related Knowledge</div>
      {loading && <div style={s.meta}>Loading...</div>}
      {!loading && (!entries || entries.length === 0) && <div style={s.meta}>No knowledge base entries found.</div>}
      {entries?.map((e) => (
        <EntryCard key={e.id} entry={e} />
      ))}
    </div>
  );
}
