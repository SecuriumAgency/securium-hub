import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/admin-session";
import { callModule, moduleFailure, moduleUrl, notConfigured, NO_STORE, unauthorized, ModuleFailure } from "@/lib/integrations/bridge";

// Pont vers Cal.com : les réservations à venir. Lecture seule : la prise de rendez-vous reste dans Cal.com.
export const dynamic = "force-dynamic";

// Version de l'API des réservations (en-tête cal-api-version). À vérifier contre la version de Cal.com déployée.
const BOOKINGS_API_VERSION = "2024-08-13";

const bookingsResponse = z.object({
  data: z.array(
    z.object({
      uid: z.string(),
      title: z.string(),
      start: z.string(),
      end: z.string(),
      status: z.string(),
    }),
  ),
});

export async function GET() {
  if (!(await hasAdminSession())) return unauthorized();

  const url = moduleUrl("CALCOM");
  const apiKey = process.env.CALCOM_API_KEY;
  if (!url || !apiKey) return notConfigured("Cal.com", ["CALCOM_URL", "CALCOM_API_KEY"]);

  try {
    const upstream = await callModule("Cal.com", `${url}/v2/bookings?status=upcoming`, {
      headers: { Authorization: `Bearer ${apiKey}`, "cal-api-version": BOOKINGS_API_VERSION, Accept: "application/json" },
    });
    const parsed = bookingsResponse.safeParse(await upstream.json());
    if (!parsed.success) throw new ModuleFailure("Cal.com a renvoyé une réponse inattendue.");

    return NextResponse.json({ bookings: parsed.data.data }, { headers: NO_STORE });
  } catch (error) {
    return moduleFailure(error);
  }
}
