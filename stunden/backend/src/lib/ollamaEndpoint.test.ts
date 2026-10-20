import { describe, it, expect, afterEach } from "vitest";
import { ollamaBasisUrl } from "./ollamaEndpoint";

describe("ollamaBasisUrl", () => {
  afterEach(() => {
    delete process.env.OLLAMA_ERLAUBTE_HOSTS;
  });

  it("akzeptiert normale http(s)-Endpoints und normalisiert sie", () => {
    expect(ollamaBasisUrl("http://localhost:11434/")).toBe("http://localhost:11434");
    expect(ollamaBasisUrl(" https://ollama.intern/proxy/ ")).toBe("https://ollama.intern/proxy");
  });

  it("lehnt andere Schemata, Zugangsdaten, Query und Fragment ab", () => {
    expect(ollamaBasisUrl("file:///etc/passwd")).toBeNull();
    expect(ollamaBasisUrl("ftp://host")).toBeNull();
    expect(ollamaBasisUrl("http://user:pw@host:11434")).toBeNull();
    expect(ollamaBasisUrl("http://host:11434/?x=1")).toBeNull();
    expect(ollamaBasisUrl("http://host:11434/#a")).toBeNull();
    expect(ollamaBasisUrl("kein url")).toBeNull();
  });

  it("beachtet die optionale Host-Allowlist", () => {
    process.env.OLLAMA_ERLAUBTE_HOSTS = "localhost, ollama";
    expect(ollamaBasisUrl("http://ollama:11434")).toBe("http://ollama:11434");
    expect(ollamaBasisUrl("http://169.254.169.254")).toBeNull();
  });
});
