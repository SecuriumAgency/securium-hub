import { type NextRequest } from "next/server";
import { refreshOAuth } from "@/lib/social-oauth";

// Rafraîchissement du jeton Instagram (menu du tableau de bord). Réservé à la session admin (middleware).
export function POST(request: NextRequest) {
  return refreshOAuth(request, "instagram");
}
