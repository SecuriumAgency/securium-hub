const TIME_ZONE = "Europe/Paris";

function partsInTimeZone(date: Date, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, ...options }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

// Minuit du 1er du mois de `now`, heure de Paris. Le décalage (+1 h ou +2 h) est lu au 1er à
// minuit UTC : aucun changement d'heure ne tombe entre cet instant et minuit heure de Paris.
export function startOfMonth(now: Date) {
  const { year, month } = partsInTimeZone(now, { year: "numeric", month: "numeric" });
  const firstUtc = Date.UTC(Number(year), Number(month) - 1, 1);
  const { timeZoneName } = partsInTimeZone(new Date(firstUtc), { timeZoneName: "longOffset" });
  const [, sign, hours, minutes] = /GMT([+-])(\d{2}):(\d{2})/.exec(timeZoneName) ?? [];
  const offsetMs = sign ? (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000 : 0;
  return new Date(firstUtc - offsetMs);
}
