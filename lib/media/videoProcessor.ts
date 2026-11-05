// Pipeline des rushs : découpage FFmpeg, mise au format 9:16, et points d'accroche pour une IA vidéo externe.
// S'exécute sur un poste qui a FFmpeg (pas sur Vercel). FFmpeg est lancé sans shell, avec des arguments en tableau.
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { validateUpload } from "./upload-rules";

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
// Recadrage centré sur la hauteur, puis mise à l'échelle au format vertical 1080 × 1920.
export const VERTICAL_FILTER = `crop=ih*9/16:ih,scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:flags=lanczos,setsar=1`;

export type Segment = { startSec: number; durationSec: number };

/** Découpe une durée en segments de `maxSegmentSec` au plus, le dernier pouvant être plus court. */
export function segmentPlan(totalSec: number, maxSegmentSec: number): Segment[] {
  if (!(totalSec > 0) || !(maxSegmentSec > 0)) return [];
  const segments: Segment[] = [];
  for (let start = 0; start < totalSec; start += maxSegmentSec) {
    segments.push({ startSec: start, durationSec: Math.min(maxSegmentSec, totalSec - start) });
  }
  return segments;
}

/** Arguments FFmpeg d'un segment (ou de la vidéo entière si `segment` est absent). Aucun shell n'interprète ces valeurs. */
export function buildFfmpegArgs(input: string, output: string, segment?: Segment): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  if (segment) args.push("-ss", segment.startSec.toFixed(3));
  args.push("-i", input);
  if (segment) args.push("-t", segment.durationSec.toFixed(3));
  args.push(
    "-vf", VERTICAL_FILTER,
    "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    output,
  );
  return args;
}

export type ExecFn = (file: string, args: string[]) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);
const defaultExec: ExecFn = (file, args) => execFileAsync(file, args, { maxBuffer: 1024 * 1024 });

/**
 * Point d'accroche vers une IA de génération ou de retouche vidéo. Aucun fournisseur n'est branché par défaut :
 * l'appelant fournit une implémentation (par exemple un appel à une API de génération vidéo).
 */
export interface VideoAiProvider {
  readonly name: string;
  enhance(inputPath: string, options: { prompt: string }): Promise<string>;
}

export type VideoProcessorOptions = {
  /** Dossier de dépôt : tout fichier traité doit s'y trouver. */
  uploadDir: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  aiProvider?: VideoAiProvider | null;
  exec?: ExecFn;
};

export class VideoProcessor {
  private readonly exec: ExecFn;

  constructor(private readonly options: VideoProcessorOptions) {
    this.exec = options.exec ?? defaultExec;
  }

  /** Chemin absolu d'un rush déposé. Refuse tout nom qui sort du dossier de dépôt. */
  resolveInput(fileName: string, size: number): string {
    const check = validateUpload({ name: fileName, size });
    if (!check.ok) throw new Error(check.error);
    const root = path.resolve(this.options.uploadDir);
    const resolved = path.resolve(root, path.basename(fileName));
    if (!resolved.startsWith(root + path.sep)) throw new Error("Chemin hors du dossier de dépôt.");
    return resolved;
  }

  /** Durée de la vidéo en secondes, lue par ffprobe. */
  async probeDuration(input: string): Promise<number> {
    const { stdout } = await this.exec(this.options.ffprobePath ?? "ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", input,
    ]);
    const seconds = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Durée de la vidéo illisible.");
    return seconds;
  }

  /** Découpe le rush en segments verticaux 9:16. Retourne les fichiers produits, dans l'ordre. */
  async toVertical(input: string, outDir: string, maxSegmentSec = 60): Promise<string[]> {
    const duration = await this.probeDuration(input);
    const stem = path.parse(input).name;
    const plans = segmentPlan(duration, maxSegmentSec);
    const outputs: string[] = [];
    const ffmpeg = this.options.ffmpegPath ?? "ffmpeg";
    for (const [index, segment] of plans.entries()) {
      const output = path.join(outDir, `${stem}-${String(index + 1).padStart(2, "0")}.mp4`);
      await this.exec(ffmpeg, buildFfmpegArgs(input, output, segment));
      outputs.push(output);
    }
    return outputs;
  }

  /** Passe la vidéo à l'IA externe branchée. Erreur explicite si aucune n'est branchée. */
  async enhance(input: string, prompt: string): Promise<string> {
    const provider = this.options.aiProvider;
    if (!provider) throw new Error("Aucun fournisseur IA vidéo branché.");
    return provider.enhance(input, { prompt });
  }
}
