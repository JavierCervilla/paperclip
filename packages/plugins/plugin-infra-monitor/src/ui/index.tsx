import { useState, type CSSProperties } from "react";
import {
  useHostContext,
  usePluginData,
  type PluginPageProps,
  type PluginSettingsPageProps,
  type PluginSidebarProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import { DATA_KEYS, DEFAULT_CONFIG, PAGE_ROUTE } from "../constants.js";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type ServiceStatus = "healthy" | "degraded" | "down" | "unknown";

interface CollectorResult {
  serviceId: string;
  serviceName: string;
  type: "http" | "docker" | "database" | "blockchain" | "dokploy";
  status: ServiceStatus;
  latencyMs?: number;
  metadata: Record<string, unknown>;
  checkedAt: string;
  error?: string;
}

interface Anomaly {
  serviceId: string;
  severity: "info" | "warning" | "critical";
  description: string;
  suggestedAction: string;
}

interface AnalysisResult {
  anomalies: Anomaly[];
  overallStatus: ServiceStatus;
  summary: string;
  recommendedActions: string[];
}

interface LatestSnapshot {
  results: CollectorResult[];
  checkedAt: string;
  analysis?: AnalysisResult;
}

interface DashboardData {
  configured: boolean;
  latestSnapshot: LatestSnapshot | null;
  lastCheckedAt: string | null;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: "var(--text-color, #e0e0e0)",
    padding: "16px",
  } satisfies CSSProperties,
  card: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: "8px",
    border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
    padding: "16px",
    marginBottom: "12px",
  } satisfies CSSProperties,
  heading: {
    fontSize: "18px",
    fontWeight: 600 as const,
    margin: "0 0 12px 0",
    color: "var(--text-color, #f0f0f0)",
  } satisfies CSSProperties,
  subheading: {
    fontSize: "14px",
    fontWeight: 600 as const,
    margin: "0 0 8px 0",
    color: "var(--text-color, #d0d0d0)",
  } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  } satisfies CSSProperties,
  muted: {
    color: "#888",
    fontSize: "12px",
  } satisfies CSSProperties,
  empty: {
    color: "#666",
    textAlign: "center" as const,
    padding: "24px",
    fontSize: "14px",
  } satisfies CSSProperties,
  errorBox: {
    color: "#fca5a5",
    background: "rgba(220,38,38,0.1)",
    borderRadius: "6px",
    padding: "12px",
    fontSize: "13px",
  } satisfies CSSProperties,
  badge: (status: ServiceStatus): CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    background:
      status === "healthy"
        ? "rgba(34,197,94,0.15)"
        : status === "degraded"
          ? "rgba(234,179,8,0.15)"
          : status === "down"
            ? "rgba(239,68,68,0.15)"
            : "rgba(100,100,100,0.15)",
    color:
      status === "healthy" ? "#86efac" : status === "degraded" ? "#fde047" : status === "down" ? "#fca5a5" : "#aaa",
  }),
  severityBadge: (severity: Anomaly["severity"]): CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    background:
      severity === "critical"
        ? "rgba(239,68,68,0.2)"
        : severity === "warning"
          ? "rgba(234,179,8,0.15)"
          : "rgba(100,100,100,0.15)",
    color: severity === "critical" ? "#fca5a5" : severity === "warning" ? "#fde047" : "#aaa",
  }),
  serviceCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid var(--border-color, rgba(255,255,255,0.06))",
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "8px",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } satisfies CSSProperties,
  anomalyCard: (severity: Anomaly["severity"]): CSSProperties => ({
    background:
      severity === "critical"
        ? "rgba(239,68,68,0.06)"
        : severity === "warning"
          ? "rgba(234,179,8,0.06)"
          : "rgba(255,255,255,0.02)",
    border: `1px solid ${
      severity === "critical"
        ? "rgba(239,68,68,0.2)"
        : severity === "warning"
          ? "rgba(234,179,8,0.2)"
          : "rgba(255,255,255,0.06)"
    }`,
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "8px",
  }),
  formGroup: {
    marginBottom: "16px",
  } satisfies CSSProperties,
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 500 as const,
    marginBottom: "4px",
    color: "var(--text-color, #d0d0d0)",
  } satisfies CSSProperties,
  input: {
    width: "100%",
    background: "var(--input-bg, rgba(255,255,255,0.05))",
    border: "1px solid var(--border-color, rgba(255,255,255,0.12))",
    borderRadius: "6px",
    color: "var(--text-color, #e0e0e0)",
    padding: "8px 10px",
    fontSize: "13px",
    boxSizing: "border-box" as const,
  } satisfies CSSProperties,
  hint: {
    fontSize: "11px",
    color: "#888",
    marginTop: "4px",
  } satisfies CSSProperties,
};

// ---------------------------------------------------------------------------
// ServiceGrid component
// ---------------------------------------------------------------------------

