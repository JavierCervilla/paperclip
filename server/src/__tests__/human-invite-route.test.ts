import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNoopMailer, createResendMailer, type Mailer, type SendMailResult } from "../services/email/mailer.js";

const mockAccessService = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  canUser: vi.fn(),
  isInstanceAdmin: vi.fn(),
  getMembership: vi.fn(),
  ensureMembership: vi.fn(),
  listMembers: vi.fn(),
  setMemberPermissions: vi.fn(),
  promoteInstanceAdmin: vi.fn(),
  demoteInstanceAdmin: vi.fn(),
  listUserCompanyAccess: vi.fn(),
  setUserCompanyAccess: vi.fn(),
  setPrincipalGrants: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockBoardAuthService = vi.hoisted(() => ({
  createCliAuthChallenge: vi.fn(),
  describeCliAuthChallenge: vi.fn(),
  approveCliAuthChallenge: vi.fn(),
  cancelCliAuthChallenge: vi.fn(),
  resolveBoardAccess: vi.fn(),
  assertCurrentBoardKey: vi.fn(),
  revokeBoardApiKey: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

function registerModuleMocks() {
  vi.doMock("../services/index.js", () => ({
    accessService: () => mockAccessService,
    agentService: () => mockAgentService,
    boardAuthService: () => mockBoardAuthService,
    deduplicateAgentName: vi.fn(),
    logActivity: mockLogActivity,
    notifyHireApproved: vi.fn(),
    feedbackService: () => ({}),
    instanceSettingsService: () => ({}),
    assetService: () => ({}),
    chatService: () => ({}),
    chatProcessService: () => ({}),
    setChatSummaryFallbackHandler: vi.fn(),
    buildDeterministicChatSummary: vi.fn(() => ""),
  }));
}

function makeCreatedInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    companyId: "company-1",
    inviteType: "company_join",
    allowedJoinTypes: "human",
    recipientEmail: null,
    defaultsPayload: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedByUserId: "user-1",
    tokenHash: "hash",
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createDbStub(inviteOverrides: Record<string, unknown> = {}) {
  const createdInvite = makeCreatedInvite(inviteOverrides);
  const returning = vi.fn().mockResolvedValue([createdInvite]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set: updateSet });

  const isCompaniesTable = (table: unknown) =>
    !!table && typeof table === "object" && "issuePrefix" in table && "requireBoardApprovalForNewAgents" in table;

  const selectMock = vi.fn((selection?: unknown) => ({
    from(table: unknown) {
      const isCompany = isCompaniesTable(table) || (selection && typeof selection === "object" && "name" in selection);
      return {
        where: vi.fn().mockImplementation(() => {
          if (isCompany) {
            return Object.assign(Promise.resolve([{ name: "Test Co" }]), {
              orderBy: vi.fn().mockResolvedValue([{ name: "Test Co" }]),
            });
          }
          return Object.assign(Promise.resolve([createdInvite]), {
            orderBy: vi.fn().mockResolvedValue([createdInvite]),
          });
        }),
      };
    },
  }));

  return {
    insert,
    select: selectMock,
    update,
    __insertValues: values,
    __updateSet: updateSet,
    __createdInvite: createdInvite,
  };
}

async function createApp(actor: Record<string, unknown>, db: Record<string, unknown>, mailer?: Mailer) {
  const [{ accessRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/access.js")>("../routes/access.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use(
    "/api",
    accessRoutes(db as any, {
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
      mailer,
    }),
  );
  app.use(errorHandler);
  return app;
}

const boardActor = {
  type: "board",
  userId: "user-1",
  companyIds: ["company-1"],
  source: "session",
  isInstanceAdmin: false,
};

describe("POST /companies/:companyId/invites", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../services/index.js");
    vi.doUnmock("../routes/access.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.resetAllMocks();
    mockAccessService.canUser.mockResolvedValue(true);
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const db = createDbStub();
    const app = await createApp({ type: "none" }, db);
    const res = await request(app).post("/api/companies/company-1/invites").send({ allowedJoinTypes: "human" });
    expect(res.status).toBe(401);
  });

  it("rejects board user without invite permission with 403", async () => {
    const db = createDbStub();
    mockAccessService.canUser.mockResolvedValue(false);
    const app = await createApp(boardActor, db);
    const res = await request(app).post("/api/companies/company-1/invites").send({ allowedJoinTypes: "human" });
    expect(res.status).toBe(403);
  });

  it("persists recipientEmail when provided", async () => {
    const db = createDbStub({ recipientEmail: "alice@example.com" });
    const app = await createApp(boardActor, db);
    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", recipientEmail: "alice@example.com" });
    expect([200, 201]).toContain(res.status);
    expect(db.__insertValues).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: "alice@example.com" }));
  });

  it("stores null recipientEmail when not provided", async () => {
    const db = createDbStub();
    const app = await createApp(boardActor, db);
    const res = await request(app).post("/api/companies/company-1/invites").send({ allowedJoinTypes: "human" });
    expect([200, 201]).toContain(res.status);
    expect(db.__insertValues).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: null }));
  });

  it("uses hasRecipientEmail in activity log details (not the email itself)", async () => {
    const db = createDbStub({ recipientEmail: "alice@example.com" });
    const app = await createApp(boardActor, db);
    await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", recipientEmail: "alice@example.com" });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({
          hasRecipientEmail: true,
        }),
      }),
    );
    // The raw email must NOT appear in the log details
    const logCall = mockLogActivity.mock.calls[0]?.[1];
    expect(JSON.stringify(logCall?.details ?? {})).not.toContain("alice@example.com");
  });

  it("returns inviteUrl in response", async () => {
    const db = createDbStub();
    const app = await createApp(boardActor, db);
    const res = await request(app).post("/api/companies/company-1/invites").send({ allowedJoinTypes: "human" });
    expect([200, 201]).toContain(res.status);
    expect(res.body.inviteUrl).toMatch(/^\/invite\//);
    expect(res.body.token).toBeTruthy();
  });

  it("does not call the mailer when no mailer is provided (Noop fallback)", async () => {
    const db = createDbStub({ recipientEmail: "alice@example.com" });
    const app = await createApp(boardActor, db);
    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", recipientEmail: "alice@example.com" });
    expect([200, 201]).toContain(res.status);
    expect(res.body.emailSent).toBeUndefined();
    expect(res.body.emailError).toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("sends an email and persists sentAt when mailer is enabled and recipientEmail is present", async () => {
    const db = createDbStub({ recipientEmail: "alice@example.com" });
    const send = vi.fn().mockResolvedValue({ data: { id: "email_1" }, error: null });
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "Sender <invites@example.com>",
      client: { emails: { send } as any },
    });
    const app = await createApp(boardActor, db, mailer);

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", recipientEmail: "alice@example.com" });

    expect([200, 201]).toContain(res.status);
    expect(send).toHaveBeenCalledTimes(1);
    const sendPayload = send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sendPayload.to).toBe("alice@example.com");
    expect(sendPayload.subject).toContain("Test Co");
    expect(res.body.emailSent).toBe(true);
    expect(res.body.emailError).toBeUndefined();
    expect(db.update).toHaveBeenCalledTimes(1);
    const setCallArg = db.__updateSet.mock.calls[0]?.[0] as { sentAt: unknown; sendError: unknown };
    expect(setCallArg.sentAt).toBeInstanceOf(Date);
    expect(setCallArg.sendError).toBeNull();
  });

  it("records emailError and sendError when the mailer fails", async () => {
    const db = createDbStub({ recipientEmail: "alice@example.com" });
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name: "invalid_from_address", message: "Domain not verified" },
    });
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "invites@example.com",
      client: { emails: { send } as any },
    });
    const app = await createApp(boardActor, db, mailer);

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", recipientEmail: "alice@example.com" });

    expect([200, 201]).toContain(res.status);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.emailError).toBe("Domain not verified");
    const setCallArg = db.__updateSet.mock.calls[0]?.[0] as { sentAt: unknown; sendError: unknown };
    expect(setCallArg.sentAt).toBeNull();
    expect(setCallArg.sendError).toBe("Domain not verified");
  });

  it("skips the mailer when recipientEmail is null even if mailer is enabled", async () => {
    const db = createDbStub();
    const send = vi.fn();
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "invites@example.com",
      client: { emails: { send } as any },
    });
    const app = await createApp(boardActor, db, mailer);

    const res = await request(app).post("/api/companies/company-1/invites").send({ allowedJoinTypes: "human" });

    expect([200, 201]).toContain(res.status);
    expect(send).not.toHaveBeenCalled();
    expect(res.body.emailSent).toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("skips the mailer when a Noop mailer is passed explicitly", async () => {
    const db = createDbStub({ recipientEmail: "alice@example.com" });
    const app = await createApp(boardActor, db, createNoopMailer());

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", recipientEmail: "alice@example.com" });

    expect([200, 201]).toContain(res.status);
    expect(res.body.emailSent).toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("GET /companies/:companyId/invites", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../services/index.js");
    vi.doUnmock("../routes/access.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.resetAllMocks();
    mockAccessService.canUser.mockResolvedValue(true);
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const db = createDbStub();
    const app = await createApp({ type: "none" }, db);
    const res = await request(app).get("/api/companies/company-1/invites");
    expect(res.status).toBe(401);
  });

  it("rejects board user without invite permission with 403", async () => {
    const db = createDbStub();
    mockAccessService.canUser.mockResolvedValue(false);
    const app = await createApp(boardActor, db);
    const res = await request(app).get("/api/companies/company-1/invites");
    expect(res.status).toBe(403);
  });

  it("does not expose tokenHash in the list response", async () => {
    const db = createDbStub();
    const app = await createApp(boardActor, db);
    const res = await request(app).get("/api/companies/company-1/invites");
    expect([200]).toContain(res.status);
    if (Array.isArray(res.body)) {
      for (const invite of res.body) {
        expect(invite).not.toHaveProperty("tokenHash");
      }
    }
  });
});
