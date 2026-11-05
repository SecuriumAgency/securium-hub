import { type NextRequest } from "next/server";
import { disconnectOAuth } from "@/lib/social-oauth";

// Déconnexion TikTok (formulaire du tableau de bord). Réservé à la session admin (middleware).
export function POST(request: NextRequest) {
  return disconnectOAuth(request, "tiktok");
}
