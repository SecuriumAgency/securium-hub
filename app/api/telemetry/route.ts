import { execFile } from "node:child_process";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import type { AgentEvent, AgentStatus, AgentTelemetry, TelemetryResponse } from "@/lib/telemetry";

// Journal partagé des agents (Securium-OS/logs/agent-activity.log), voisin du Hub dans
// C:\Securium-Workspace, ou AGENT_LOG_PATH si défini. Absent sur Vercel : la route le signale.
const LOG_PATH =
  process.env.AGENT_LOG_PATH ?? path.resolve(process.cwd(), "..", "Securium-OS", "logs", "agent-activity.log");
const TAIL_BYTES = 64 * 1024;
const RECENT_COUNT = 40;
const MAX_ACTION_LENGTH = 280;
const PROCESS_TTL_MS = 5000;
const PROCESS_TIMEOUT_MS = 8000;

// Agents de Securium-OS et script qui les fait tourner (scripts/start-all-agents.sh, et PM2 pour
// l'orchestrateur). Un bash.exe dont la ligne de commande contient ce script : l'agent est actif.
const AGENTS = [
  { name: "Orchestrateur", script: "sec-orchestrator.sh" },
  { name: "Market Simulator", script: "simulate-market.sh" },
  { name: "Lead Prospector", script: "run-prospector.sh" },
  { name: "CFO", script: "run-cfo.sh" },
  { name: "DevOps", script: "run-devops.sh" },
  { name: "SEO Architect", script: "run-seo.sh" },
];
// Agent des lignes qui ne précisent pas leur source, comme dans agent-dashboard.
const DEFAULT_AGENT = "Market Simulator";
const STATUSES: readonly string[] = ["active", "paused", "error"];
const BRACKET_PREFIX = /^\[([^[\]]{1,40})\]\s*(.*)$/;

// Les agents préfixent leur sortie par « [Nom] » : préfixe retiré quand il répète le nom de l'agent.
function event(agent: string, status: AgentEvent["status"], action: string): AgentEvent {
  const prefixed = BRACKET_PREFIX.exec(action);
  const text = prefixed?.[1] === agent ? prefixed[2] : action;
  return { agent, status, action: text.length > MAX_ACTION_LENGTH ? `${text.slice(0, MAX_ACTION_LENGTH)}…` : text };
}

// Mêmes formes que agent-dashboard : JSON {agent, status, action}, préfixe « [Nom] », texte brut.
function parseLogLine(line: string): AgentEvent | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "action" in parsed && typeof parsed.action === "string") {
      const record = parsed as { agent?: unknown; status?: unknown; action: string };
      const agent = typeof record.agent === "string" && record.agent ? record.agent : DEFAULT_AGENT;
      const status = typeof record.status === "string" && STATUSES.includes(record.status) ? record.status : "active";
      return event(agent, status as AgentEvent["status"], record.action);
    }
  } catch {
    // Pas du JSON : préfixe entre crochets, puis texte brut.
  }
  const prefixed = BRACKET_PREFIX.exec(text);
  if (prefixed) return prefixed[2] ? event(prefixed[1].trim(), "active", prefixed[2]) : null;
  return event(DEFAULT_AGENT, "active", text);
}

// Fin du journal seulement : il grossit sans rotation.
async function readLogTail() {
  const info = await stat(/*turbopackIgnore: true*/ LOG_PATH).catch(() => null);
  if (!info) return null;
  const start = Math.max(0, info.size - TAIL_BYTES);
  const handle = await open(/*turbopackIgnore: true*/ LOG_PATH, "r");
  try {
    const buffer = Buffer.alloc(info.size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    // Première ligne tronquée si la lecture commence en milieu de fichier ; dernier élément vide,
    // ou ligne en cours d'écriture.
    if (start > 0) lines.shift();
    lines.pop();
    return { events: lines.map(parseLogLine).filter((line) => line !== null), updatedAt: info.mtime };
  } finally {
    await handle.close();
  }
}

const execFileAsync = promisify(execFile);
const PS_COMMAND =
  "[Console]::OutputEncoding = [Text.Encoding]::UTF8; " +
  "Get-CimInstance Win32_Process -Filter 'Name = ''bash.exe''' | ForEach-Object { $_.CommandLine }";
let processCache: { at: number; lines: Promise<string[] | null> } | undefined;

// Lignes de commande des bash.exe du poste, en minuscules et barres obliques. PowerShell coûte
// environ 1,5 s : résultat gardé 5 s et partagé entre requêtes simultanées. null hors Windows.
function listBashCommandLines() {
  if (process.platform !== "win32") return Promise.resolve(null);
  const now = Date.now();
  if (processCache && now - processCache.at < PROCESS_TTL_MS) return processCache.lines;
  const lines = execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_COMMAND], {
    timeout: PROCESS_TIMEOUT_MS,
    windowsHide: true,
  })
    .then(({ stdout }) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase().replaceAll("\\", "/"))
        .filter(Boolean),
    )
    .catch((error: unknown) => {
      console.error("[telemetry] liste des processus indisponible :", error);
      return null;
    });
  processCache = { at: now, lines };
  return lines;
}

function agentStatus(script: string | undefined, last: AgentEvent | undefined, commandLines: string[] | null): AgentStatus {
  // Chemin MSYS (/c/…) ou Windows (C:/…) selon le lanceur : on compare la fin, commune aux deux.
  if (commandLines && script && commandLines.some((line) => line.includes(`securium-os/scripts/${script}`))) {
    return "running";
  }
  if (last?.status === "error") return "error";
  return commandLines && script ? "idle" : "unknown";
}

export async function GET() {
  const [tail, commandLines] = await Promise.all([
    readLogTail().catch((error: unknown) => {
      console.error("[telemetry] journal illisible :", error);
      return null;
    }),
    listBashCommandLines(),
  ]);
  const events = tail?.events ?? [];

  const lastByAgent = new Map<string, AgentEvent>();
  for (const line of events) lastByAgent.set(line.agent, line);
  // Agents connus d'abord, dans l'ordre de AGENTS, puis ceux qui n'apparaissent que dans le journal.
  const known = new Map(AGENTS.map((agent) => [agent.name, agent.script]));
  const names = [...known.keys(), ...[...lastByAgent.keys()].filter((name) => !known.has(name))];

  const agents: AgentTelemetry[] = names.map((name) => ({
    name,
    status: agentStatus(known.get(name), lastByAgent.get(name), commandLines),
    lastEvent: lastByAgent.get(name) ?? null,
  }));

  const body: TelemetryResponse = {
    logAvailable: tail !== null,
    logUpdatedAt: tail?.updatedAt.toISOString() ?? null,
    processesAvailable: commandLines !== null,
    agents,
    recent: events.slice(-RECENT_COUNT).reverse(),
    updatedAt: new Date().toISOString(),
  };
  return NextResponse.json(body);
}
