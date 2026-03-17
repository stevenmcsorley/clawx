/**
 * Hardware spec management for Clawx Scout.
 *
 * Auto-detects GPU, VRAM, RAM, and OS from the system.
 * Falls back to manual prompts if detection fails.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";
import readline from "node:readline";
import { getGlobalConfigDir } from "./index.js";

export interface HardwareSpec {
  gpu: string;
  vram: string;
  ram: string;
  os: string;
  notes?: string;
}

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

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${Math.round(gb)}GB` : `${Math.round(gb * 1024)}MB`;
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function detectGpu(): { gpu: string; vram: string } {
  // Try nvidia-smi first (works on Windows + Linux)
  const nvsmi = run("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits");
  if (nvsmi) {
    const lines = nvsmi.split("\n").filter(Boolean);
    const gpus: string[] = [];
    let totalVram = 0;
    for (const line of lines) {
      const parts = line.split(",").map((s) => s.trim());
      gpus.push(parts[0]);
      const mb = parseInt(parts[1], 10);
      if (!isNaN(mb)) totalVram += mb;
    }
    const gpu = gpus.join(" + ");
    const vram = totalVram >= 1024 ? `${Math.round(totalVram / 1024)}GB` : `${totalVram}MB`;
    return { gpu, vram };
  }

  if (process.platform === "win32") {
    // wmic fallback for Windows (covers AMD/Intel too)
    const wmic = run("wmic path win32_VideoController get Name,AdapterRAM /format:csv");
    if (wmic) {
      const lines = wmic.split("\n").filter((l) => l.trim() && !l.startsWith("Node"));
      const gpus: string[] = [];
      let totalVram = 0;
      for (const line of lines) {
        const parts = line.split(",").map((s) => s.trim());
        // CSV format: Node,AdapterRAM,Name
        const adapterRam = parseInt(parts[1], 10);
        const name = parts[2];
        if (name) gpus.push(name);
        if (!isNaN(adapterRam) && adapterRam > 0) totalVram += adapterRam;
      }
      if (gpus.length > 0) {
        return {
          gpu: gpus.join(" + "),
          vram: totalVram > 0 ? formatBytes(totalVram) : "Unknown",
        };
      }
    }
  }

  if (process.platform === "linux") {
    // lspci fallback for Linux
    const lspci = run("lspci | grep -i 'vga\\|3d\\|display'");
    if (lspci) {
      const match = lspci.match(/:\s+(.+)/);
      return { gpu: match?.[1] || lspci.split("\n")[0], vram: "Unknown" };
    }
  }

  if (process.platform === "darwin") {
    const sp = run("system_profiler SPDisplaysDataType 2>/dev/null | grep 'Chipset Model\\|VRAM'");
    if (sp) {
      const chipMatch = sp.match(/Chipset Model:\s+(.+)/);
      const vramMatch = sp.match(/VRAM.*?:\s+(.+)/);
      return {
        gpu: chipMatch?.[1] || "Apple Silicon",
        vram: vramMatch?.[1] || "Unified Memory",
      };
    }
  }

  return { gpu: "Unknown GPU", vram: "Unknown" };
}

function detectRam(): string {
  const totalBytes = os.totalmem();
  return formatBytes(totalBytes);
}

function detectOs(): string {
  if (process.platform === "win32") {
    const ver = run("ver");
    if (ver) return ver;
    return `Windows ${os.release()}`;
  }
  if (process.platform === "darwin") {
    const ver = run("sw_vers -productVersion");
    return ver ? `macOS ${ver}` : "macOS";
  }
  // Linux
  const pretty = run("cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'");
  return pretty || `Linux ${os.release()}`;
}

/**
 * Auto-detect hardware specs from the system.
 * Returns a HardwareSpec with best-effort values.
 */
export function detectHardwareSpec(): HardwareSpec {
  const { gpu, vram } = detectGpu();
  const ram = detectRam();
  const detectedOs = detectOs();

  return { gpu, vram, ram, os: detectedOs };
}

/**
 * Auto-detect hardware, save it, and print what was found.
 * If detection gets "Unknown" for critical fields, offer manual override.
 */
export async function autoDetectAndSave(): Promise<HardwareSpec> {
  console.log("\n  Detecting hardware...\n");

  const spec = detectHardwareSpec();

  console.log(`    GPU:  ${spec.gpu}`);
  console.log(`    VRAM: ${spec.vram}`);
  console.log(`    RAM:  ${spec.ram}`);
  console.log(`    OS:   ${spec.os}`);

  const hasUnknowns = spec.gpu === "Unknown GPU" || spec.vram === "Unknown";

  if (hasUnknowns) {
    console.log("\n  Some values couldn't be auto-detected. Fill in the blanks:\n");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string, def?: string): Promise<string> =>
      new Promise((resolve) => {
        const suffix = def ? ` [${def}]` : "";
        rl.question(`${q}${suffix}: `, (answer) => resolve(answer.trim() || def || ""));
      });

    if (spec.gpu === "Unknown GPU") spec.gpu = await ask("  GPU", spec.gpu);
    if (spec.vram === "Unknown") spec.vram = await ask("  VRAM (e.g. 12GB)", spec.vram);
    rl.close();
  }

  saveHardwareSpec(spec);
  console.log(`\n  Hardware spec saved to ${getHardwarePath()}\n`);

  return spec;
}

/**
 * Interactive manual prompts for all fields (--setup-hardware).
 * Pre-fills with auto-detected values so user can just press Enter.
 */
export async function promptHardwareSpec(): Promise<HardwareSpec> {
  const detected = detectHardwareSpec();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, def?: string): Promise<string> =>
    new Promise((resolve) => {
      const suffix = def ? ` [${def}]` : "";
      rl.question(`${q}${suffix}: `, (answer) => resolve(answer.trim() || def || ""));
    });

  console.log("\n  Hardware Setup for Scout");
  console.log("  Auto-detected values shown in brackets — press Enter to accept.\n");

  const gpu = await ask("  GPU", detected.gpu);
  const vram = await ask("  VRAM", detected.vram);
  const ram = await ask("  RAM", detected.ram);
  const osName = await ask("  OS", detected.os);
  const notes = await ask("  Notes (optional, e.g. 'prefer uncensored models')");

  rl.close();

  const spec: HardwareSpec = { gpu, vram, ram, os: osName };
  if (notes) spec.notes = notes;

  saveHardwareSpec(spec);
  console.log(`\n  Hardware spec saved to ${getHardwarePath()}\n`);

  return spec;
}
