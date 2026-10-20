import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
});

describe("krypto (AES-256-GCM)", () => {
  it("verschluesselt und entschluesselt", async () => {
    const { verschluesseln, entschluesseln } = await import("./krypto");
    expect(entschluesseln(verschluesseln("geheim"))).toBe("geheim");
  });

  it("lehnt gekuerzte Auth-Tags ab", async () => {
    const { verschluesseln, entschluesseln } = await import("./krypto");
    const [iv, tag, daten] = verschluesseln("geheim").split(":");
    const kurz = Buffer.from(tag, "base64").subarray(0, 4).toString("base64");
    expect(() => entschluesseln([iv, kurz, daten].join(":"))).toThrow();
  });
});
