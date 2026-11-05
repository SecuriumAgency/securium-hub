// Règles de dépôt des rushs. Pur : utilisable par le navigateur (glisser-déposer) comme par le serveur.
export const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".mov"] as const;
export const MAX_RUSH_BYTES = 2 * 1024 ** 3;

export type UploadCheck = { ok: true } | { ok: false; error: string };

export function validateUpload(file: { name: string; size: number }): UploadCheck {
  const name = file.name.trim();
  // Un nom contenant un séparateur de dossier ne doit jamais servir de chemin.
  if (!name || /[\\/]/.test(name)) return { ok: false, error: "Nom de fichier invalide." };
  const lower = name.toLowerCase();
  if (!ACCEPTED_VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    return { ok: false, error: "Format non accepté : .mp4 ou .mov uniquement." };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "Fichier vide." };
  if (file.size > MAX_RUSH_BYTES) return { ok: false, error: "Fichier trop lourd : 2 Go maximum." };
  return { ok: true };
}
