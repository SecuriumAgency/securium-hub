// Créneaux d'activité des agents sortants (prospection) : jamais le week-end, à l'heure de Paris,
// et éventuellement dans une plage horaire. L'heure locale du serveur ne compte pas (Vercel tourne en UTC) ;
// Intl applique le fuseau, changements d'heure compris.
// Aucun import : les scripts .mts, exécutés par Node sans bundler, l'utilisent tel quel.

const TIME_ZONE = "Europe/Paris";
// Jour de la semaine comme Date.getDay() : 0 = dimanche, 6 = samedi.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKEND = new Set([0, 6]);

const parisFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Plage horaire en heures pleines, fin exclue : { start: 9, end: 18 } couvre 9h00 à 17h59.
export type WorkingHours = { start: number; end: number };

export const OFFICE_HOURS: WorkingHours = { start: 9, end: 18 };

// Jour (0 à 6) et minute de la journée à Paris.
export function parisClock(now: Date) {
  const parts = Object.fromEntries(parisFormat.formatToParts(now).map((part) => [part.type, part.value]));
  return { day: WEEKDAYS.indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// false le samedi et le dimanche à Paris ; avec `hours`, aussi en dehors de la plage horaire.
export function isWorkingTime(now: Date = new Date(), hours?: WorkingHours) {
  const { day, minutes } = parisClock(now);
  if (WEEKEND.has(day)) return false;
  return !hours || (minutes >= hours.start * 60 && minutes < hours.end * 60);
}
