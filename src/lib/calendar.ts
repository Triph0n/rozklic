import { ComputedDeadline } from './deadlines';

function toCompactDate(isoDate: string, addDays = 0): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + addDays));
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildGoogleCalendarUrl(params: {
  deadline: ComputedDeadline;
  institutionName: string;
  caseReference?: string;
}): string {
  const { deadline, institutionName, caseReference } = params;
  const start = toCompactDate(deadline.finalDeadlineISO, 0);
  const end = toCompactDate(deadline.finalDeadlineISO, 1);

  const title = `Poslední den lhůty: Odvolání / přezkum (${institutionName || deadline.rule.label})`;
  const detailsLines = [
    `Instituce: ${institutionName || deadline.rule.label}`,
    caseReference ? `Číslo jednací / smlouvy: ${caseReference}` : '',
    `Datum doručení rozhodnutí: ${deadline.deliveredFormatted}`,
    `Konec lhůty: ${deadline.finalDeadlineFormatted}`,
    `Právní opora: ${deadline.rule.legalBasis}`,
    deadline.shifted
      ? `Poznámka k posunu lhůty: Konec lhůty byl posunut na nejbližší pracovní den (${deadline.shiftReasons.join(', ')}).`
      : '',
    '',
    'Vygenerováno v nástroji Překladač rozhodnutí (deterministický výpočet lhůty).',
  ].filter(Boolean);

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${start}/${end}`);
  url.searchParams.set('details', detailsLines.join('\n'));
  return url.toString();
}

export function buildIcsFileContent(params: {
  deadline: ComputedDeadline;
  institutionName: string;
  caseReference?: string;
}): string {
  const { deadline, institutionName, caseReference } = params;
  const dtStart = toCompactDate(deadline.finalDeadlineISO, 0);
  const dtEnd = toCompactDate(deadline.finalDeadlineISO, 1);
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const summary = `Poslední den lhůty: Odvolání — ${institutionName || deadline.rule.label}`;
  const description = [
    `Instituce: ${institutionName || deadline.rule.label}`,
    caseReference ? `Číslo jednací / smlouvy: ${caseReference}` : '',
    `Doručeno: ${deadline.deliveredFormatted}`,
    `Poslední den lhůty: ${deadline.finalDeadlineFormatted}`,
    `Právní opora: ${deadline.rule.legalBasis}`,
  ]
    .filter(Boolean)
    .join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prekladac Rozhodnuti//CZ',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:lhuta-${dtStart}-${Date.now()}@prekladacrozhodnuti.cz`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-P3D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Za 3 dny končí lhůta pro podání odvolání',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Zítra končí lhůta pro podání odvolání',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}