function ServiceGrid({ results }: { results: CollectorResult[] }) {
  if (results.length === 0) {
    return <div style={styles.empty}>No services monitored yet. Configure endpoints to get started.</div>;
  }

  return (
    <div>
      {results.map((r) => (
        <div key={r.serviceId} style={styles.serviceCard}>
          <div style={styles.row}>
            <div>
              <span style={{ fontWeight: 600, fontSize: "13px" }}>{r.serviceName}</span>
              <span style={{ ...styles.muted, marginLeft: "8px" }}>{r.type}</span>
            </div>
            <span style={styles.badge(r.status)}>{r.status}</span>
          </div>
          <div style={{ marginTop: "6px", ...styles.muted }}>
            {r.latencyMs !== undefined && <span style={{ marginRight: "12px" }}>{r.latencyMs}ms</span>}
            <span>{new Date(r.checkedAt).toLocaleTimeString()}</span>
          </div>
          {r.error && (
            <div style={{ ...styles.errorBox, marginTop: "6px", padding: "6px 8px", fontSize: "11px" }}>{r.error}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnomalyFeed component
// ---------------------------------------------------------------------------

function AnomalyFeed({ analysis }: { analysis?: AnalysisResult }) {
  if (!analysis) {
    return <div style={styles.empty}>Run a health check to see anomaly analysis.</div>;
  }

  if (analysis.anomalies.length === 0) {
    return (
      <div>
        <div style={{ ...styles.badge("healthy"), marginBottom: "12px" }}>All Clear</div>
        <p style={styles.muted}>{analysis.summary}</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ ...styles.muted, marginBottom: "12px" }}>{analysis.summary}</p>
      {analysis.anomalies.map((a, i) => (
        <div key={`${a.serviceId}-${i}`} style={styles.anomalyCard(a.severity)}>
          <div style={styles.row}>
            <span style={{ fontWeight: 600, fontSize: "13px" }}>{a.serviceId}</span>
            <span style={styles.severityBadge(a.severity)}>{a.severity}</span>
          </div>
          <p style={{ margin: "6px 0 4px", fontSize: "13px" }}>{a.description}</p>
          <p style={{ ...styles.muted, margin: 0 }}>
            <strong>Action:</strong> {a.suggestedAction}
          </p>
        </div>
      ))}
      {analysis.recommendedActions.length > 0 && (
        <div style={{ ...styles.card, marginTop: "12px" }}>
          <p style={styles.subheading}>Recommended Actions</p>
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", lineHeight: "1.6" }}>
            {analysis.recommendedActions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfraMonitorPage
// ---------------------------------------------------------------------------

export function InfraMonitorPage(_props: PluginPageProps) {
  const context = useHostContext();
  const { data, loading, error } = usePluginData<DashboardData>(DATA_KEYS.dashboard, {
    companyId: context.companyId ?? undefined,
  });

  return (
    <div style={styles.container}>
      <div style={{ ...styles.row, marginBottom: "16px" }}>
        <h1 style={{ ...styles.heading, margin: 0 }}>Infrastructure Monitor</h1>
        {data?.lastCheckedAt && (
          <span style={styles.muted}>Last check: {new Date(data.lastCheckedAt).toLocaleString()}</span>
        )}
      </div>

      {loading && <div style={styles.muted}>Loading dashboard...</div>}
      {error && <div style={styles.errorBox}>{error.message}</div>}

      {!loading && data && !data.configured && (
        <div style={styles.card}>
          <p style={{ margin: 0, fontSize: "14px" }}>
            Infrastructure Monitor is not configured yet. Add your Dokploy URL or HTTP services in Settings.
          </p>
        </div>
      )}

      {data?.latestSnapshot && (
        <div style={styles.grid}>
          <div>
            <h2 style={styles.subheading}>Services ({data.latestSnapshot.results.length})</h2>
            <ServiceGrid results={data.latestSnapshot.results} />
          </div>
          <div>
            <h2 style={styles.subheading}>
              Anomaly Analysis
              {data.latestSnapshot.analysis && (
                <span style={{ ...styles.badge(data.latestSnapshot.analysis.overallStatus), marginLeft: "8px" }}>
                  {data.latestSnapshot.analysis.overallStatus}
                </span>
              )}
            </h2>
            <AnomalyFeed analysis={data.latestSnapshot.analysis} />
          </div>
        </div>
      )}

      {!loading && data && !data.latestSnapshot && data.configured && (
        <div style={styles.empty}>Waiting for first health check run. Check runs every 5 minutes.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfraMonitorWidget
// ---------------------------------------------------------------------------

export function InfraMonitorWidget(_props: PluginWidgetProps) {
  const context = useHostContext();
  const { data, loading } = usePluginData<DashboardData>(DATA_KEYS.dashboard, {
    companyId: context.companyId ?? undefined,
  });

  if (loading) {
    return (
      <div style={{ ...styles.container, padding: "12px" }}>
        <span style={styles.muted}>Loading...</span>
      </div>
    );
  }

  if (!data?.latestSnapshot) {
    return (
      <div style={{ ...styles.container, padding: "12px" }}>
        <div style={styles.row}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>Infrastructure</span>
          <span style={styles.badge("unknown")}>No Data</span>
        </div>
      </div>
    );
  }

  const { results, analysis, checkedAt } = data.latestSnapshot;
  const downCount = results.filter((r) => r.status === "down").length;
  const degradedCount = results.filter((r) => r.status === "degraded").length;
  const healthyCount = results.filter((r) => r.status === "healthy").length;
  const overallStatus =
    analysis?.overallStatus ?? (downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "healthy");

  return (
    <div style={{ ...styles.container, padding: "12px" }}>
      <div style={{ ...styles.row, marginBottom: "8px" }}>
        <span style={{ fontWeight: 600, fontSize: "14px" }}>Infrastructure</span>
        <span style={styles.badge(overallStatus)}>{overallStatus}</span>
      </div>
      <div style={{ display: "flex", gap: "12px", fontSize: "12px" }}>
        <span style={{ color: "#86efac" }}>{healthyCount} healthy</span>
        {degradedCount > 0 && <span style={{ color: "#fde047" }}>{degradedCount} degraded</span>}
        {downCount > 0 && <span style={{ color: "#fca5a5" }}>{downCount} down</span>}
      </div>
      {analysis && analysis.anomalies.length > 0 && (
        <div style={{ marginTop: "8px", ...styles.muted }}>
          {analysis.anomalies.length} anomal{analysis.anomalies.length === 1 ? "y" : "ies"} detected
        </div>
      )}
      <div style={{ ...styles.muted, marginTop: "6px" }}>{new Date(checkedAt).toLocaleTimeString()}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfraMonitorSettingsPage
// ---------------------------------------------------------------------------

export function InfraMonitorSettingsPage(_props: PluginSettingsPageProps) {
  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Infrastructure Monitor Settings</h1>
      <p style={styles.muted}>
        Configure the settings below in the Paperclip plugin configuration panel. These fields are read from the
        instance config schema.
      </p>

      <div style={styles.card}>
        <h2 style={styles.subheading}>Dokploy Integration</h2>
        <div style={styles.formGroup}>
          <label style={styles.label}>Dokploy Base URL</label>
          <input
            style={styles.input}
            type="text"
            placeholder={DEFAULT_CONFIG.dokployUrl || "https://dokploy.example.com"}
            disabled
          />
          <p style={styles.hint}>Base URL of your Dokploy instance.</p>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Dokploy API Key</label>
          <input style={styles.input} type="password" placeholder="Set via instance config (secret-ref)" disabled />
          <p style={styles.hint}>Stored as a secret reference. Configure via plugin settings.</p>
        </div>
      </div>

      <div style={styles.card}>
        <h2 style={styles.subheading}>LLM Analysis</h2>
        <div style={styles.formGroup}>
          <label style={styles.label}>LLM Base URL</label>
          <input style={styles.input} type="text" placeholder={DEFAULT_CONFIG.llmUrl} disabled />
          <p style={styles.hint}>Ollama-compatible LLM endpoint for anomaly analysis.</p>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>LLM Model</label>
          <input style={styles.input} type="text" placeholder={DEFAULT_CONFIG.llmModel} disabled />
          <p style={styles.hint}>Model name (e.g. llama3, mistral).</p>
        </div>
      </div>

      <div style={styles.card}>
        <h2 style={styles.subheading}>Scheduling</h2>
        <div style={styles.formGroup}>
          <label style={styles.label}>Check Interval (minutes)</label>
          <input
            style={styles.input}
            type="number"
            placeholder={String(DEFAULT_CONFIG.checkIntervalMinutes)}
            disabled
          />
          <p style={styles.hint}>
            How often to run health checks. Default: {DEFAULT_CONFIG.checkIntervalMinutes} minutes.
          </p>
        </div>
      </div>

      <div style={styles.card}>
        <h2 style={styles.subheading}>Extra HTTP Services</h2>
        <p style={{ fontSize: "13px", color: "#999" }}>
          Additional HTTP endpoints to monitor can be added via the instance config schema as an array of{" "}
          <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: "3px" }}>
            {"{ serviceId, serviceName, url }"}
          </code>{" "}
          objects.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfraMonitorSidebar
// ---------------------------------------------------------------------------

export function InfraMonitorSidebar(_props: PluginSidebarProps) {
  const context = useHostContext();
  const prefix = context.companyPrefix ?? "";
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={`/${prefix}/${PAGE_ROUTE}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        fontSize: "13px",
        fontWeight: 500,
        color: hovered ? "hsl(var(--foreground))" : "hsl(var(--foreground) / 0.8)",
        backgroundColor: hovered ? "hsl(var(--accent) / 0.5)" : "transparent",
        textDecoration: "none",
        cursor: "pointer",
        transition: "color 0.15s, background-color 0.15s",
        borderRadius: "4px",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <span>Infrastructure</span>
    </a>
  );
}
