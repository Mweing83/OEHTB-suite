import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./index";

describe("GET /api/health", () => {
  it("antwortet mit status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
