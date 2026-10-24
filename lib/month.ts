const TIME_ZONE = "Europe/Paris";

function partsInTimeZone(date: Date, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, ...options }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

// Minuit, heure de Paris, du jour donné. Le décalage (+1 h ou +2 h) est lu à minuit UTC de ce jour :
// aucun changement d'heure (vers 1 h UTC) ne tombe entre cet instant et minuit heure de Paris.
function parisMidnight(year: number, month: number, day: number) {
  const midnightUtc = Date.UTC(year, month - 1, day);
  const { timeZoneName } = partsInTimeZone(new Date(midnightUtc), { timeZoneName: "longOffset" });
  const [, sign, hours, minutes] = /GMT([+-])(\d{2}):(\d{2})/.exec(timeZoneName) ?? [];
  const offsetMs = sign ? (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000 : 0;
  return new Date(midnightUtc - offsetMs);
}

// Minuit du 1er du mois de `now`, heure de Paris.
export function startOfMonth(now: Date) {
  const { year, month } = partsInTimeZone(now, { year: "numeric", month: "numeric" });
  return parisMidnight(Number(year), Number(month), 1);
}

// Minuit du jour de `now`, heure de Paris.
export function startOfDay(now: Date) {
  const { year, month, day } = partsInTimeZone(now, { year: "numeric", month: "numeric", day: "numeric" });
  return parisMidnight(Number(year), Number(month), Number(day));
}
