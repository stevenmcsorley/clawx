import { describe, it, expect } from "vitest";
import { resolveModel } from "../src/core/provider.js";
import type { ClawdexConfig } from "../src/types/index.js";

function makeConfig(overrides: Partial<ClawdexConfig> = {}): ClawdexConfig {
  return {
    provider: "openai-completions",
    baseUrl: "http://localhost:8080/v1",
    model: "test-model",
    apiKey: "test-key",
    workDir: "/tmp",
    shell: "/bin/bash",
    execTimeout: 60000,
    thinkingLevel: "medium",
    maxTokens: 4096,
    sessionDir: "/tmp/sessions",
    sshTargets: {},
    ...overrides,
  };
}

describe("resolveModel", () => {
  it("should resolve a local openai-compatible model", () => {
    const model = resolveModel(makeConfig());
    expect(model.id).toBe("test-model");
    expect(model.api).toBe("openai-completions");
    expect(model.baseUrl).toBe("http://localhost:8080/v1");
    expect(model.provider).toBe("openai-completions");
  });

  it("should resolve anthropic provider", () => {
    const model = resolveModel(
      makeConfig({ provider: "anthropic", model: "claude-sonnet-4-20250514" }),
    );
    expect(model.api).toBe("anthropic-messages");
  });

  it("should map 'local' to openai-completions", () => {
    const model = resolveModel(makeConfig({ provider: "local" }));
    expect(model.api).toBe("openai-completions");
  });

  it("should map 'ollama' to openai-completions", () => {
    const model = resolveModel(makeConfig({ provider: "ollama" }));
    expect(model.api).toBe("openai-completions");
  });

  it("should map 'llama.cpp' to openai-completions", () => {
    const model = resolveModel(makeConfig({ provider: "llama.cpp" }));
    expect(model.api).toBe("openai-completions");
  });

  it("should default unknown providers to openai-completions", () => {
    const model = resolveModel(makeConfig({ provider: "custom-thing" }));
    expect(model.api).toBe("openai-completions");
  });

  it("should set reasoning based on thinkingLevel", () => {
    const off = resolveModel(makeConfig({ thinkingLevel: "off" }));
    expect(off.reasoning).toBe(false);

    const high = resolveModel(makeConfig({ thinkingLevel: "high" }));
    expect(high.reasoning).toBe(true);
  });
});
