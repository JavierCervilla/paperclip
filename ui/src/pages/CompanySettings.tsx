import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES,
  DEFAULT_FEEDBACK_DATA_SHARING_TERMS_VERSION,
  MAX_COMPANY_ATTACHMENT_MAX_BYTES,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Settings, Check, Download, Upload, Pause, Play, Copy, Trash2, Link2 } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import { Field, ToggleField, HintIcon } from "../components/agent-config-primitives";
import { useToastActions } from "../context/ToastContext";

const FEEDBACK_TERMS_URL = import.meta.env.VITE_FEEDBACK_TERMS_URL?.trim() || "https://paperclip.ing/tos";

type AgentSnippetInput = {
  onboardingTextUrl: string;
  connectionCandidates?: string[] | null;
  testResolutionUrl?: string | null;
};

const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_COMPANY_ATTACHMENT_MAX_MIB = DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
const MAX_COMPANY_ATTACHMENT_MAX_MIB = MAX_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
export function CompanySettings() {
  const { companies, selectedCompany, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [attachmentMaxMiB, setAttachmentMaxMiB] = useState(String(DEFAULT_COMPANY_ATTACHMENT_MAX_MIB));
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern; refactor tracked separately
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setAttachmentMaxMiB(String(Math.round((selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES) / BYTES_PER_MIB)));
    setLogoUrl(selectedCompany.logoUrl ?? "");
  }, [selectedCompany]);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  // Human invite (Members & Invites section) state
  const [memberInviteEmail, setMemberInviteEmail] = useState("");
  const [memberInviteError, setMemberInviteError] = useState<string | null>(null);
  // Map of inviteId → token for invites generated in this session
  const [sessionInviteTokens, setSessionInviteTokens] = useState<Map<string, string>>(new Map());
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const attachmentMaxBytes = Number.parseInt(attachmentMaxMiB, 10) * BYTES_PER_MIB;
  const attachmentMaxValid =
    Number.isInteger(attachmentMaxBytes)
    && attachmentMaxBytes >= BYTES_PER_MIB
    && attachmentMaxBytes <= MAX_COMPANY_ATTACHMENT_MAX_BYTES;

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? "") ||
      attachmentMaxBytes !== (selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
      attachmentMaxBytes: number;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const feedbackSharingMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        feedbackDataSharingEnabled: enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => accessApi.createOpenClawInvitePrompt(selectedCompanyId!),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ?? invite.onboardingTextPath ?? `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http") ? onboardingTextLink : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl: manifest.onboarding.connectivity?.testResolutionEndpoint?.url ?? null,
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null,
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!),
      });
    },
    onError: (err) => {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite");
    },
  });

  const memberInvitesQuery = useQuery({
    queryKey: ["company-invites", selectedCompanyId],
    queryFn: () => accessApi.listCompanyInvites(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  // eslint-disable-next-line react-hooks/purity -- Date.now() is intentional: relative expiry display requires current time
  const renderNow = useMemo(() => Date.now(), [memberInvitesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const memberInviteMutation = useMutation({
    mutationFn: (email: string) =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "human",
        recipientEmail: email || null,
      }),
    onSuccess: (invite) => {
      setMemberInviteError(null);
      setMemberInviteEmail("");
      setSessionInviteTokens((prev) => {
        const next = new Map(prev);
        next.set(invite.id, invite.token);
        return next;
      });
      void memberInvitesQuery.refetch();
      const url = `${window.location.origin}${invite.inviteUrl}`;
      void navigator.clipboard.writeText(url).catch(() => {});
      setCopiedInviteId(invite.id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    },
    onError: (err) => {
      setMemberInviteError(err instanceof Error ? err.message : "Failed to generate invite link");
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => accessApi.revokeInvite(inviteId),
    onSuccess: (_data, inviteId) => {
      setSessionInviteTokens((prev) => {
        const next = new Map(prev);
        next.delete(inviteId);
        return next;
      });
      void memberInvitesQuery.refetch();
    },
    onError: (err) => {
      pushToast({
        title: "Failed to revoke invite",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    },
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    },
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern; refactor tracked separately
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
    setMemberInviteEmail("");
    setMemberInviteError(null);
    setSessionInviteTokens(new Map());
    setCopiedInviteId(null);
  }, [selectedCompanyId]);

  const archiveMutation = useMutation({
    mutationFn: ({ companyId, nextCompanyId }: { companyId: string; nextCompanyId: string | null }) =>
      companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats,
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => companiesApi.pause(selectedCompanyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => companiesApi.resume(selectedCompanyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  useEffect(() => {
    setBreadcrumbs([{ label: selectedCompany?.name ?? "Company", href: "/dashboard" }, { label: "Settings" }]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null,
      attachmentMaxBytes,
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Company Settings</h1>
      </div>

      {/* General */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">General</div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Company name" hint="The display name for your company.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field label="Description" hint="Optional description shown in the company profile.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={description}
              placeholder="Optional company description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Appearance</div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                brandColor={brandColor || null}
                className="rounded-[14px]"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field label="Logo" hint="Upload a PNG, JPEG, WEBP, GIF, or SVG logo image.">
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                  />
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending ? "Removing..." : "Remove logo"}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : "Logo upload failed")}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">{clearLogoMutation.error.message}</span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">Uploading logo...</span>
                  )}
                </div>
              </Field>
              <Field
                label="Brand color"
                hint="Sets the hue for the company icon. Leave empty for auto-generated color."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor || "#6366f1"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder="Auto"
                    className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="text-xs text-muted-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
              <Field
                label="Attachment size limit"
                hint={`Accepted range: 1-${MAX_COMPANY_ATTACHMENT_MAX_MIB} MiB.`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={MAX_COMPANY_ATTACHMENT_MAX_MIB}
                      step={1}
                      value={attachmentMaxMiB}
                      onChange={(e) => setAttachmentMaxMiB(e.target.value)}
                      className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    />
                    <span className="text-xs text-muted-foreground">MiB</span>
                  </div>
                  {!attachmentMaxValid && (
                    <span className="text-xs text-destructive">
                      Enter a whole number from 1 to {MAX_COMPANY_ATTACHMENT_MAX_MIB}.
                    </span>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSaveGeneral} disabled={generalMutation.isPending || !companyName.trim() || !attachmentMaxValid}>
            {generalMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
          {generalMutation.isSuccess && <span className="text-xs text-muted-foreground">Saved</span>}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error ? generalMutation.error.message : "Failed to save"}
            </span>
          )}
        </div>
      )}

      {/* Hiring */}
      <div className="space-y-4" data-testid="company-settings-team-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hiring</div>
        <div className="rounded-md border border-border px-4 py-3">
          <ToggleField
            label="Require board approval for new hires"
            hint="New agent hires stay pending until approved by board."
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
            toggleTestId="company-settings-team-approval-toggle"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Feedback Sharing</div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <ToggleField
            label="Allow sharing voted AI outputs with Paperclip Labs"
            hint="Only AI-generated outputs you explicitly vote on are eligible for feedback sharing."
            checked={!!selectedCompany.feedbackDataSharingEnabled}
            onChange={(enabled) => feedbackSharingMutation.mutate(enabled)}
          />
          <p className="text-sm text-muted-foreground">
            Votes are always saved locally. This setting controls whether voted AI outputs may also be marked for
            sharing with Paperclip Labs.
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>
              Terms version:{" "}
              {selectedCompany.feedbackDataSharingTermsVersion ?? DEFAULT_FEEDBACK_DATA_SHARING_TERMS_VERSION}
            </div>
            {selectedCompany.feedbackDataSharingConsentAt ? (
              <div>
                Enabled {new Date(selectedCompany.feedbackDataSharingConsentAt).toLocaleString()}
                {selectedCompany.feedbackDataSharingConsentByUserId
                  ? ` by ${selectedCompany.feedbackDataSharingConsentByUserId}`
                  : ""}
              </div>
            ) : (
              <div>Sharing is currently disabled.</div>
            )}
            {FEEDBACK_TERMS_URL ? (
              <a
                href={FEEDBACK_TERMS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-foreground underline underline-offset-4"
              >
                Read our terms of service
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* Invites */}
      <div className="space-y-4" data-testid="company-settings-invites-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invites</div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Generate an OpenClaw agent invite snippet.</span>
            <HintIcon text="Creates a short-lived OpenClaw agent invite and renders a copy-ready prompt." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="company-settings-invites-generate-button"
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending ? "Generating..." : "Generate OpenClaw Invite Prompt"}
            </Button>
          </div>
          {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
          {inviteSnippet && (
            <div
              className="rounded-md border border-border bg-muted/30 p-2"
              data-testid="company-settings-invites-snippet"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">OpenClaw Invite Prompt</div>
                {snippetCopied && (
                  <span
                    key={snippetCopyDelightId}
                    className="flex items-center gap-1 text-xs text-green-600 animate-pulse"
                  >
                    <Check className="h-3 w-3" />
                    Copied
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-1.5">
                <textarea
                  data-testid="company-settings-invites-snippet-textarea"
                  className="h-[28rem] w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none"
                  value={inviteSnippet}
                  readOnly
                />
                <div className="flex justify-end">
                  <Button
                    data-testid="company-settings-invites-copy-button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteSnippet);
                        setSnippetCopied(true);
                        setSnippetCopyDelightId((prev) => prev + 1);
                        setTimeout(() => setSnippetCopied(false), 2000);
                      } catch {
                        /* clipboard may not be available */
                      }
                    }}
                  >
                    {snippetCopied ? "Copied snippet" : "Copy snippet"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Members & Invites */}
      <div className="space-y-4" data-testid="company-settings-member-invites-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members &amp; Invites</div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Generate a shareable invite link (valid 7 days). Share it manually — no email sent.
            </span>
            <HintIcon text="Creates a human-join invite with a 7-day TTL. Copy and send the URL via WhatsApp, DM, or any channel." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none w-56"
              type="email"
              placeholder="recipient@example.com (optional)"
              value={memberInviteEmail}
              onChange={(e) => setMemberInviteEmail(e.target.value)}
              disabled={memberInviteMutation.isPending}
            />
            <Button
              data-testid="company-settings-member-invite-generate-button"
              size="sm"
              onClick={() => memberInviteMutation.mutate(memberInviteEmail.trim())}
              disabled={memberInviteMutation.isPending}
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              {memberInviteMutation.isPending ? "Generating…" : "Generate invite link"}
            </Button>
          </div>
          {memberInviteError && <p className="text-sm text-destructive">{memberInviteError}</p>}

          {/* Active invite list */}
          {memberInvitesQuery.data && memberInvitesQuery.data.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Active invites</div>
              <div className="divide-y divide-border rounded-md border border-border">
                {memberInvitesQuery.data.map((invite) => {
                  const token = sessionInviteTokens.get(invite.id);
                  const inviteUrl = token ? `${window.location.origin}/invite/${token}` : null;
                  const expiresAtMs = new Date(invite.expiresAt).getTime();
                  const expiresInMs = expiresAtMs - renderNow;
                  const expiresInDays = Math.ceil(expiresInMs / (1000 * 60 * 60 * 24));
                  const expiresLabel =
                    expiresInMs <= 0 ? "expired" : expiresInDays === 1 ? "in 1 day" : `in ${expiresInDays} days`;
                  return (
                    <div key={invite.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <span className="text-foreground truncate">
                          {invite.recipientEmail ?? <span className="text-muted-foreground italic">no email</span>}
                        </span>
                        <span className="ml-2 text-muted-foreground">· expires {expiresLabel}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {inviteUrl ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={async () => {
                              await navigator.clipboard.writeText(inviteUrl).catch(() => {});
                              setCopiedInviteId(invite.id);
                              setTimeout(() => setCopiedInviteId(null), 2000);
                            }}
                          >
                            {copiedInviteId === invite.id ? (
                              <>
                                <Check className="mr-1 h-3 w-3 text-green-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="mr-1 h-3 w-3" />
                                Copy link
                              </>
                            )}
                          </Button>
                        ) : (
                          <span
                            className="text-muted-foreground italic cursor-help"
                            title="Link only available right after creation — revoke and regenerate to get a new shareable link."
                          >
                            Link unavailable
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={revokeInviteMutation.isPending}
                          onClick={() => {
                            if (window.confirm("Revoke this invite link? It will no longer be usable.")) {
                              revokeInviteMutation.mutate(invite.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {memberInvitesQuery.data?.length === 0 && <p className="text-xs text-muted-foreground">No active invites.</p>}
        </div>
      </div>

      {/* Import / Export */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company Packages</div>
        <div className="rounded-md border border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Import and export have moved to dedicated pages accessible from the{" "}
            <a href="/org" className="underline hover:text-foreground">
              Org Chart
            </a>{" "}
            header.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="/company/export">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="/company/import">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Pause / Resume */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Operations</div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          {selectedCompany.status === "paused" ? (
            <>
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <Pause className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  Company paused
                  {selectedCompany.pausedAt && (
                    <> &mdash; since {new Date(selectedCompany.pausedAt).toLocaleString()}</>
                  )}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                All agent heartbeats are suspended. Resume to allow agents to work again.
              </p>
              <Button size="sm" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {resumeMutation.isPending ? "Resuming..." : "Resume company"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Pause this company to temporarily stop all agent heartbeats. Agents keep their state and resume where
                they left off.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={pauseMutation.isPending || selectedCompany.status === "archived"}
                onClick={() => {
                  const confirmed = window.confirm(
                    `Pause company "${selectedCompany.name}"? This will stop all agent work until you resume.`,
                  );
                  if (confirmed) pauseMutation.mutate();
                }}
              >
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                {pauseMutation.isPending ? "Pausing..." : "Pause company"}
              </Button>
            </>
          )}
          {(pauseMutation.isError || resumeMutation.isError) && (
            <span className="text-xs text-destructive">
              {(pauseMutation.error ?? resumeMutation.error) instanceof Error
                ? (pauseMutation.error ?? resumeMutation.error)!.message
                : "Operation failed"}
            </span>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">Danger Zone</div>
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Archive this company to hide it from the sidebar. This persists in the database.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={archiveMutation.isPending || selectedCompany.status === "archived"}
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `Archive company "${selectedCompany.name}"? It will be hidden from the sidebar.`,
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find((company) => company.id !== selectedCompanyId && company.status !== "archived")?.id ??
                  null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId,
                });
              }}
            >
              {archiveMutation.isPending
                ? "Archiving..."
                : selectedCompany.status === "archived"
                  ? "Already archived"
                  : "Archive company"}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error ? archiveMutation.error.message : "Failed to archive company"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildAgentSnippet(input: AgentSnippetInput) {
  const candidateUrls = buildCandidateOnboardingUrls(input);
  const resolutionTestUrl = buildResolutionTestUrl(input);

  const candidateList =
    candidateUrls.length > 0 ? candidateUrls.map((u) => `- ${u}`).join("\n") : "- (No candidate URLs available yet.)";

  const connectivityBlock =
    candidateUrls.length === 0
      ? `No candidate URLs are available. Ask your user to configure a reachable hostname in Paperclip, then retry.
Suggested steps:
- choose a hostname that resolves to the Paperclip host from your runtime
- run: pnpm paperclipai allowed-hostname <host>
- restart Paperclip
- verify with: curl -fsS http://<host>:3100/api/health
- regenerate this invite snippet`
      : `If none are reachable, ask your user to add a reachable hostname in Paperclip, restart, and retry.
Suggested command:
- pnpm paperclipai allowed-hostname <host>
Then verify with: curl -fsS <base-url>/api/health`;

  const resolutionLine = resolutionTestUrl
    ? `\nYou MUST test Paperclip-to-gateway reachability, call: ${resolutionTestUrl}?url=<urlencoded-gateway-url> (using the hostname that worked above). Do not assume your 172.x is necessarily reachable from Paperclip. Test it. `
    : "";

  return `You're invited to join a Paperclip organization.

The URLs you should try are:
${candidateList}

Connectivity guidance:
If you are running on a different machine than Paperclip, Paperclip must be reachable at one of the hostnames used above.
Verify the hostname works from your runtime with: GET <base-url>/api/health

${connectivityBlock}

For your "agentName", just use your own agent name (OpenClaw or whatever your name is) and send it directly.
You also need to send a gateway URL that Paperclip can access. Check your config and include that URL.${resolutionLine}

---

This onboarding flow is for OpenClaw Gateway.
When you submit the join request, use:
- \`adapterType: "openclaw_gateway"\`
- \`agentDefaultsPayload.url\` as your \`ws://\` or \`wss://\` gateway URL
- \`agentDefaultsPayload.headers["x-openclaw-token"]\` with your gateway token
- (legacy accepted) \`agentDefaultsPayload.headers["x-openclaw-auth"]\`
- Keep device auth enabled (recommended). If \`devicePrivateKeyPem\` is omitted, Paperclip will generate and persist one during join so pairing approvals remain stable.
- Only use \`disableDeviceAuth=true\` for special environments where pairing cannot be completed.

Do NOT use \`/v1/responses\` or \`/hooks/*\` in this join flow.

Before you do anything, please respond to your user that you understand the instructions and you're going to work on them. Then do the step above in another session called "paperclip-onboarding" and then tell your user when you're done. Update your user in intermediate steps along the way so they know what's going on.

Then after you've connected to Paperclip (exchanged keys etc.) you MUST review and follow the onboarding instructions in onboarding.txt they give you.

`;
}

