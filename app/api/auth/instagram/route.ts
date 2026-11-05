import { type NextRequest } from "next/server";
import { beginOAuth } from "@/lib/social-oauth";

// Redirige vers le consentement Meta (Instagram). Réservé à la session admin (middleware).
export function GET(request: NextRequest) {
  return beginOAuth(request, "instagram");
}
