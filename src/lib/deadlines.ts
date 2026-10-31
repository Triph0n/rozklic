export type InstitutionCategory = 'urad' | 'banka' | 'pojistovna' | 'operator_eshop' | 'gdpr';

export interface DeadlineRule {
  id: InstitutionCategory;
  label: string;
  days: number;
  legalBasis: string;
  explanation: string;
}

export const DEADLINE_RULES: Record<InstitutionCategory, DeadlineRule> = {
  urad: {
    id: 'urad',
    label: 'Státní úřad / samospráva (správní řízení)',
    days: 15,
    legalBasis: '§ 83 odst. 1 zákona č. 500/2004 Sb., správní řád',
    explanation: 'Zákonná lhůta pro odvolání činí 15 dnů ode dne oznámení (doručení) rozhodnutí.',
  },
  banka: {
    id: 'banka',
    label: 'Banka / poskytovatel úvěru',
    days: 30,
    legalBasis: '§ 86 zákona č. 257/2016 Sb. + čl. 22 GDPR (lhůta pro vyřízení reklamace bankou)',
    explanation: 'U bankovního skóringu a zamítnutí žádosti je standardní reklamační a přezkumná lhůta 30 kalendářních dnů.',
  },
  pojistovna: {
    id: 'pojistovna',
    label: 'Pojišťovna (krácení nebo odmítnutí plnění)',
    days: 30,
    legalBasis: '§ 2798 občanského zákoníku + reklamační řád pojišťovny',
    explanation: 'Proti výši pojistného plnění nebo jeho zamítnutí doporučujeme podat písemnou námitku do 30 dnů od doručení.',
  },
  operator_eshop: {
    id: 'operator_eshop',
    label: 'E-shop / operátor / dodavatel energií',
    days: 30,
    legalBasis: '§ 19 odst. 3 zákona č. 634/1992 Sb., o ochraně spotřebitele',
    explanation: 'Reklamace včetně odstranění vady musí být vyřízena nejpozději do 30 dnů; při zamítnutí lze do 30 dnů podat nesouhlas s odůvodněním.',
  },
  gdpr: {
    id: 'gdpr',
    label: 'Správce osobních údajů / digitální platforma (GDPR)',
    days: 30,
    legalBasis: 'Čl. 12 odst. 3 a čl. 22 nařízení (EU) 2016/679 (GDPR)',
    explanation: 'Správce je povinen vyřídit žádost o vysvětlení automatizovaného rozhodnutí a lidský zásah bez zbytečného odkladu, nejpozději do 1 měsíce (30 dnů).',
  },
};

// Fixed Czech state holidays (month 1-12, day 1-31)
const FIXED_CZECH_HOLIDAYS: Record<string, string> = {
  '01-01': 'Nový rok / Den obnovy samostatného českého státu',
  '05-01': 'Svátek práce',
  '05-08': 'Den vítězství',
  '07-05': 'Den slovanských věrozvěstů Cyrila a Metoděje',
  '07-06': 'Den upálení mistra Jana Husa',
  '09-28': 'Den české státnosti',
  '10-28': 'Den vzniku samostatného československého státu',
  '11-17': 'Den boje za svobodu a demokracii',
  '12-24': 'Štědrý den',
  '12-25': '1. svátek vánoční',
  '12-26': '2. svátek vánoční',
};

// Anonymous Gregorian Easter calculation (Meeus/Jones/Butcher) in UTC
function getEasterSundayUTC(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function getCzechHolidayNameUTC(date: Date): string | null {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const key = `${m}-${d}`;
  if (FIXED_CZECH_HOLIDAYS[key]) {
    return FIXED_CZECH_HOLIDAYS[key];
  }
  const easter = getEasterSundayUTC(date.getUTCFullYear());
  const goodFriday = new Date(easter.getTime() - 2 * 86400000);
  const easterMonday = new Date(easter.getTime() + 1 * 86400000);

  if (
    date.getUTCMonth() === goodFriday.getUTCMonth() &&
    date.getUTCDate() === goodFriday.getUTCDate()
  ) {
    return 'Velký pátek';
  }
  if (
    date.getUTCMonth() === easterMonday.getUTCMonth() &&
    date.getUTCDate() === easterMonday.getUTCDate()
  ) {
    return 'Velikonoční pondělí';
  }
  return null;
}

export interface ComputedDeadline {
  deliveredISO: string;
  deliveredFormatted: string;
  rawDeadlineISO: string;
  finalDeadlineISO: string;
  finalDeadlineFormatted: string;
  daysRemaining: number;
  status: 'open' | 'last' | 'over';
  shifted: boolean;
  shiftReasons: string[];
  rule: DeadlineRule;
}

export function computeDeadline(
  deliveredISO: string,
  category: InstitutionCategory,
  referenceNow?: Date
): ComputedDeadline | null {
  if (!deliveredISO || !/^\d{4}-\d{2}-\d{2}$/.test(deliveredISO)) {
    return null;
  }

  const rule = DEADLINE_RULES[category] || DEADLINE_RULES.urad;
  const [y, m, d] = deliveredISO.split('-').map(Number);
  const deliveredUTC = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(deliveredUTC.getTime())) return null;

  const rawEndUTC = new Date(deliveredUTC.getTime() + rule.days * 86400000);
  let cursorUTC = new Date(rawEndUTC.getTime());
  const shiftReasons: string[] = [];

  // Shift forward while cursor falls on Saturday (6), Sunday (0), or a Czech public holiday
  while (true) {
    const dow = cursorUTC.getUTCDay();
    const holidayName = getCzechHolidayNameUTC(cursorUTC);
    if (dow === 6) {
      shiftReasons.push('sobota');
      cursorUTC = new Date(cursorUTC.getTime() + 86400000);
    } else if (dow === 0) {
      shiftReasons.push('neděle');
      cursorUTC = new Date(cursorUTC.getTime() + 86400000);
    } else if (holidayName) {
      shiftReasons.push(`státní svátek (${holidayName})`);
      cursorUTC = new Date(cursorUTC.getTime() + 86400000);
    } else {
      break;
    }
  }

  const now = referenceNow || new Date();
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const diffDays = Math.round((cursorUTC.getTime() - todayUTC.getTime()) / 86400000);

  const status: 'open' | 'last' | 'over' =
    diffDays > 0 ? 'open' : diffDays === 0 ? 'last' : 'over';

  const czFormatter = new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const toISODate = (dt: Date) => dt.toISOString().slice(0, 10);

  return {
    deliveredISO,
    deliveredFormatted: czFormatter.format(deliveredUTC),
    rawDeadlineISO: toISODate(rawEndUTC),
    finalDeadlineISO: toISODate(cursorUTC),
    finalDeadlineFormatted: czFormatter.format(cursorUTC),
    daysRemaining: diffDays,
    status,
    shifted: shiftReasons.length > 0,
    shiftReasons,
    rule,
  };
}
