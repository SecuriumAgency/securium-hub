// Télécharge une HDRI Polyhaven (licence CC0) en 1k et la place dans public/models/env/city.hdr, le fichier
// lu par HubScene. Usage : node scripts/fetch-hub-env.mjs            (potsdamer_platz par défaut)
//                          node scripts/fetch-hub-env.mjs <slug>     (une autre HDRI Polyhaven)
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2] ?? "potsdamer_platz";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "public", "models", "env", "city.hdr");

const metadata = await (await fetch(`https://api.polyhaven.com/files/${slug}`)).json();
const url = metadata?.hdri?.["1k"]?.hdr?.url;
if (!url) throw new Error(`Pas de HDRI 1k au format .hdr pour « ${slug} ».`);

const response = await fetch(url);
if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}) : ${url}`);
const bytes = Buffer.from(await response.arrayBuffer());

// Écriture dans un fichier temporaire puis renommage : un téléchargement interrompu ne laisse pas de HDRI corrompue.
await mkdir(path.dirname(target), { recursive: true });
const partial = `${target}.part`;
await writeFile(partial, bytes);
await rename(partial, target);

console.log(`${slug} (1k, CC0) → ${path.relative(root, target)} (${(bytes.length / 1048576).toFixed(2)} Mo)`);
