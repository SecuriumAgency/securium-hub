// Configuration PM2 des tâches planifiées du Hub, lancées sur le poste Securium.
// Usage : pm2 start ecosystem.config.js, puis pm2 save. Essai à blanc, sans envoi :
// pm2 start ecosystem.config.js --only securium-fleet-report --env dryrun
// Le .env n'est pas lu ici : le script charge lui-même .env.local et .env, pour que les secrets
// n'apparaissent ni dans `pm2 describe` ni dans la sauvegarde de `pm2 save`.
"use strict";

const ROOT = __dirname;
// Journaux à côté de ceux des agents : Securium-OS/logs. Chemins construits sans require() (règle
// no-require-imports du lint) ; PM2 accepte les barres obliques sous Windows.
const LOGS = `${ROOT}/../Securium-OS/logs`;

module.exports = {
  apps: [
    {
      name: "securium-fleet-report",
      // Node lancé directement, avec le chargeur tsx. Pas `script: "npx"` : sous Windows, PM2 fait
      // exécuter npx.cmd par Node comme du JavaScript (SyntaxError). Pas le .mts en script non plus :
      // le conteneur de PM2 le charge avec require() et refuse son await de premier niveau.
      script: process.execPath,
      interpreter: "none",
      args: ["--import", "tsx", "scripts/fleet-daily-report.mts"],
      cwd: ROOT,
      // `pm2 start` envoie un premier rapport tout de suite, puis le cron le relance chaque jour à 20h,
      // heure du poste (Paris).
      cron_restart: "0 20 * * *",
      autorestart: false,
      time: true,
      out_file: `${LOGS}/pm2-fleet-report-out.log`,
      error_file: `${LOGS}/pm2-fleet-report-err.log`,
      env_dryrun: { FLEET_REPORT_DRY_RUN: "1" },
    },
  ],
};
