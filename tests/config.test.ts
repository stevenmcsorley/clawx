import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dotenv so tests don't pick up the real .env file
vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

import { loadConfig } from "../src/config/index.js";

describe("loadConfig", () => {
  beforeEach(() => {
    // Clear any env vars set by previous tests
    delete process.env.CLAWDEX_PROVIDER;
    delete process.env.CLAWDEX_BASE_URL;
    delete process.env.CLAWDEX_MODEL;
    delete process.env.CLAWDEX_API_KEY;
    delete process.env.CLAWDEX_SHELL;
    delete process.env.CLAWDEX_EXEC_TIMEOUT;
    delete process.env.CLAWDEX_THINKING_LEVEL;
    delete process.env.CLAWDEX_MAX_TOKENS;
    delete process.env.CLAWDEX_SSH_TARGETS;
  });

  it("should return defaults when no env or overrides", () => {
    const config = loadConfig();
    expect(config.provider).toBe("openai-completions");
    expect(config.baseUrl).toBe("http://localhost:8080/v1");
    expect(config.model).toBe("qwen2.5-coder-14b-instruct");
    expect(config.execTimeout).toBe(120_000);
    expect(config.maxTokens).toBe(16384);
    expect(config.sshTargets).toEqual({});
  });

  it("should respect overrides", () => {
    const config = loadConfig({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      baseUrl: "https://api.anthropic.com",
    });
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("claude-sonnet-4-20250514");
    expect(config.baseUrl).toBe("https://api.anthropic.com");
  });

  it("should respect env vars", () => {
    process.env.CLAWDEX_PROVIDER = "openai";
    process.env.CLAWDEX_MODEL = "gpt-4o";
    process.env.CLAWDEX_MAX_TOKENS = "8192";
    const config = loadConfig();
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o");
    expect(config.maxTokens).toBe(8192);
  });

  it("should parse SSH targets from env", () => {
    process.env.CLAWDEX_SSH_TARGETS = JSON.stringify({
      pi: { host: "192.168.1.100", username: "pi", privateKeyPath: "~/.ssh/id_rsa" },
    });
    const config = loadConfig();
    expect(config.sshTargets.pi).toBeDefined();
    expect(config.sshTargets.pi.host).toBe("192.168.1.100");
    expect(config.sshTargets.pi.username).toBe("pi");
  });

  it("should handle invalid SSH targets JSON gracefully", () => {
    process.env.CLAWDEX_SSH_TARGETS = "not-json";
    const config = loadConfig();
    expect(config.sshTargets).toEqual({});
  });
});
