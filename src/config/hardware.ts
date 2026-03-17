/**
 * Hardware spec management for Clawx Scout.
 *
 * Stores user's hardware info (GPU, VRAM, RAM) so the scout agent
 * can recommend models that actually fit the user's system.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { getGlobalConfigDir } from "./index.js";

export interface HardwareSpec {
  gpu: string;
  vram: string;
  ram: string;
  os: string;
  notes?: string;
}

const DEFAULTS: HardwareSpec = {
  gpu: "Unknown GPU",
  vram: "Unknown",
  ram: "Unknown",
  os: process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux",
};

function getHardwarePath(): string {
  return path.join(getGlobalConfigDir(), "hardware.json");
}

export function loadHardwareSpec(): HardwareSpec | null {
  const filePath = getHardwarePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as HardwareSpec;
  } catch {
    return null;
  }
}

export function saveHardwareSpec(spec: HardwareSpec): void {
  const dir = getGlobalConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getHardwarePath(), JSON.stringify(spec, null, 2), "utf-8");
}

export async function promptHardwareSpec(): Promise<HardwareSpec> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string, def?: string): Promise<string> =>
    new Promise((resolve) => {
      const suffix = def ? ` [${def}]` : "";
      rl.question(`${q}${suffix}: `, (answer) =>
        resolve(answer.trim() || def || ""),
      );
    });

  console.log("\n  Hardware Setup for Scout\n");
  console.log("  Scout uses your hardware specs to recommend models that fit.\n");

  const gpu = await ask("  GPU", DEFAULTS.gpu);
  const vram = await ask("  VRAM (e.g. 12GB, 24GB)", DEFAULTS.vram);
  const ram = await ask("  System RAM (e.g. 32GB, 64GB)", DEFAULTS.ram);
  const os = await ask("  OS", DEFAULTS.os);
  const notes = await ask("  Notes (optional, e.g. 'prefer uncensored models')");

  rl.close();

  const spec: HardwareSpec = { gpu, vram, ram, os };
  if (notes) spec.notes = notes;

  saveHardwareSpec(spec);
  console.log(`\n  Hardware spec saved to ${getHardwarePath()}\n`);

  return spec;
}
