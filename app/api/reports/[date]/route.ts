import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Context = { params: Promise<{ date: string }> };

// Le PDF d'un jour, derrière la session admin (middleware.ts). Le nom de fichier ne vient jamais de
// l'envoi : il est reconstruit à partir de la date, validée.
export async function GET(_request: Request, context: Context) {
  const { date } = await context.params;
  if (!DATE_PATTERN.test(date)) {
    return NextResponse.json({ error: "Date attendue au format AAAA-MM-JJ." }, { status: 400 });
  }

  const report = await prisma.dailyReport.findUnique({ where: { date }, select: { content: true } });
  if (!report) {
    return NextResponse.json({ error: "Aucun rapport pour ce jour." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(report.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rapport-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
