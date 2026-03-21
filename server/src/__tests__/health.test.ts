import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { healthRoutes } from "../routes/health.js";
import { serverVersion } from "../version.js";

describe("GET /health", () => {
  describe("without db", () => {
    const app = express();
    app.use("/health", healthRoutes());

    it("returns 200 with status ok and uptime", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.version).toBe(serverVersion);
      expect(typeof res.body.uptime).toBe("number");
    });
  });
});
