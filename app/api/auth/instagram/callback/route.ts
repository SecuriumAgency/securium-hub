import { type NextRequest } from "next/server";
import { completeOAuth } from "@/lib/social-oauth";

// Retour de Meta : échange le code contre un jeton, le chiffre et l'enregistre.
export function GET(request: NextRequest) {
  return completeOAuth(request, "instagram");
}