function buildCandidateOnboardingUrls(input: AgentSnippetInput): string[] {
  const candidates = (input.connectionCandidates ?? []).map((candidate) => candidate.trim()).filter(Boolean);
  const urls = new Set<string>();
  let onboardingUrl: URL | null = null;

  try {
    onboardingUrl = new URL(input.onboardingTextUrl);
    urls.add(onboardingUrl.toString());
  } catch {
    const trimmed = input.onboardingTextUrl.trim();
    if (trimmed) {
      urls.add(trimmed);
    }
  }

  if (!onboardingUrl) {
    for (const candidate of candidates) {
      urls.add(candidate);
    }
    return Array.from(urls);
  }

  const onboardingPath = `${onboardingUrl.pathname}${onboardingUrl.search}`;
  for (const candidate of candidates) {
    try {
      const base = new URL(candidate);
      urls.add(`${base.origin}${onboardingPath}`);
    } catch {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function buildResolutionTestUrl(input: AgentSnippetInput): string | null {
  const explicit = input.testResolutionUrl?.trim();
  if (explicit) return explicit;

  try {
    const onboardingUrl = new URL(input.onboardingTextUrl);
    const testPath = onboardingUrl.pathname.replace(/\/onboarding\.txt$/, "/test-resolution");
    return `${onboardingUrl.origin}${testPath}`;
  } catch {
    return null;
  }
}
