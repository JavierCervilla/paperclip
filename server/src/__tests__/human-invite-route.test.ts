import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  }));
}

function makeCreatedInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    companyId: "company-1",
    inviteType: "company_join",
    allowedJoinTypes: "human",
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

  return {
    insert() {
      return {
        values() {
          return {
            returning() {
              return Promise.resolve([createdInvite]);
            },
          };
        },
      };
    },
    select(_shape?: unknown) {
      return {
        from() {
          const query: Record<string, unknown> = {
            leftJoin() {
              return query;
            },
            where() {
              return Object.assign(
                Promise.resolve([
                  {
                    name: "Test Co",
                    brandColor: null,
                    logoAssetId: null,
                  },
                ]),
                {
                  orderBy() {
                    return Object.assign(Promise.resolve([createdInvite]), {
                      limit() {
                        return Object.assign(Promise.resolve([createdInvite]), {
                          offset() {
                            return Promise.resolve([createdInvite]);
                          },
                        });
                      },
                    });
                  },
                },
              );
            },
          };
          return query;
        },
      };
    },
    __createdInvite: createdInvite,
  };
}

async function createApp(actor: Record<string, unknown>, db: Record<string, unknown>) {
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

  it("logs activity with correct details on invite creation", async () => {
    const db = createDbStub();
    const app = await createApp(boardActor, db);
    await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human" });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "invite.created",
        companyId: "company-1",
        entityType: "invite",
        details: expect.objectContaining({
          inviteType: "company_join",
          allowedJoinTypes: "human",
        }),
      }),
    );
  });

  it("returns inviteUrl in response", async () => {
    const db = createDbStub();
    const app = await createApp(boardActor, db);
    const res = await request(app).post("/api/companies/company-1/invites").send({ allowedJoinTypes: "human" });
    expect(res.status).toBe(201);
    expect(res.body.inviteUrl).toMatch(/\/invite\//);
    expect(res.body.token).toBeTruthy();
  });

  it("includes company name in response", async () => {
    const db = createDbStub();
    const app = await createApp(boardActor, db);
    const res = await request(app).post("/api/companies/company-1/invites").send({ allowedJoinTypes: "human" });
    expect(res.status).toBe(201);
    expect(res.body.companyName).toBe("Test Co");
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

  it("returns invites with expected fields in the list response", async () => {
    const db = createDbStub();
    const app = await createApp(boardActor, db);
    const res = await request(app).get("/api/companies/company-1/invites");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("invites");
    expect(Array.isArray(res.body.invites)).toBe(true);
    if (res.body.invites.length > 0) {
      const invite = res.body.invites[0];
      expect(invite).toHaveProperty("id");
      expect(invite).toHaveProperty("companyId");
      expect(invite).toHaveProperty("inviteType");
      expect(invite).toHaveProperty("state");
    }
  });
});
