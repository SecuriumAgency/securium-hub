import type { TokenSet } from "@/lib/agents/iafluencer";
import type { SocialPlatform } from "@/lib/agents/iafluencer-rules";
import { encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

// Propriétaire des comptes : l'administrateur unique du Hub (il n'existe pas encore de modèle utilisateur).
export const ADMIN_OWNER_ID = "admin";

/** Enregistre (ou remplace) le compte relié à une plateforme. Les jetons sont chiffrés avant écriture. */
export async function saveSocialAccount(platform: SocialPlatform, tokens: TokenSet): Promise<void> {
  const data = {
    accessToken: encryptSecret(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    expiresAt: tokens.expiresInSec ? new Date(Date.now() + tokens.expiresInSec * 1000) : null,
  };
  await prisma.socialAccount.upsert({
    where: { ownerId_platform: { ownerId: ADMIN_OWNER_ID, platform } },
    create: { ownerId: ADMIN_OWNER_ID, platform, ...data },
    update: data,
  });
}

/** Plateformes pour lesquelles un compte est relié. Ne lit jamais les jetons. */
export async function connectedPlatforms(): Promise<Set<SocialPlatform>> {
  const rows = await prisma.socialAccount.findMany({
    where: { ownerId: ADMIN_OWNER_ID },
    select: { platform: true },
  });
  return new Set(rows.map((row) => row.platform as SocialPlatform));
}
