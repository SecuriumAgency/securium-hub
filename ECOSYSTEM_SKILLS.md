# Inventaire des skills et outils de l'écosystème

Établi le 30 octobre 2026, par lecture de `~/.claude/skills`, de `Securium-OS/scripts/` et de `Securium-OS/scripts/skills-index.json`. Les skills sont des instructions pour Claude Code, pas du code exécuté par le Hub.

## 1. Skills installés pour Claude Code

Dossier `C:\Users\Utilisateur\.claude\skills` : 82 entrées. Familles principales :

| Famille | Exemples | Nombre |
|---|---|---|
| Fondateur (`founder-*`) | `founder-board`, `founder-cfo`, `founder-consumer`, `founder-pricing`, `founder-plan` | 11 |
| Ingénierie (addy/agent-skills) | `test-driven-development`, `code-review-and-quality`, `security-and-hardening`, `source-driven-development` | 25 |
| Marketing (`market-*`) | `market-seo`, `market-ads`, `market-emails`, `market-funnel`, `market-landing` | 15 |
| Ventes (`sales-*`) | `sales-prospect`, `sales-outreach`, `sales-qualify`, `sales-proposal` | 14 |
| Agence (`agency-*`) | `agency-onboard`, `agency-pipeline`, `agency-propose`, `agency-report-pdf` | 9 |
| Design | `design`, `design-system`, `ui-styling`, `banner-design`, `brand` | 5 |
| Autres | `api-and-interface-design`, `ci-cd-and-automation`, `performance-optimization`… | le reste |

Le fichier `skills-index.json` annonce 11 skills fondateurs et 25 skills d'ingénierie, soit 36 entrées, et indique son origine : deux dépôts sous licence MIT, épinglés à un commit.

## 2. Skills et outils déclarés dans Securium-OS

Source : `Securium-OS/scripts/skills-index.json`.

### Commandes de simulation

| Commande | Skill | Usage |
|---|---|---|
| `/simulate-clients` | `founder-consumer` | Panel de 100 acheteurs (20 avec `--quick`) face à un même pitch |
| `/cfo-audit` | `founder-cfo` | Marge réelle, seuil de rentabilité, année 1 mois par mois |
| `/board-review` | `founder-board` | Trois sous-agents (Hormozi, Thiel, Jobs) notent l'idée et votent |
| `/pricing-test` | `founder-pricing` | Fourchette de prix (Van Westendorp) à partir du panel |
| `/offer-retest` | `founder-offer` | Construit une offre qui répond aux objections, puis la reteste |

### Outils

| Outil | Dépôt | Portée | Rôle |
|---|---|---|---|
| ponytail | DietrichGebert/ponytail | Par projet, via `setup-repo-optimization.sh` | Optimisation de dépôt ; `SKILL.md` vendorisé dans `scripts/assets/ponytail/` |
| graphify | Graphify-Labs/graphify | Par projet, via `setup-repo-optimization.sh` | Graphe de code (`graphify extract`, `cluster-only`) |
| omniroute | diegosouzapw/OmniRoute | `omniroute-fallback.sh`, port 20128 | Relais de modèles en secours |

## 3. Scripts utilitaires du poste

| Script | Rôle |
|---|---|
| `setup-repo-optimization.sh` | Installe ponytail et graphify dans un dépôt |
| `verify.js` | Vérifications du poste |
| `improve-system.py` | Analyse des sessions pour améliorer le système (lit l'historique, ne lit pas les `.env`) |
| `evening-review.sh`, `morning-dashboard.sh` | Bilan du soir et tableau du matin |
| `generate-pdfs.sh` | Rapports PDF des agents |
| `autofix-dependabot.sh` | Correction automatique Dependabot, désactivée par défaut |
| `simulate-market.sh` | Simulation de marché (agent Market Simulator) |
| `start-all-agents.sh` | Lance les cinq agents, décrits dans `AGENTS_REGISTRY.md` |

## 4. Prompts des agents

Les prompts sont dans les scripts `run-*.sh`. Ils sont fixes, sauf le texte Discord inséré entre marqueurs (`<<<DISCORD_…>>>`), traité comme donnée.

- `run-seo.sh` : SEO Architect, recommandation Core Web Vitals, sans modification de fichier.
- `run-devops.sh` : DevOps, rapport de santé, commandes npm autorisées par liste.
- `run-cfo.sh` : CFO.
- `run-prospector.sh` : Lead Prospector, stratégie B2B en un paragraphe.

## 5. Points d'attention

- `skills-index.json` annonce 36 entrées ; les compteurs en tête du fichier (11 et 25) concordent avec les entrées listées.
- `skills-index.json` indique que les skills s'installent dans `~/.claude/skills` (`install_dir`) ; c'est la même source que la liste de la section 1.
- Aucun skill n'est un agent autonome. Les agents sont décrits dans `AGENTS_REGISTRY.md`.
