import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { AuditRefusedError, runAudit } from "@/lib/audit/run";

// Audit B2B d'un site de prospect. Réservé à l'admin : le middleware filtre déjà /api/*, et la route le revérifie.
// Méthode POST uniquement, corps JSON { "url": "https://…" } : l'URL cible n'apparaît ni dans la query string
// ni dans les journaux d'accès. Le serveur fait la requête (pas le navigateur) : pas de CORS en jeu.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const auditBody = z.object({ url: z.string().min(1).max(2048) });

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return NextResponse.json({ error: "Session admin requise." }, { status: 401 });

  const body = auditBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Champ url attendu." }, { status: 422 });

  try {
    const report = await runAudit(body.data.url);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuditRefusedError) return NextResponse.json({ error: error.message }, { status: 422 });
    // Détail technique dans les journaux serveur seulement, jamais dans la réponse.
    console.error("[audit] échec inattendu :", error instanceof Error ? error.name : "erreur inconnue");
    return NextResponse.json({ error: "L'audit a échoué." }, { status: 502 });
  }
}
