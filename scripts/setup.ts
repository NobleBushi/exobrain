#!/usr/bin/env tsx
/**
 * ExoBrain interactive setup & hardware assessment
 *
 * Usage:
 *   npm run setup
 *   tsx scripts/setup.ts
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ── Helpers ────────────────────────────────────────────────────────────────

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1) + " GB";
}

// ── Hardware detection ─────────────────────────────────────────────────────

interface GpuInfo {
  name: string;
  vramBytes: number;
  driver: "nvidia" | "rocm" | "apple" | "intel" | "unknown";
}

interface HardwareProfile {
  timestamp: string;
  hostname: string;
  os: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  ramBytes: number;
  diskFreeBytes: number;
  gpus: GpuInfo[];
  dockerAvailable: boolean;
  recommendation: StackTier;
  localLlm: LocalLlmTier;
}

type StackTier =
  | "full"       // Postgres+pgvector HNSW + ArcadeDB — 8GB+ RAM recommended
  | "standard"   // Postgres+pgvector IVFFlat + ArcadeDB — 4–8GB RAM
  | "lite"       // SQLite + ArcadeDB — 2–4GB RAM (Pi-class)
  | "minimal"    // SQLite only — <2GB RAM (embedded, no graph at runtime)
  ;

type LocalLlmTier =
  | "capable-large"    // ≥16GB VRAM — 70B+ models
  | "capable-medium"   // 8–16GB VRAM — 13–34B models
  | "capable-small"    // 4–8GB VRAM — 7–13B models
  | "cpu-only"         // No dedicated GPU — CPU inference, small models
  | "none"             // <4GB VRAM, limited CPU — cloud LLM recommended
  ;

function detectCpuInfo(): { model: string; cores: number } {
  const cores = parseInt(run("nproc") || "1", 10);

  // Linux
  let model = run("grep -m1 'model name' /proc/cpuinfo | cut -d: -f2").trim();
  // macOS
  if (!model) model = run("sysctl -n machdep.cpu.brand_string");
  // Fallback
  if (!model) model = run("uname -p") || "unknown";

  return { model: model || "unknown", cores };
}

function detectRam(): number {
  // Linux
  const memFree = run("free -b | awk '/^Mem:/{print $2}'");
  if (memFree) return parseInt(memFree, 10);
  // macOS
  const memSize = run("sysctl -n hw.memsize");
  if (memSize) return parseInt(memSize, 10);
  return 0;
}

function detectDiskFree(dir: string): number {
  const out = run(`df -B1 "${dir}" | awk 'NR==2{print $4}'`);
  return parseInt(out || "0", 10);
}

function detectGpus(): GpuInfo[] {
  const gpus: GpuInfo[] = [];

  // NVIDIA
  const nvOut = run("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits");
  if (nvOut) {
    for (const line of nvOut.split("\n").filter(Boolean)) {
      const parts = line.split(",").map(s => s.trim());
      const name = parts[0] ?? "NVIDIA GPU";
      const vramMb = parseInt(parts[1] ?? "0", 10);
      gpus.push({ name, vramBytes: vramMb * 1024 * 1024, driver: "nvidia" });
    }
    return gpus;
  }

  // ROCm (AMD)
  const rocmOut = run("rocm-smi --showproductname --showmeminfo vram --csv 2>/dev/null | tail -n+2");
  if (rocmOut) {
    for (const line of rocmOut.split("\n").filter(Boolean)) {
      const parts = line.split(",").map(s => s.trim());
      gpus.push({ name: parts[1] ?? "AMD GPU", vramBytes: parseInt(parts[2] ?? "0", 10), driver: "rocm" });
    }
    if (gpus.length) return gpus;
  }

  // Apple Silicon (unified memory — estimate as fraction of total RAM)
  const isApple = run("uname -m") === "arm64" && run("uname -s") === "Darwin";
  if (isApple) {
    const totalRam = detectRam();
    gpus.push({ name: "Apple Silicon (unified memory)", vramBytes: totalRam, driver: "apple" });
    return gpus;
  }

  // Generic fallback via lspci
  const lspci = run("lspci | grep -i 'vga\\|3d\\|display'");
  if (lspci) {
    for (const line of lspci.split("\n").filter(Boolean)) {
      const isAmd = /amd|ati|radeon/i.test(line);
      const isIntel = /intel/i.test(line);
      gpus.push({
        name: line.replace(/^\S+\s+\S+:\s+/, "").trim(),
        vramBytes: 0,   // lspci can't report VRAM without extra tools
        driver: isAmd ? "rocm" : isIntel ? "intel" : "unknown",
      });
    }
  }

  return gpus;
}

function classifyStack(ramBytes: number): StackTier {
  const gb = ramBytes / 1024 ** 3;
  if (gb >= 8)  return "full";
  if (gb >= 4)  return "standard";
  if (gb >= 2)  return "lite";
  return "minimal";
}

function classifyLocalLlm(gpus: GpuInfo[], ramBytes: number): LocalLlmTier {
  // Sum VRAM across all capable GPUs
  const dedicatedVram = gpus
    .filter(g => g.driver !== "intel" && g.driver !== "unknown" || g.vramBytes > 0)
    .reduce((sum, g) => sum + g.vramBytes, 0);

  const vramGb = dedicatedVram / 1024 ** 3;

  if (vramGb >= 16) return "capable-large";
  if (vramGb >= 8)  return "capable-medium";
  if (vramGb >= 4)  return "capable-small";

  // CPU-only inference — usable if enough RAM
  const ramGb = ramBytes / 1024 ** 3;
  if (ramGb >= 8) return "cpu-only";

  return "none";
}

// ── Recommendation text ────────────────────────────────────────────────────

function stackAdvice(tier: StackTier): string {
  switch (tier) {
    case "full":
      return [
        "Recommended config: FULL STACK",
        "  docker-compose.yml (ArcadeDB + Postgres with pgvector HNSW)",
        "  DB_BACKEND=postgres   GRAPH_BACKEND=arcadedb",
        "  pgvector index: HNSW (set in schema after load)",
      ].join("\n");
    case "standard":
      return [
        "Recommended config: STANDARD",
        "  docker-compose.yml (ArcadeDB + Postgres with pgvector IVFFlat)",
        "  DB_BACKEND=postgres   GRAPH_BACKEND=arcadedb",
        "  pgvector index: IVFFlat (lower memory than HNSW)",
      ].join("\n");
    case "lite":
      return [
        "Recommended config: LITE (Pi-class)",
        "  docker-compose.lite.yml (ArcadeDB only)",
        "  DB_BACKEND=sqlite   GRAPH_BACKEND=arcadedb",
        "  SQLite + sqlite-vec for lightweight vector search",
      ].join("\n");
    case "minimal":
      return [
        "Recommended config: MINIMAL (embedded only)",
        "  No docker-compose — SQLite only",
        "  DB_BACKEND=sqlite   GRAPH_BACKEND=arcadedb (optional)",
        "  ⚠ Very limited — consider upgrading hardware for best results",
      ].join("\n");
  }
}

function llmAdvice(tier: LocalLlmTier, gpus: GpuInfo[]): string {
  const gpuNames = gpus.map(g => `${g.name} (${gb(g.vramBytes)} VRAM)`).join(", ") || "none detected";
  switch (tier) {
    case "capable-large":
      return `Local LLM: EXCELLENT — ${gpuNames}\n  Capable of 70B+ models (Llama 3 70B, Mixtral 8x22B, etc.)`;
    case "capable-medium":
      return `Local LLM: GOOD — ${gpuNames}\n  Capable of 13–34B models (Llama 3 13B, Mistral 22B, etc.)`;
    case "capable-small":
      return `Local LLM: LIMITED — ${gpuNames}\n  Capable of 7–13B models (Llama 3 8B, Mistral 7B, etc.)`;
    case "cpu-only":
      return `Local LLM: CPU-ONLY — ${gpuNames}\n  Small models possible (Phi-3, Gemma 2B) — slow, usable for low-traffic`;
    case "none":
      return `Local LLM: NOT RECOMMENDED — insufficient GPU/RAM\n  Cloud LLM recommended (Claude, GPT-4, etc.)`;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ExoBrain Setup & Hardware Assessment");
  console.log("═══════════════════════════════════════════════════════════\n");

  const runHere = await rl.question("Will ExoBrain run on this machine? [Y/n] ");
  if (runHere.trim().toLowerCase() === "n") {
    console.log("\nSetup complete — no hardware check needed for a client-only install.");
    console.log("Connect to a remote ExoBrain instance via MCP_URL in .env.\n");
    rl.close();
    return;
  }

  console.log("\nDetecting hardware...\n");

  const arch      = run("uname -m") || "unknown";
  const os        = run("uname -s") + " " + run("uname -r");
  const hostname  = run("hostname") || "unknown";
  const cpu       = detectCpuInfo();
  const ramBytes  = detectRam();
  const diskFree  = detectDiskFree(process.cwd());
  const gpus      = detectGpus();
  const docker    = !!run("docker --version");
  const stackTier = classifyStack(ramBytes);
  const llmTier   = classifyLocalLlm(gpus, ramBytes);

  const profile: HardwareProfile = {
    timestamp: new Date().toISOString(),
    hostname, os, arch,
    cpuModel: cpu.model,
    cpuCores: cpu.cores,
    ramBytes, diskFreeBytes: diskFree,
    gpus, dockerAvailable: docker,
    recommendation: stackTier,
    localLlm: llmTier,
  };

  // ── Print report ─────────────────────────────────────────────────────────

  console.log("─── System ─────────────────────────────────────────────────");
  console.log(`  Host:  ${hostname}`);
  console.log(`  OS:    ${os}`);
  console.log(`  Arch:  ${arch}`);
  console.log(`  CPU:   ${cpu.model} (${cpu.cores} cores)`);
  console.log(`  RAM:   ${gb(ramBytes)}`);
  console.log(`  Disk:  ${gb(diskFree)} free`);
  console.log(`  Docker: ${docker ? "✓ available" : "✗ not found — install Docker before proceeding"}`);

  console.log("\n─── GPU / Local LLM ────────────────────────────────────────");
  if (gpus.length === 0) {
    console.log("  No GPU detected");
  } else {
    for (const g of gpus) {
      const vram = g.vramBytes > 0 ? ` — ${gb(g.vramBytes)} VRAM` : "";
      console.log(`  ${g.name}${vram} [${g.driver}]`);
    }
  }
  console.log(`\n  ${llmAdvice(llmTier, gpus)}`);

  console.log("\n─── Recommendation ─────────────────────────────────────────");
  console.log(`\n  ${stackAdvice(stackTier)}\n`);

  // ── Save profile ──────────────────────────────────────────────────────────

  const profilePath = path.join(process.cwd(), "hardware.json");
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  console.log(`  ✓ Hardware profile saved to hardware.json\n`);

  // ── Next steps ────────────────────────────────────────────────────────────

  console.log("─── Next steps ─────────────────────────────────────────────");
  const compose = stackTier === "lite" || stackTier === "minimal"
    ? "docker compose -f docker-compose.lite.yml"
    : "docker compose";

  console.log(`
  1. Copy and edit your env file:
       cp .env.example .env

  2. Check for port conflicts:
       npm run check:ports

  3. Start the database layer:
       ${compose} up -d

  4. Seed the TF3 knowledge graph:
       npm run seed:arcadedb

  5. Start ExoBrain:
       npm run dev
`);

  rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
