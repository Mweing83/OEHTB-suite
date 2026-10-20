import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../index";

// Haertung 2026-10: schreibende Cross-Site-Anfragen werden abgelehnt.
describe("Sec-Fetch-Site-Pruefung (Portal)", () => {
  it("lehnt cross-site POST ab, laesst same-origin und Server-Aufrufe durch", async () => {
    const fremd = await request(app)
      .post("/api/suite/auth/logout")
      .set("Sec-Fetch-Site", "cross-site");
    expect(fremd.status).toBe(403);

    const eigen = await request(app)
      .post("/api/suite/auth/logout")
      .set("Sec-Fetch-Site", "same-origin");
    expect(eigen.status).toBe(200);

    const ohne = await request(app).post("/api/suite/auth/logout");
    expect(ohne.status).toBe(200);

    const lesend = await request(app).get("/api/suite/health").set("Sec-Fetch-Site", "cross-site");
    expect(lesend.status).toBe(200);
  });
});
