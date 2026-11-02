// Nœud IA local : une API compatible Stable Diffusion WebUI (POST /sdapi/v1/txt2img) au-dessus de sd-cli.
// Le Hub l'appelle depuis son serveur (LOCAL_IMAGE_GEN_URL, lib/integrations/local-image-ai.ts).
// Écoute uniquement sur 127.0.0.1 et traite une génération à la fois : un seul GPU, et sd-cli charge
// le modèle entier à chaque appel.
// Lancement : node scripts/local-image-node.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.LOCAL_IMAGE_NODE_PORT ?? 7860);
const APP_DATA = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
const LOCAL_AI = path.join(APP_DATA, "open-generative-ai", "local-ai");
const BIN_DIR = process.env.SD_BIN_DIR ?? path.join(LOCAL_AI, "bin");
const SD_CLI = path.join(BIN_DIR, "sd-cli.exe");
const MODEL = process.env.SD_MODEL_PATH ?? path.join(LOCAL_AI, "models", "DreamShaper_8_pruned.safetensors");
const ENGINE_TIMEOUT_MS = 180_000;
const MAX_BODY_BYTES = 16_384;
const MAX_PROMPT = 1_000;

// Valeurs acceptées pour les dimensions : multiples de 64, entre 256 et 1024 pixels.
function readOptions(data) {
  const size = (value) => (Number.isInteger(value) && value % 64 === 0 && value >= 256 && value <= 1024 ? value : 512);
  const steps = Number.isInteger(data.steps) && data.steps >= 1 && data.steps <= 60 ? data.steps : 25;
  return {
    width: size(data.width),
    height: size(data.height),
    steps,
    cfgScale: 7.5,
    sampler: "euler_a",
    seed: Math.floor(Math.random() * 2 ** 31),
  };
}

function runEngine(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(SD_CLI, args, { cwd: BIN_DIR, windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => child.kill(), ENGINE_TIMEOUT_MS);
    child.stdout.resume();
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-1_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`sd-cli a renvoyé le code ${code}. ${stderr.trim().slice(-300)}`));
    });
  });
}

async function generateImage(prompt, options) {
  const dir = await mkdtemp(path.join(tmpdir(), "securium-sd-"));
  const out = path.join(dir, "image.png");
  try {
    await runEngine([
      "-m", MODEL,
      "-p", prompt,
      "-o", out,
      "--steps", String(options.steps),
      "-W", String(options.width),
      "-H", String(options.height),
      "--cfg-scale", String(options.cfgScale),
      "--seed", String(options.seed),
      "--sampling-method", options.sampler,
    ]);
    return (await readFile(out)).toString("base64");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// File d'attente : une génération après l'autre, même si plusieurs requêtes arrivent en même temps.
let chain = Promise.resolve();
function enqueue(task) {
  const result = chain.then(task);
  chain = result.catch(() => undefined);
  return result;
}

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Requête trop volumineuse."), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

if (!existsSync(SD_CLI)) {
  console.error(`Moteur introuvable : ${SD_CLI}. Installez sd.cpp dans l'application, ou définissez SD_BIN_DIR.`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/sdapi/v1/txt2img") {
    send(res, 404, { error: "Introuvable." });
    return;
  }
  try {
    const data = JSON.parse(await readBody(req));
    const prompt = typeof data.prompt === "string" ? data.prompt.trim() : "";
    if (!prompt || prompt.length > MAX_PROMPT) {
      send(res, 422, { error: "Prompt absent ou trop long." });
      return;
    }
    const options = readOptions(data);
    const image = await enqueue(() => generateImage(prompt, options));
    send(res, 200, { images: [image] });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : (error.status ?? 500);
    send(res, status, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Nœud IA local prêt sur http://127.0.0.1:${PORT} (moteur : ${SD_CLI}, modèle : ${MODEL})`);
});
