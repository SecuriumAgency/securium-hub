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
// Démon léger de planification, commun au poste : Securium-OS/scripts/job-daemon.mjs.
const DAEMONS = `${ROOT}/../Securium-OS/scripts`;

module.exports = {
  apps: [
    {
      name: "securium-fleet-report",
      // Node lancé directement, avec le chargeur tsx. Pas `script: "npx"` : sous Windows, PM2 fait
      // exécuter npx.cmd par Node comme du JavaScript (SyntaxError). Pas le .mts en script non plus :
      // le conteneur de PM2 le charge avec require() et refuse son await de premier niveau.
      // Démon léger : le rapport part chaque soir à 20h00 (Paris), et jamais au démarrage.
      script: process.execPath,
      interpreter: "none",
      args: [
        `${DAEMONS}/job-daemon.mjs`,
        "--name=rapport-flotte",
        `--cwd=${ROOT}`,
        "--daily=20:00",
        "--",
        process.execPath,
        "--import",
        "tsx",
        "scripts/fleet-daily-report.mts",
      ],
      cwd: ROOT,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 60000,
      time: true,
      out_file: `${LOGS}/pm2-fleet-report-out.log`,
      error_file: `${LOGS}/pm2-fleet-report-err.log`,
      env_dryrun: { FLEET_REPORT_DRY_RUN: "1" },
    },
    {
      // Réception : lit la boîte IMAP toutes les 15 minutes (réponses et STOP). À démarrer une fois IMAP_USER et
      // IMAP_PASSWORD (ou EMAIL_USER / EMAIL_PASS) valides : sans cela, chaque passage échoue à l'authentification.
      name: "securium-inbound",
      // Démon léger, comme les autres tâches : « online » entre deux passages, jamais de passage au démarrage.
      script: process.execPath,
      interpreter: "none",
      args: [
        `${DAEMONS}/job-daemon.mjs`,
        "--name=reponses-entrantes",
        `--cwd=${ROOT}`,
        "--every=15",
        "--",
        process.execPath,
        "--import",
        "tsx",
        "scripts/agent-inbound.mts",
      ],
      cwd: ROOT,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 60000,
      time: true,
      out_file: `${LOGS}/pm2-inbound-out.log`,
      error_file: `${LOGS}/pm2-inbound-err.log`,
    },
    {
      // Accroches de premier contact : brouillons seulement, rien n'est envoyé. Le script ne rédige qu'en
      // semaine, de 9h à 18h (Paris) ; le cron d'une heure ne fait que l'appeler dans cette plage.
      name: "securium-icebreakers",
      // Démon léger : vérifie chaque heure, à la minute 0, de 9h à 18h, du lundi au vendredi (Paris).
      script: process.execPath,
      interpreter: "none",
      args: [
        `${DAEMONS}/job-daemon.mjs`,
        "--name=icebreakers",
        `--cwd=${ROOT}`,
        "--hourly=0",
        "--hours=9-18",
        "--weekdays=1-5",
        "--",
        process.execPath,
        "--import",
        "tsx",
        "scripts/agent-icebreakers.mts",
      ],
      cwd: ROOT,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 60000,
      time: true,
      out_file: `${LOGS}/pm2-icebreakers-out.log`,
      error_file: `${LOGS}/pm2-icebreakers-err.log`,
    },
    {
      // Synchronisation du registre du prospecteur vers le Hub : réimport sans doublon, puis purge des
      // désinscrits. Chaque passage écrit dans la base de production (voir scripts/migrate-outreach.mts).
      name: "securium-migrate-outreach",
      // Démon léger : la synchronisation part chaque jour à 7h30 (Paris), et jamais au démarrage.
      script: process.execPath,
      interpreter: "none",
      args: [
        `${DAEMONS}/job-daemon.mjs`,
        "--name=migration-registre",
        `--cwd=${ROOT}`,
        "--daily=07:30",
        "--",
        process.execPath,
        "--import",
        "tsx",
        "scripts/migrate-outreach.mts",
        "--send",
      ],
      cwd: ROOT,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 60000,
      time: true,
      out_file: `${LOGS}/pm2-migrate-outreach-out.log`,
      error_file: `${LOGS}/pm2-migrate-outreach-err.log`,
    },
  ],
};
