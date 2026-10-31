import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Calendar as CalendarIcon,
  Check,
  Copy,
  Download,
  Upload,
  ArrowRight,
  Eye,
  Lock,
  ExternalLink,
  RefreshCw,
  FileText,
  KeyRound,
  Printer,
  Sparkles,
} from 'lucide-react';
import {
  InstitutionCategory,
  DEADLINE_RULES,
  computeDeadline,
  ComputedDeadline,
} from './lib/deadlines';
import { buildGoogleCalendarUrl, buildIcsFileContent } from './lib/calendar';
import { anonymizeCzechLetter, RedactionItem } from './lib/anonymizer';
import { SAMPLE_LETTERS, SampleLetter } from './lib/sample-letters';

type ActiveTab = 'uvod' | 'vysvetlit' | 'odvolani' | 'vzory';

interface ExplainFactor {
  title: string;
  explanation: string;
  certainty: 'v_textu' | 'odhad';
  exactQuote: string;
  downgradedByVerifier?: boolean;
}

interface ExplainRight {
  title: string;
  explanation: string;
  legalBasis: string;
}

interface ExplainResult {
  summary: string;
  caseReference: string;
  institutionName: string;
  statedReason: string;
  factors: ExplainFactor[];
  missingInfo: string[];
  rights: ExplainRight[];
  clarificationRequest: string;
  whatToolDoesNotKnow: string[];
  followUpQuestion: string;
}

interface ChecklistItem {
  item: string;
  status: 'obsazeno' | 'doplnit';
  reason: string;
}

interface AppealResult {
  documentTitle: string;
  letterText: string;
  checklist: ChecklistItem[];
  attachments: string[];
  warnings: string[];
  nextStep: string;
}

interface StatsSummary {
  count: number;
  avgBefore: number;
  avgAfter: number;
  avgDelta: number;
  usedRequestPct: number;
  createdAppealCount: number;
  byCategory: Record<InstitutionCategory, number>;
}

// Instant pre-verified demo result for the first sample letter (Banka) so users/jury can inspect the rich UI even before waiting for API
const INSTANT_DEMO_EXPLAIN: ExplainResult = {
  summary:
    'Banka zamítla vaši žádost o spotřebitelský úvěr na bydlení ve výši 2 400 000 Kč na základě automatizovaného skóringu. Konkrétní důvod zamítnutí však v dopise neuvedla a odkázala na obchodní tajemství.',
  caseReference: 'REG-2026-88412-UV',
  institutionName: 'Česká hypoteční a úvěrová banka, a.s.',
  statedReason:
    'Výsledný rizikový index žádosti vypočtený interním automatizovaným skóringovým modelem a dotazy do registrů BRKI a NRKI překročil interní limit banky.',
  factors: [
    {
      title: 'Rozhodnutí provedl automatizovaný skóringový model',
      explanation:
        'Dopis výslovně potvrzuje, že posouzení proběhlo pomocí automatizovaného modelu a dotazů do úvěrových registrů BRKI a NRKI. Pokud do rozhodnutí nezasáhl člověk, máte podle čl. 22 GDPR právo na lidský přezkum.',
      certainty: 'v_textu',
      exactQuote:
        'Posouzení Vaší úvěruschopnosti proběhlo v souladu s § 86 zákona č. 257/2016 Sb., o spotřebitelském úvěru, s využitím interního automatizovaného skóringového modelu banky a dotazů do úvěrových registrů BRKI a NRKI.',
    },
    {
      title: 'Konkrétní důvod zamítnutí banka odmítla sdělit s odkazem na obchodní tajemství',
      explanation:
        'Banka v dopise tvrdí, že váhy parametrů tvoří obchodní tajemství. Obchodní tajemství však podle čl. 15 GDPR neopravňuje banku zamlčet samotné vstupní údaje a hlavní důvod, proč jste limitem neprošli.',
      certainty: 'v_textu',
      exactQuote:
        'Konkrétní váhy jednotlivých parametrů skóringového modelu tvoří obchodní tajemství banky, a proto je nelze v tomto dopise blíže specifikovat.',
    },
    {
      title: 'Možný vliv staršího záznamu v registrech BRKI / NRKI nebo poměru splátky k příjmu',
      explanation:
        'V praxi bývá překročení rizikového indexu nejčastěji způsobeno buď neukončeným limitem kreditní karty/kontokorentu v registrech BRKI/NRKI, nebo překročením ukazatele DSTI (poměr splátek k čistému příjmu). V dopise to ale uvedeno není.',
      certainty: 'odhad',
      exactQuote: '',
    },
  ],
  missingInfo: [
    'Zda záznam v registrech BRKI / NRKI obsahoval negativní příznak, nebo zda šlo čistě o interní výpočet příjmů a výdajů.',
    'Zda žádost posoudil konkrétní pracovník banky, nebo byla zamítnuta výhradně automatem.',
    'Jaké konkrétní vstupní hodnoty příjmů a závazků systém do výpočtu zahrnul.',
  ],
  rights: [
    {
      title: 'Právo na lidský přezkum a vysvětlení logiky rozhodnutí',
      explanation:
        'Pokud bylo rozhodnutí založeno výhradně na automatizovaném zpracování, máte právo žádat zásah člověka, vyjádřit svůj názor a získat smysluplné vysvětlení.',
      legalBasis: 'Čl. 22 a čl. 15 odst. 1 písm. h) nařízení GDPR',
    },
    {
      title: 'Právo na bezplatné sdělení výsledku dotazu do úvěrové databáze',
      explanation:
        'Pokud zamítnutí vychází z vyhledávání v databázi (BRKI/NRKI), je poskytovatel povinen vás bezplatně informovat o tomto výsledku a o tom, z jaké databáze čerpal.',
      legalBasis: '§ 88 odst. 1 zákona č. 257/2016 Sb., o spotřebitelském úvěru',
    },
  ],
  clarificationRequest: `Česká hypoteční a úvěrová banka, a.s.
Odbor automatizovaného posuzování retailových rizik

Věc: Žádost o vysvětlení automatizovaného rozhodnutí a lidský přezkum žádosti č. REG-2026-88412-UV

Vážení,

dne 22. 10. 2026 mi bylo doručeno vyrozumění o zamítnutí mé žádosti o spotřebitelský úvěr č. REG-2026-88412-UV s odkazem na výsledek interního automatizovaného skóringového modelu a dotaz do registrů BRKI a NRKI.

V souladu s čl. 15 odst. 1 písm. h) a čl. 22 nařízení (EU) 2016/679 (GDPR) a § 88 zákona č. 257/2016 Sb., o spotřebitelském úvěru, Vás tímto žádám o:
1. Sdělení, zda zamítnutí vycházelo z konkrétního záznamu v databázích BRKI nebo NRKI, a poskytnutí výpisu údajů, které jste z těchto databází převzali.
2. Smysluplné vysvětlení, které konkrétní vstupní parametry mé žádosti (např. započtená výše příjmů, výdajů nebo existujících úvěrových rámců) vedly k překročení rizikového indexu. Nepožaduji vyzrazení vzorce obchodního tajemství, ale sdělení konkrétních důvodů týkajících se mé osoby.
3. Provedení přezkumu žádosti oprávněnou osobou (lidský zásah), které mohu doložit doplňující podklady.

Prosím o vyřízení této žádosti v zákonné lhůtě 30 dnů.

S pozdravem
[doplnit jméno a příjmení]
[doplnit doručovací adresu / datovou schránku]`,
  whatToolDoesNotKnow: [
    'Nástroj nevidí do interního skóringového vzorce banky ani do vašeho výpisu z registrů BRKI a NRKI.',
    'Nástroj nemůže vědět, jakou přesnou výši čistého příjmu a výdajů banka do své kalkulace započítala.',
    'Nástroj nezaručuje, že po lidském přezkumu banka úvěr schválí, protože na uzavření smlouvy není zákonný nárok.',
  ],
  followUpQuestion:
    'Máte v současnosti otevřenou kreditní kartu nebo povolené přečerpání účtu (kontokorent), které v registrech snižují vaši bonitu, i když je vůbec nečerpáte?',
};

// Bespoke SVG Graphic for each sample case category
function CaseCategoryArtwork({ category }: { category: InstitutionCategory }) {
  if (category === 'banka') {
    return (
      <svg viewBox="0 0 320 110" className="w-full h-28 bg-[#0D3B3E] rounded-md overflow-hidden" aria-hidden="true">
        <defs>
          <pattern id="grid-bank" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="320" height="110" fill="url(#grid-bank)" />
        <rect x="28" y="62" width="14" height="30" fill="rgba(255,255,255,0.2)" rx="2" />
        <rect x="48" y="46" width="14" height="46" fill="rgba(255,255,255,0.35)" rx="2" />
        <rect x="68" y="30" width="14" height="62" fill="#E6B86A" rx="2" />
        <rect x="88" y="54" width="14" height="38" fill="rgba(255,255,255,0.2)" rx="2" />
        <line x1="20" y1="42" x2="115" y2="42" stroke="#F87171" strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="245" cy="55" r="24" fill="none" stroke="#E6B86A" strokeWidth="2" />
        <circle cx="245" cy="55" r="8" fill="none" stroke="#E6B86A" strokeWidth="2" />
        <path d="M 165 55 L 221 55 M 180 55 L 180 68 M 194 55 L 194 64" stroke="#E6B86A" strokeWidth="2.5" strokeLinecap="round" />
        <text x="28" y="22" fill="rgba(255,255,255,0.65)" fontSize="9" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.5">
          ALGORITMICKÝ SKÓRING · § 86 ZSU
        </text>
      </svg>
    );
  }
  if (category === 'urad') {
    return (
      <svg viewBox="0 0 320 110" className="w-full h-28 bg-[#1E292B] rounded-md overflow-hidden" aria-hidden="true">
        <defs>
          <pattern id="grid-urad" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="320" height="110" fill="url(#grid-urad)" />
        <rect x="28" y="34" width="110" height="56" rx="3" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <line x1="40" y1="48" x2="110" y2="48" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
        <line x1="40" y1="60" x2="124" y2="60" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <line x1="40" y1="72" x2="92" y2="72" stroke="#E6B86A" strokeWidth="2" />
        <circle cx="242" cy="56" r="28" fill="none" stroke="#E6B86A" strokeWidth="1.75" strokeDasharray="4 2" />
        <circle cx="242" cy="56" r="21" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <text x="223" y="59" fill="#E6B86A" fontSize="10" fontFamily="IBM Plex Mono, monospace" fontWeight="600">
          15 DNŮ
        </text>
        <text x="28" y="22" fill="rgba(255,255,255,0.65)" fontSize="9" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.5">
          SPRÁVNÍ ŘÍZENÍ · § 81 A § 83 SŘ
        </text>
      </svg>
    );
  }
  if (category === 'pojistovna') {
    return (
      <svg viewBox="0 0 320 110" className="w-full h-28 bg-[#2C221E] rounded-md overflow-hidden" aria-hidden="true">
        <defs>
          <pattern id="grid-poj" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="320" height="110" fill="url(#grid-poj)" />
        <path d="M 32 76 L 76 38 L 120 76" fill="none" stroke="#E6B86A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="46" y="76" width="60" height="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <rect x="175" y="45" width="115" height="14" rx="2" fill="rgba(255,255,255,0.15)" />
        <rect x="175" y="45" width="46" height="14" rx="2" fill="#E6B86A" />
        <text x="175" y="78" fill="#FCA5A5" fontSize="11" fontFamily="IBM Plex Mono, monospace" fontWeight="600">
          KRÁCENÍ PLNĚNÍ −60 %
        </text>
        <text x="28" y="22" fill="rgba(255,255,255,0.65)" fontSize="9" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.5">
          LIKVIDACE ŠKODY · § 2798 OZ
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 320 110" className="w-full h-28 bg-[#1F2D24] rounded-md overflow-hidden" aria-hidden="true">
      <defs>
        <pattern id="grid-eshop" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="320" height="110" fill="url(#grid-eshop)" />
      <path d="M 242 30 L 270 42 L 270 64 C 270 79 257 90 242 95 C 227 90 214 79 214 64 L 214 42 Z" fill="none" stroke="#E6B86A" strokeWidth="2" />
      <path d="M 233 62 L 240 69 L 253 53" fill="none" stroke="#E6B86A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="28" y1="54" x2="165" y2="54" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <circle cx="55" cy="54" r="5" fill="#E6B86A" />
      <circle cx="125" cy="54" r="5" fill="#F87171" />
      <text x="28" y="78" fill="rgba(255,255,255,0.8)" fontSize="10" fontFamily="IBM Plex Mono, monospace">
        ZÁKONNÁ LHŮTA 30 DNŮ
      </text>
      <text x="28" y="22" fill="rgba(255,255,255,0.65)" fontSize="9" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.5">
        SPOTŘEBITELSKÁ REKLAMACE · § 19 ZOS
      </text>
    </svg>
  );
}

// Visual Day-by-Day Statutory Period Strip
function StatutoryDaysStrip({ deadline }: { deadline: ComputedDeadline }) {
  const [y, m, d] = deadline.deliveredISO.split('-').map(Number);
  const startUTC = new Date(Date.UTC(y, m - 1, d));
  const [fy, fm, fd] = deadline.finalDeadlineISO.split('-').map(Number);
  const finalUTC = new Date(Date.UTC(fy, fm - 1, fd));
  const totalSpanDays = Math.max(1, Math.round((finalUTC.getTime() - startUTC.getTime()) / 86400000));

  const nodes: Array<{
    dayIndex: number;
    label: string;
    type: 'start' | 'normal' | 'shifted' | 'final';
  }> = [];

  for (let i = 0; i <= totalSpanDays; i++) {
    const dt = new Date(startUTC.getTime() + i * 86400000);
    const dayNum = dt.getUTCDate();
    const monthNum = dt.getUTCMonth() + 1;
    let type: 'start' | 'normal' | 'shifted' | 'final' = 'normal';
    if (i === 0) type = 'start';
    else if (i === totalSpanDays) type = 'final';
    else if (i >= deadline.rule.days) type = 'shifted';
    nodes.push({
      dayIndex: i,
      label: `${dayNum}.${monthNum}.`,
      type,
    });
  }

  return (
    <div className="bg-white/95 border border-[#DCD5C7] rounded-lg p-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-[#57524A]">
        <span>Kalendářní průběh lhůty ({deadline.rule.days} dnů od doručení)</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-[#161412]" /> Doručení
          </span>
          {deadline.shifted && (
            <span className="inline-flex items-center gap-1 text-[#9A3412]">
              <span className="w-2 h-2 rounded-xs bg-[#9A3412]" /> Víkend / svátek
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[#0D3B3E] font-semibold">
            <span className="w-2 h-2 rounded-xs bg-[#0D3B3E]" /> Konec lhůty
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {nodes.map((n) => (
          <div
            key={n.dayIndex}
            className={`px-1.5 py-1 rounded text-[10px] font-mono-tabular border ${
              n.type === 'start'
                ? 'bg-[#161412] text-white border-[#161412] font-semibold'
                : n.type === 'final'
                ? 'bg-[#0D3B3E] text-[#E6B86A] border-[#0D3B3E] font-semibold ring-2 ring-[#0D3B3E]/25'
                : n.type === 'shifted'
                ? 'bg-[#FEF3C7] text-[#9A3412] border-[#9A3412]/40 line-through font-medium'
                : 'bg-[#FAF7F0] text-[#57524A] border-[#DCD5C7]'
            }`}
            title={
              n.type === 'start'
                ? 'Den doručení rozhodnutí'
                : n.type === 'final'
                ? 'Poslední den pro podání odvolání'
                : n.type === 'shifted'
                ? 'Víkend nebo státní svátek – lhůta se posouvá na nejbližší pracovní den'
                : `${n.dayIndex}. den lhůty`
            }
          >
            {n.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper to render formal letter text with highlighted [doplnit ...] tags
function renderFormattedFormalLetter(text: string) {
  const parts = text.split(/(\[doplnit[^\]]*\])/gi);
  return parts.map((part, i) => {
    if (/^\[doplnit[^\]]*\]$/i.test(part)) {
      return (
        <mark
          key={i}
          className="bg-[#FEF3C7] text-[#9A3412] px-1.5 py-0.5 rounded font-semibold border border-[#9A3412]/30"
        >
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('uvod');

  // Interactive Hero X-Ray mode toggle ("uredni" vs "rozklic")
  const [heroXrayMode, setHeroXrayMode] = useState<'rozklic' | 'uredni'>('rozklic');

  // Stats state
  const [stats, setStats] = useState<StatsSummary | null>(null);

  // Explain form state
  const [category, setCategory] = useState<InstitutionCategory>('banka');
  const [letterText, setLetterText] = useState<string>(SAMPLE_LETTERS[0].letterText);
  const [beforeScore, setBeforeScore] = useState<number | null>(2);
  const [autoAnonymize, setAutoAnonymize] = useState<boolean>(true);
  const [lastRedactions, setLastRedactions] = useState<RedactionItem[]>([]);
  const [explainStatus, setExplainStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('ready');
  const [explainError, setExplainError] = useState<string>('');
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(INSTANT_DEMO_EXPLAIN);
  const [selectedQuote, setSelectedQuote] = useState<string>(
    INSTANT_DEMO_EXPLAIN.factors[0].exactQuote
  );
  const [copiedRequest, setCopiedRequest] = useState<boolean>(false);
  const [afterScore, setAfterScore] = useState<number | null>(null);
  const [scoreRecorded, setScoreRecorded] = useState<boolean>(false);
  const [copiedSampleId, setCopiedSampleId] = useState<string>('');

  // OCR upload state
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Appeal form state
  const [appealCategory, setAppealCategory] = useState<InstitutionCategory>('urad');
  const [deliveredISO, setDeliveredISO] = useState<string>('2026-10-20');
  const [institutionName, setInstitutionName] = useState<string>('Městský úřad Kolín – odbor dopravy');
  const [caseReference, setCaseReference] = useState<string>('MUKO-2026/48102-OD');
  const [senderName, setSenderName] = useState<string>('');
  const [senderAddress, setSenderAddress] = useState<string>('');
  const [whatHappened, setWhatHappened] = useState<string>(
    'Úřad zamítl žádost o zápis změny vlastníka vozidla s odkazem na neúplnou přílohu, ačkoliv plná moc s úředně ověřeným podpisem byla přiložena k podání dne 12. 10. 2026. V odůvodnění chybí konkrétní uvedení, která náležitost plné moci údajně chyběla.'
  );
  const [whatRequested, setWhatRequested] = useState<string>(
    'Zrušení napadeného rozhodnutí, přezkoumání přiložené plné moci ve spisu a provedení zápisu změny vlastníka vozidla.'
  );
  const [appealStatus, setAppealStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [appealError, setAppealError] = useState<string>('');
  const [appealResult, setAppealResult] = useState<AppealResult | null>(null);
  const [copiedAppeal, setCopiedAppeal] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch((err) => console.error('Failed to load stats:', err));
  }, []);

  // Live preview of redactions on current letterText
  const previewAnonymization = anonymizeCzechLetter(letterText);

  const handleSelectSampleLetter = (sample: SampleLetter, switchToExplain = false) => {
    setCategory(sample.category);
    setLetterText(sample.letterText);
    setBeforeScore(2);
    if (sample.id === 'banka-hypoteka') {
      setExplainResult(INSTANT_DEMO_EXPLAIN);
      setExplainStatus('ready');
      setSelectedQuote(INSTANT_DEMO_EXPLAIN.factors[0].exactQuote);
    } else {
      setExplainResult(null);
      setExplainStatus('idle');
      setSelectedQuote('');
    }
    setExplainError('');
    setAfterScore(null);
    setScoreRecorded(false);
    if (switchToExplain) {
      setActiveTab('vysvetlit');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleApplyAnonymizerNow = () => {
    const res = anonymizeCzechLetter(letterText);
    setLetterText(res.sanitizedText);
    setLastRedactions(res.redactions);
  };

  const handleOcrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setExplainError('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const resultStr = String(reader.result || '');
        const base64Data = resultStr.split(',')[1] || '';
        const resp = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mimeType: file.type || 'image/jpeg',
            base64Data,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || 'Chyba při čtení snímku.');
        }
        setLetterText(data.text);
        setExplainResult(null);
        setExplainStatus('idle');
        setOcrLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setExplainError(err?.message || 'Nepodařilo se přečíst snímek dopisu.');
      setOcrLoading(false);
    }
  };

  const handleExplainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (letterText.trim().length < 40 || beforeScore === null) return;

    setExplainStatus('loading');
    setExplainError('');
    setExplainResult(null);
    setSelectedQuote('');
    setAfterScore(null);
    setScoreRecorded(false);

    let textToSend = letterText;
    if (autoAnonymize) {
      const anon = anonymizeCzechLetter(letterText);
      textToSend = anon.sanitizedText;
      setLastRedactions(anon.redactions);
    } else {
      setLastRedactions([]);
    }

    try {
      const resp = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          letterText: textToSend,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Nepodařilo se přeložit rozhodnutí.');
      }
      setExplainResult(data);
      setExplainStatus('ready');
      const firstQuoted = data.factors?.find((f: ExplainFactor) => f.exactQuote)?.exactQuote || '';
      setSelectedQuote(firstQuoted);
    } catch (err: any) {
      setExplainError(err?.message || 'Došlo k chybě při spojení se serverem.');
      setExplainStatus('error');
    }
  };

  const handleCopyClarification = async () => {
    if (!explainResult?.clarificationRequest) return;
    await navigator.clipboard.writeText(explainResult.clarificationRequest);
    setCopiedRequest(true);
    setTimeout(() => setCopiedRequest(false), 2500);
  };

  const handleRecordAfterScore = async (score: number) => {
    setAfterScore(score);
    if (scoreRecorded) return;
    setScoreRecorded(true);
    try {
      const resp = await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          beforeScore: beforeScore ?? 2,
          afterScore: score,
          usedRequest: copiedRequest,
          createdAppeal: false,
        }),
      });
      if (resp.ok) {
        const updated = await resp.json();
        setStats(updated);
      }
    } catch (err) {
      console.error('Stats record error:', err);
    }
  };

  const handleTransferToAppeal = () => {
    if (!explainResult) return;
    setAppealCategory(category);
    if (explainResult.institutionName) {
      setInstitutionName(explainResult.institutionName);
    }
    if (explainResult.caseReference) {
      setCaseReference(explainResult.caseReference);
    }
    const missingSummary =
      explainResult.missingInfo.length > 0
        ? `V doručeném rozhodnutí chybí tyto podstatné náležitosti: ${explainResult.missingInfo.join('; ')}.`
        : '';
    setWhatHappened(`${explainResult.summary} ${explainResult.statedReason} ${missingSummary}`.trim());
    setWhatRequested(
      'Žádám o lidský přezkum rozhodnutí, doložení konkrétních podkladů a parametrů, které vedly k zamítnutí, a o změnu či zrušení původního rozhodnutí.'
    );
    setActiveTab('odvolani');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const computedDeadline = computeDeadline(deliveredISO, appealCategory);

  const handleGenerateAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!computedDeadline || !institutionName.trim() || whatHappened.trim().length < 25) return;

    setAppealStatus('loading');
    setAppealError('');
    setAppealResult(null);

    try {
      const resp = await fetch('/api/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: computedDeadline.rule.label,
          institutionName,
          caseReference,
          deliveredDateFormatted: computedDeadline.deliveredFormatted,
          deadlineFormatted: computedDeadline.finalDeadlineFormatted,
          daysRemaining: computedDeadline.daysRemaining,
          deadlineStatus: computedDeadline.status,
          legalBasisRule: computedDeadline.rule.legalBasis,
          senderName,
          senderAddress,
          whatHappened,
          whatRequested,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Nepodařilo se sestavit odvolání.');
      }
      setAppealResult(data);
      setAppealStatus('ready');

      fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: appealCategory,
          beforeScore: beforeScore ?? 2,
          afterScore: afterScore ?? 4,
          usedRequest: true,
          createdAppeal: true,
        }),
      })
        .then((r) => r.json())
        .then((updated) => setStats(updated))
        .catch(() => {});
    } catch (err: any) {
      setAppealError(err?.message || 'Chyba při generování odvolání.');
      setAppealStatus('error');
    }
  };

  const handleCopyAppeal = async () => {
    if (!appealResult?.letterText) return;
    await navigator.clipboard.writeText(appealResult.letterText);
    setCopiedAppeal(true);
    setTimeout(() => setCopiedAppeal(false), 2500);
  };

  const handleDownloadAppealTxt = () => {
    if (!appealResult?.letterText) return;
    const blob = new Blob([appealResult.letterText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `odvolani-${caseReference ? caseReference.replace(/[^a-zA-Z0-9-_]/g, '_') : 'dokument'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadIcs = () => {
    if (!computedDeadline) return;
    const content = buildIcsFileContent({
      deadline: computedDeadline,
      institutionName,
      caseReference,
    });
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lhuta-odvolani-${computedDeadline.finalDeadlineISO}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderHighlightedSourceText = (source: string, quote: string) => {
    if (!quote || quote.trim().length < 8) {
      return <span>{source}</span>;
    }
    const cleanQuote = quote.trim();
    const idx = source.toLowerCase().indexOf(cleanQuote.toLowerCase());
    if (idx === -1) {
      const shortQ = cleanQuote.slice(0, 35).toLowerCase();
      const shortIdx = source.toLowerCase().indexOf(shortQ);
      if (shortIdx === -1) return <span>{source}</span>;
      const before = source.slice(0, shortIdx);
      const match = source.slice(shortIdx, shortIdx + cleanQuote.length);
      const after = source.slice(shortIdx + cleanQuote.length);
      return (
        <>
          {before}
          <mark className="bg-[#FEF3C7] text-[#161412] px-1 py-0.5 border-b-2 border-[#9A3412] font-medium">
            {match}
          </mark>
          {after}
        </>
      );
    }
    const before = source.slice(0, idx);
    const match = source.slice(idx, idx + cleanQuote.length);
    const after = source.slice(idx + cleanQuote.length);
    return (
      <>
        {before}
        <mark className="bg-[#FEF3C7] text-[#161412] px-1 py-0.5 border-b-2 border-[#9A3412] font-medium">
          {match}
        </mark>
        {after}
      </>
    );
  };

  const verifiedQuotesCount = explainResult
    ? explainResult.factors.filter((f) => f.certainty === 'v_textu').length
    : 0;
  const estimatedFactorsCount = explainResult
    ? explainResult.factors.filter((f) => f.certainty === 'odhad').length
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] text-[#161412]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#FAF7F0]/95 backdrop-blur-md border-b border-[#DCD5C7]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <button
            type="button"
            onClick={() => setActiveTab('uvod')}
            className="text-2xl font-bold tracking-tight text-[#0D3B3E] font-serif-display whitespace-nowrap shrink-0 text-left cursor-pointer"
          >
            ROZKLÍČ
          </button>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#57524A]">
            <button
              type="button"
              onClick={() => setActiveTab('uvod')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'uvod'
                  ? 'text-[#161412] border-b-2 border-[#0D3B3E] font-semibold'
                  : 'hover:text-[#161412]'
              }`}
            >
              Úvod
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vysvetlit')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'vysvetlit'
                  ? 'text-[#161412] border-b-2 border-[#0D3B3E] font-semibold'
                  : 'hover:text-[#161412]'
              }`}
            >
              Rozklíčovat dopis
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('odvolani')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'odvolani'
                  ? 'text-[#161412] border-b-2 border-[#0D3B3E] font-semibold'
                  : 'hover:text-[#161412]'
              }`}
            >
              Hlídač lhůt a odvolání
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vzory')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'vzory'
                  ? 'text-[#161412] border-b-2 border-[#0D3B3E] font-semibold'
                  : 'hover:text-[#161412]'
              }`}
            >
              Ukázkové dopisy
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('vysvetlit')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Vložit rozhodnutí
            </button>
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto px-6 py-2 border-t border-[#DCD5C7] text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('uvod')}
            className={`px-3 py-1.5 rounded whitespace-nowrap shrink-0 ${
              activeTab === 'uvod' ? 'bg-[#0D3B3E] text-white' : 'text-[#57524A]'
            }`}
          >
            Úvod
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vysvetlit')}
            className={`px-3 py-1.5 rounded whitespace-nowrap shrink-0 ${
              activeTab === 'vysvetlit' ? 'bg-[#0D3B3E] text-white' : 'text-[#57524A]'
            }`}
          >
            Rozklíčovat dopis
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('odvolani')}
            className={`px-3 py-1.5 rounded whitespace-nowrap shrink-0 ${
              activeTab === 'odvolani' ? 'bg-[#0D3B3E] text-white' : 'text-[#57524A]'
            }`}
          >
            Lhůty a odvolání
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vzory')}
            className={`px-3 py-1.5 rounded whitespace-nowrap shrink-0 ${
              activeTab === 'vzory' ? 'bg-[#0D3B3E] text-white' : 'text-[#57524A]'
            }`}
          >
            Ukázkové dopisy
          </button>
        </div>
      </header>

      <main className="flex-1">
        {/* =================================================================== */}
        {/* TAB 1: ÚVOD                                                         */}
        {/* =================================================================== */}
        {activeTab === 'uvod' && (
          <div className="space-y-16">
            {/* Editorial Grid Hero Section */}
            <section className="bg-editorial-grid border-b border-[#DCD5C7]">
              <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
                {/* Left 7 Cols: Editorial Lead */}
                <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
                  <div className="space-y-6">
                    <div className="text-xs uppercase tracking-widest text-[#0D3B3E] font-mono-tabular font-semibold">
                      ROZKLÍČ · Občanský překladač úředních a algoritmických verdiktů
                    </div>

                    <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-serif-display font-medium tracking-tight text-[#161412] leading-[1.08] [text-wrap:balance]">
                      Když o vás rozhodne algoritmus nebo úřad, uděláme vám v tom jasno.
                    </h1>

                    <p className="text-base lg:text-lg text-[#57524A] leading-relaxed max-w-2xl">
                      Přišlo vám zamítnutí hypotéky, krácení pojistky nebo nepřiznání dávky plné paragrafů a frází o „interním vyhodnocení rizik“?{' '}
                      <strong className="text-[#161412] font-semibold">ROZKLÍČ</strong> přímo v prohlížeči skryje vaše osobní údaje, přeloží dopis do lidské češtiny,{' '}
                      <strong className="text-[#161412] font-semibold">ověří každou citaci v textu</strong>, pohlídá lhůtu včetně českých svátků a sestaví odvolání.
                    </p>
                  </div>

                  <div className="space-y-6 pt-2">
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setActiveTab('vysvetlit')}
                        className="px-6 py-3.5 text-sm font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] transition-colors inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                      >
                        <KeyRound className="w-4 h-4 text-[#E6B86A]" aria-hidden="true" />
                        <span>Rozklíčovat zamítavý dopis</span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('odvolani')}
                        className="px-5 py-3.5 text-sm font-semibold text-[#161412] bg-white border border-[#DCD5C7] rounded-md hover:bg-[#F1ECE1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Spočítat lhůtu a sestavit odvolání
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('vzory')}
                        className="px-3 py-3.5 text-sm font-semibold text-[#0D3B3E] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        4 ukázkové dopisy →
                      </button>
                    </div>

                    {/* Architectural guarantees line */}
                    <div className="pt-4 border-t border-[#DCD5C7] flex flex-wrap items-center gap-y-2 text-xs text-[#57524A] font-mono-tabular">
                      <span>100% lokální anonymizace rodných čísel a účtů</span>
                      <span className="mx-3 text-[#DCD5C7]">·</span>
                      <span>Deterministická kontrola citací</span>
                      <span className="mx-3 text-[#DCD5C7]">·</span>
                      <span>Výpočet lhůt podle § 40 správního řádu</span>
                    </div>
                  </div>
                </div>

                {/* Right 5 Cols: Interactive Visual "Rentgen dokumentu" Sheet */}
                <div className="lg:col-span-5 flex flex-col justify-between bg-[#0D3B3E] text-white rounded-xl p-6 lg:p-7 document-sheet-shadow relative overflow-hidden">
                  {/* Top Interactive Mode Switcher */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-white/15">
                    <div>
                      <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-[#E6B86A]">
                        Interaktivní rentgen dopisu
                      </div>
                      <div className="text-sm font-medium text-white/90 mt-0.5">
                        Přepněte pohled na zamítavé rozhodnutí banky:
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-[#082729] p-1 rounded-md border border-white/10">
                      <button
                        type="button"
                        onClick={() => setHeroXrayMode('uredni')}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          heroXrayMode === 'uredni'
                            ? 'bg-[#E6B86A] text-[#161412] font-semibold'
                            : 'text-white/70 hover:text-white'
                        }`}
                      >
                        Úřední originál
                      </button>
                      <button
                        type="button"
                        onClick={() => setHeroXrayMode('rozklic')}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          heroXrayMode === 'rozklic'
                            ? 'bg-[#E6B86A] text-[#161412] font-semibold'
                            : 'text-white/70 hover:text-white'
                        }`}
                      >
                        Pohled ROZKLÍČ
                      </button>
                    </div>
                  </div>

                  {/* Simulated Physical Document Sheet */}
                  <div className="my-5 bg-[#FAF7F0] text-[#161412] rounded-lg p-5 border border-[#DCD5C7] space-y-4 font-mono-tabular text-xs relative">
                    <div className="flex items-center justify-between text-[11px] text-[#57524A] border-b border-[#DCD5C7] pb-2">
                      <span>Č. žádosti: REG-2026-88412-UV</span>
                      <span>21. 10. 2026</span>
                    </div>

                    {/* Line 1: Personal Data */}
                    <div className="space-y-1">
                      <div className="text-[11px] text-[#57524A]">Žadatel:</div>
                      {heroXrayMode === 'uredni' ? (
                        <div className="p-2 rounded bg-white border border-[#DCD5C7] text-[#161412]">
                          Jan Dvořák, r. č. 710418/1429, účet 19-4482010287/0100
                        </div>
                      ) : (
                        <div className="p-2 rounded bg-[#E3EFEF] border border-[#0D3B3E]/30 text-[#0D3B3E] font-semibold flex items-center justify-between">
                          <span>[JMÉNO SKRYTO] · [RODNÉ ČÍSLO SKRYTO] · [ÚČET SKRYT]</span>
                          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </div>
                      )}
                    </div>

                    {/* Line 2: Algorithmic Paragraph */}
                    <div className="space-y-1.5">
                      <div className="leading-relaxed text-[#161412] bg-white p-2.5 rounded border border-[#DCD5C7]">
                        „Posouzení proběhlo s využitím{' '}
                        <span className={heroXrayMode === 'rozklic' ? 'bg-[#FEF3C7] border-b-2 border-[#9A3412] font-semibold px-1' : ''}>
                          interního automatizovaného skóringového modelu banky
                        </span>
                        . Konkrétní váhy parametrů tvoří obchodní tajemství.“
                      </div>

                      {heroXrayMode === 'rozklic' && (
                        <div className="bg-white border border-[#0D3B3E] rounded p-3 space-y-2 font-sans">
                          <div className="text-[11px] font-mono-tabular text-[#0D3B3E] font-semibold">
                            ROZKLÍČOVÁNO · V TEXTU DOPISU (CITACE OVĚŘENA KÓDEM)
                          </div>
                          <p className="text-xs text-[#161412] leading-snug">
                            <strong>Co to lidsky znamená:</strong> Zamítl vás automat. Banka se schovává za obchodní tajemství, ale podle{' '}
                            <strong>čl. 22 GDPR</strong> máte právo žádat lidský přezkum a vysvětlení, který parametr rozhodl.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Action inside Card */}
                  <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/15 text-xs">
                    <span className="text-white/75 font-mono-tabular">
                      Lhůta pro přezkum: 30 dnů
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectSampleLetter(SAMPLE_LETTERS[0], true)}
                      className="text-[#E6B86A] font-semibold hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Otevřít celý tento případ</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Full-Width 4-Column Live Impact Metrics Strip with Visual Bars */}
            <section className="max-w-7xl mx-auto px-6">
              <div className="bg-white border border-[#DCD5C7] rounded-xl p-7 document-sheet-shadow space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DCD5C7] pb-5">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-[#0D3B3E] font-mono-tabular font-semibold">
                      Měření skutečného dopadu
                    </div>
                    <h2 className="text-2xl font-serif-display font-medium text-[#161412] mt-1">
                      Živá statistika porozumění (bez ukládání obsahu dopisů)
                    </h2>
                  </div>
                  <div className="text-xs font-mono-tabular text-[#57524A]">
                    Ukládáme pouze anonymní skóre 1–5 před a po vysvětlení
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-[#FAF7F0] border border-[#DCD5C7] rounded-lg p-5 flex flex-col justify-between">
                    <div className="text-xs text-[#57524A] uppercase tracking-wider font-mono-tabular">
                      Rozklíčovaných rozhodnutí
                    </div>
                    <div className="my-3 text-4xl font-serif-display font-semibold font-mono-tabular text-[#161412]">
                      {stats ? stats.count : '…'}
                    </div>
                    <div className="text-xs text-[#57524A]">
                      Banky, úřady, pojišťovny a reklamace
                    </div>
                  </div>

                  <div className="bg-[#FAF7F0] border border-[#DCD5C7] rounded-lg p-5 flex flex-col justify-between">
                    <div className="text-xs text-[#57524A] uppercase tracking-wider font-mono-tabular">
                      Porozumění PŘED → PO
                    </div>
                    <div className="my-2 flex items-baseline gap-2">
                      <span className="text-3xl font-serif-display font-semibold font-mono-tabular text-[#0D3B3E]">
                        {stats ? `${stats.avgBefore} → ${stats.avgAfter}` : '…'}
                      </span>
                      <span className="text-xs font-mono-tabular text-[#57524A]">/ 5 bodů</span>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-2 text-[11px] font-mono-tabular">
                        <span className="w-10 text-[#57524A]">Před:</span>
                        <div className="flex-1 h-2 bg-[#E6DFD1] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#9A3412]"
                            style={{ width: `${stats ? (stats.avgBefore / 5) * 100 : 35}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono-tabular">
                        <span className="w-10 text-[#0D3B3E] font-semibold">Po:</span>
                        <div className="flex-1 h-2 bg-[#E6DFD1] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#0D3B3E]"
                            style={{ width: `${stats ? (stats.avgAfter / 5) * 100 : 88}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#FAF7F0] border border-[#DCD5C7] rounded-lg p-5 flex flex-col justify-between">
                    <div className="text-xs text-[#57524A] uppercase tracking-wider font-mono-tabular">
                      Využilo žádost o přezkum
                    </div>
                    <div className="my-3 text-4xl font-serif-display font-semibold font-mono-tabular text-[#161412]">
                      {stats ? `${stats.usedRequestPct} %` : '…'}
                    </div>
                    <div className="text-xs text-[#57524A]">
                      Odneslo si hotový text žádosti o vysvětlení
                    </div>
                  </div>

                  <div className="bg-[#FAF7F0] border border-[#DCD5C7] rounded-lg p-5 flex flex-col justify-between">
                    <div className="text-xs text-[#57524A] uppercase tracking-wider font-mono-tabular">
                      Sestavených odvolání
                    </div>
                    <div className="my-3 text-4xl font-serif-display font-semibold font-mono-tabular text-[#161412]">
                      {stats ? stats.createdAppealCount : '…'}
                    </div>
                    <div className="text-xs text-[#57524A]">
                      Včetně hlídané lhůty a 10 náležitostí
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3 Steps + Epistemic Humility ("Co nástroj neumí") */}
            <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-7 space-y-6">
                <div className="text-xs uppercase tracking-widest text-[#0D3B3E] font-mono-tabular font-semibold">
                  01 · Architektura důvěry
                </div>
                <h2 className="text-3xl font-serif-display font-medium text-[#161412]">
                  Tři kroky od úředního dopisu k věcné obraně
                </h2>

                <div className="space-y-4">
                  <div className="bg-white border border-[#DCD5C7] rounded-xl p-6 flex gap-5 items-start document-sheet-shadow">
                    <div className="w-10 h-10 rounded-lg bg-[#0D3B3E] text-[#E6B86A] font-mono-tabular text-sm font-semibold flex items-center justify-center shrink-0">
                      01
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-mono-tabular text-[#0D3B3E] font-semibold uppercase tracking-wider">
                        Lokální anonymizace a čtení snímku (OCR)
                      </div>
                      <h3 className="text-lg font-serif-display font-medium text-[#161412]">
                        Vaše rodné číslo a účet zůstanou jen ve vašem prohlížeči
                      </h3>
                      <p className="text-sm text-[#57524A] leading-relaxed">
                        Vložíte text nebo vyfotíte papírový dopis mobilem. Deterministický skript v prohlížeči automaticky zamaskuje rodná čísla, bankovní účty, IBAN i telefony ještě předtím, než text odejde k analýze.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-[#DCD5C7] rounded-xl p-6 flex gap-5 items-start document-sheet-shadow">
                    <div className="w-10 h-10 rounded-lg bg-[#0D3B3E] text-[#E6B86A] font-mono-tabular text-sm font-semibold flex items-center justify-center shrink-0">
                      02
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-mono-tabular text-[#0D3B3E] font-semibold uppercase tracking-wider">
                        Rentgen citací a odhalení zamlčených důvodů
                      </div>
                      <h3 className="text-lg font-serif-display font-medium text-[#161412]">
                        Každé tvrzení modelu ověřujeme v kódu proti textu dopisu
                      </h3>
                      <p className="text-sm text-[#57524A] leading-relaxed">
                        U každého bodu vidíte, zda je doložen doslovnou citací z vašeho dopisu, nebo jde o odhad kontextu. Pokud by si model citaci vymyslel, kontrolní kód ji automaticky přeřadí na odhad.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-[#DCD5C7] rounded-xl p-6 flex gap-5 items-start document-sheet-shadow">
                    <div className="w-10 h-10 rounded-lg bg-[#0D3B3E] text-[#E6B86A] font-mono-tabular text-sm font-semibold flex items-center justify-center shrink-0">
                      03
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-mono-tabular text-[#0D3B3E] font-semibold uppercase tracking-wider">
                        Deterministický hlídač lhůty a generátor odvolání
                      </div>
                      <h3 className="text-lg font-serif-display font-medium text-[#161412]">
                        Lhůtu počítá neomylný kód včetně všech 13 českých svátků
                      </h3>
                      <p className="text-sm text-[#57524A] leading-relaxed">
                        Výpočet 15 nebo 30 dnů neprovádí AI. Čistý kód pohlídá konec lhůty, posune jej z víkendu či státního svátku na nejbližší pracovní den, uloží upomínku do kalendáře a sestaví odvolání.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Epistemic Humility Panel */}
              <div className="lg:col-span-5 bg-[#F1ECE1] border border-[#DCD5C7] rounded-xl p-7 space-y-6 self-start">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-widest text-[#9A3412] font-mono-tabular font-semibold">
                    02 · Poctivé limity umělé inteligence
                  </div>
                  <h2 className="text-2xl font-serif-display font-medium text-[#161412]">
                    Co ROZKLÍČ neumí a nikdy nepředstírá
                  </h2>
                  <p className="text-sm text-[#57524A] leading-relaxed">
                    Dobrý nástroj musí otevřeně říct, kde končí fakta z dokumentu a kde začíná nejistota.
                  </p>
                </div>

                <div className="space-y-4 text-sm border-t border-[#DCD5C7] pt-5">
                  <div className="bg-white border border-[#DCD5C7] rounded-lg p-4">
                    <div className="font-semibold text-[#161412]">
                      Nevidí do interního skóringu banky ani do spisu úřadu
                    </div>
                    <p className="text-xs text-[#57524A] mt-1 leading-relaxed">
                      Nikdy netvrdíme „zamítli vás kvůli věku nebo příjmu“, pokud to v dopise není doslova napsáno.
                      Hypotézy vždy oddělujeme od faktů.
                    </p>
                  </div>

                  <div className="bg-white border border-[#DCD5C7] rounded-lg p-4">
                    <div className="font-semibold text-[#161412]">
                      Nenahrazuje advokáta a neslibuje jistotu výhry
                    </div>
                    <p className="text-xs text-[#57524A] mt-1 leading-relaxed">
                      Pomáháme dodržet lhůtu, strukturu a 10 zákonných náležitostí podání, abyste nepřišli o svá práva kvůli formální chybě.
                    </p>
                  </div>

                  <div className="bg-white border border-[#DCD5C7] rounded-lg p-4">
                    <div className="font-semibold text-[#161412]">
                      Nevymýšlí si paragrafy ani spisové značky
                    </div>
                    <p className="text-xs text-[#57524A] mt-1 leading-relaxed">
                      Model má zakázáno citovat neověřené předpisy. Chybějící osobní údaje v odvolání vždy ponechá jako{' '}
                      <code className="font-mono-tabular bg-[#F1ECE1] px-1.5 py-0.5 rounded text-[#9A3412] font-medium">[doplnit …]</code>.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: VYSVĚTLOVAČ ROZHODNUTÍ (/vysvetlit)                          */}
        {/* =================================================================== */}
        {activeTab === 'vysvetlit' && (
          <div className="max-w-7xl mx-auto px-6 py-10 space-y-10" data-state={explainStatus}>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-[#DCD5C7] pb-6 no-print">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-[#0D3B3E] font-mono-tabular font-semibold">
                  Krok 1 · Překlad úředního, bankovního nebo pojišťovacího rozhodnutí
                </div>
                <h1 className="text-3xl lg:text-4xl font-serif-display font-medium text-[#161412]">
                  Rozklíčovat doručené rozhodnutí
                </h1>
              </div>

              {/* Sample Letter Selector Buttons */}
              <div className="space-y-1.5">
                <div className="text-xs text-[#57524A] font-medium">
                  Vyzkoušejte na reálném vzorovém dopisu (1 kliknutí):
                </div>
                <div className="flex flex-wrap items-center gap-1.5 bg-[#F1ECE1] p-1.5 rounded-lg border border-[#DCD5C7]">
                  {SAMPLE_LETTERS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSampleLetter(s)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        letterText === s.letterText
                          ? 'bg-[#0D3B3E] text-white shadow-xs font-semibold'
                          : 'text-[#57524A] hover:text-[#161412]'
                      }`}
                    >
                      {s.shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleExplainSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 no-print">
              <div className="lg:col-span-8 space-y-6">
                {/* Category Fieldset */}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold text-[#161412]">
                    1. Odkud vám rozhodnutí přišlo?
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                    {(Object.keys(DEADLINE_RULES) as InstitutionCategory[]).map((catKey) => {
                      const rule = DEADLINE_RULES[catKey];
                      const active = category === catKey;
                      return (
                        <label
                          key={catKey}
                          className={`flex items-start gap-2.5 p-3.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            active
                              ? 'bg-[#E3EFEF] border-[#0D3B3E] text-[#161412] font-semibold'
                              : 'bg-white border-[#DCD5C7] text-[#57524A] hover:border-[#161412]/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name="category"
                            value={catKey}
                            checked={active}
                            onChange={() => setCategory(catKey)}
                            className="sr-only"
                          />
                          <span className="leading-snug">{rule.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Letter Textarea + OCR Upload */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="letter-input" className="text-sm font-semibold text-[#161412]">
                      2. Text doručeného dopisu nebo rozhodnutí
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleOcrFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={ocrLoading}
                        className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-[#DCD5C7] rounded-md hover:bg-[#F1ECE1] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#0D3B3E]" aria-hidden="true" />
                        <span>{ocrLoading ? 'Čtu text ze snímku…' : 'Vyfotit / nahrát snímek dopisu (OCR)'}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    id="letter-input"
                    rows={11}
                    value={letterText}
                    onChange={(e) => setLetterText(e.target.value)}
                    placeholder="Zkopírujte sem text zamítavého dopisu z banky, pojišťovny nebo úřadu (minimálně 40 znaků)..."
                    className="w-full rounded-lg bg-white border border-[#DCD5C7] p-4 text-sm text-[#161412] leading-relaxed focus:outline-none focus:border-[#0D3B3E] font-mono-tabular document-sheet-shadow"
                  />
                  <div className="flex items-center justify-between text-xs text-[#57524A]">
                    <span>Délka textu: {letterText.trim().length} znaků (minimum 40 znaků)</span>
                    {letterText.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setLetterText('');
                          setExplainResult(null);
                          setExplainStatus('idle');
                        }}
                        className="text-[#9A3412] hover:underline cursor-pointer"
                      >
                        Vymazat text
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Privacy Anonymizer + Pre-Score + Submit */}
              <div className="lg:col-span-4 space-y-6">
                {/* Client-side PII Scrubber Box */}
                <div className="bg-[#F1ECE1] border border-[#DCD5C7] rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                      Ochrana soukromí v prohlížeči
                    </div>
                    <Lock className="w-4 h-4 text-[#0D3B3E]" aria-hidden="true" />
                  </div>
                  <label className="flex items-start gap-2.5 text-xs text-[#161412] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAnonymize}
                      onChange={(e) => setAutoAnonymize(e.target.checked)}
                      className="mt-0.5 accent-[#0D3B3E]"
                    />
                    <span>
                      <strong>Automaticky maskovat osobní údaje</strong> (rodné číslo, číslo účtu, telefon, e-mail, jméno) ještě před odesláním modelu.
                    </span>
                  </label>

                  {previewAnonymization.redactions.length > 0 ? (
                    <div className="bg-white border border-[#DCD5C7] rounded-lg p-3.5 space-y-2 text-xs">
                      <div className="font-semibold text-[#161412]">
                        V textu jsme detekovali {previewAnonymization.redactions.length} osobních údajů:
                      </div>
                      <ul className="space-y-1 text-[#57524A] font-mono-tabular text-[11px]">
                        {previewAnonymization.redactions.map((item, i) => (
                          <li key={i}>
                            {item.type}: <span className="line-through">{item.original}</span> →{' '}
                            <span className="text-[#0D3B3E] font-semibold">{item.replacement}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={handleApplyAnonymizerNow}
                        className="w-full mt-1 py-1.5 px-3 text-xs font-semibold bg-[#E3EFEF] text-[#0D3B3E] rounded hover:bg-[#d2e5e5] transition-colors cursor-pointer"
                      >
                        Přepsat citlivé údaje přímo v poli
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-[#57524A]">
                      V aktuálním textu nejsou detekována žádná nechráněná rodná čísla ani čísla účtů.
                    </div>
                  )}
                </div>

                {/* Pre-comprehension score */}
                <fieldset className="bg-white border border-[#DCD5C7] rounded-xl p-5 space-y-3 document-sheet-shadow">
                  <legend className="text-sm font-semibold text-[#161412]">
                    3. Jak dobře teď rozumíte tomu, proč instituce takto rozhodla?
                  </legend>
                  <p className="text-xs text-[#57524A]">
                    1 = vůbec netuším · 5 = zcela jasně rozumím důvodům i svým právům
                  </p>
                  <div className="grid grid-cols-5 gap-2 pt-1">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <label
                        key={num}
                        className={`flex flex-col items-center justify-center py-2.5 rounded-md border text-sm font-mono-tabular cursor-pointer transition-colors ${
                          beforeScore === num
                            ? 'bg-[#0D3B3E] text-white border-[#0D3B3E] font-semibold'
                            : 'bg-[#FAF7F0] text-[#161412] border-[#DCD5C7] hover:border-[#0D3B3E]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="beforeScore"
                          value={num}
                          checked={beforeScore === num}
                          onChange={() => setBeforeScore(num)}
                          className="sr-only"
                        />
                        <span>{num}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <button
                  type="submit"
                  disabled={letterText.trim().length < 40 || beforeScore === null || explainStatus === 'loading'}
                  className="w-full py-3.5 px-6 text-sm font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
                >
                  {explainStatus === 'loading'
                    ? 'Rozklíčovávám dopis a ověřuji citace…'
                    : 'Spustit živý rozbor tohoto dopisu'}
                </button>

                {explainError && (
                  <div
                    role="alert"
                    className="p-4 rounded-md bg-[#FEF3C7] border border-[#9A3412]/30 text-xs text-[#9A3412] space-y-1"
                  >
                    <div className="font-semibold">Nelze dokončit rozbor</div>
                    <div>{explainError}</div>
                  </div>
                )}
              </div>
            </form>

            {/* Loading state */}
            {explainStatus === 'loading' && (
              <div
                role="status"
                aria-live="polite"
                className="bg-white border border-[#DCD5C7] rounded-xl p-8 text-center space-y-3 document-sheet-shadow"
              >
                <RefreshCw className="w-6 h-6 text-[#0D3B3E] animate-spin mx-auto" aria-hidden="true" />
                <div className="text-base font-serif-display font-medium text-[#161412]">
                  Překládáme úřední text a kontrolujeme doslovné citace proti originálu…
                </div>
                <p className="text-xs text-[#57524A] max-w-md mx-auto">
                  Každé tvrzení modelu porovnáváme v kódu s vaším vloženým textem, abychom vyloučili vymyšlené závěry.
                </p>
              </div>
            )}

            {/* Result Section */}
            {explainStatus === 'ready' && explainResult && (
              <section className="space-y-8 pt-6 border-t border-[#DCD5C7]">
                {/* Top Summary & Epistemic Confidence Bar */}
                <div className="bg-white border border-[#DCD5C7] rounded-xl p-7 space-y-6 document-sheet-shadow no-print">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DCD5C7] pb-4">
                    <div className="text-xs font-mono-tabular text-[#57524A]">
                      <span>Instituce: {explainResult.institutionName || DEADLINE_RULES[category].label}</span>
                      {explainResult.caseReference && (
                        <>
                          <span className="mx-2">·</span>
                          <span>Č. j. / smlouva: {explainResult.caseReference}</span>
                        </>
                      )}
                      {lastRedactions.length > 0 && (
                        <>
                          <span className="mx-2">·</span>
                          <span className="text-[#0D3B3E] font-semibold">
                            Před odesláním skryto {lastRedactions.length} osobních údajů
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleTransferToAppeal}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Sestavit odvolání z tohoto rozboru</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-7 space-y-2">
                      <div className="text-xs uppercase tracking-wider text-[#0D3B3E] font-mono-tabular font-semibold">
                        Lidské shrnutí rozhodnutí
                      </div>
                      <h2 className="text-2xl font-serif-display font-medium text-[#161412] leading-snug">
                        {explainResult.summary}
                      </h2>
                    </div>
                    <div className="lg:col-span-5 bg-[#F1ECE1] border border-[#DCD5C7] rounded-lg p-4 space-y-1.5">
                      <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#57524A]">
                        Jaký důvod dopis uvádí navenek
                      </div>
                      <p className="text-sm text-[#161412] leading-relaxed">
                        {explainResult.statedReason}
                      </p>
                    </div>
                  </div>

                  {/* Visual Epistemic Meter: Verified vs Estimated vs Missing */}
                  <div className="bg-[#FAF7F0] border border-[#DCD5C7] rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono-tabular">
                    <div className="flex items-center justify-between border-b md:border-b-0 md:border-r border-[#DCD5C7] pb-2 md:pb-0 md:pr-4">
                      <span className="text-[#57524A]">Citace ověřené v textu:</span>
                      <span className="text-base font-semibold text-[#0D3B3E]">{verifiedQuotesCount}</span>
                    </div>
                    <div className="flex items-center justify-between border-b md:border-b-0 md:border-r border-[#DCD5C7] pb-2 md:pb-0 md:pr-4">
                      <span className="text-[#57524A]">Odhady kontextu (mimo dopis):</span>
                      <span className="text-base font-semibold text-[#9A3412]">{estimatedFactorsCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#57524A]">Zamlčené informace institucí:</span>
                      <span className="text-base font-semibold text-[#161412]">{explainResult.missingInfo.length}</span>
                    </div>
                  </div>
                </div>

                {/* Interactive Split: Factors with Certainty Verification + Highlighted Original Letter */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start no-print">
                  {/* Left 7 Cols: Factors */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-xl font-serif-display font-medium text-[#161412]">
                        Rozbor faktorů a ověření původu tvrzení
                      </h3>
                      <p className="text-xs text-[#57524A]">
                        Kliknutím na libovolný faktor s citací zvýrazníte přesnou větu v originálním dopisu vpravo.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {explainResult.factors.map((f, idx) => {
                        const isInText = f.certainty === 'v_textu';
                        const isSelected = selectedQuote && f.exactQuote === selectedQuote;
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              if (f.exactQuote) setSelectedQuote(f.exactQuote);
                            }}
                            className={`bg-white border rounded-xl p-5 space-y-2 transition-colors document-sheet-shadow ${
                              f.exactQuote ? 'cursor-pointer' : ''
                            } ${
                              isSelected
                                ? 'border-[#0D3B3E] ring-1 ring-[#0D3B3E]'
                                : 'border-[#DCD5C7] hover:border-[#161412]/30'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular">
                              <span
                                className={
                                  isInText
                                    ? 'text-[#0D3B3E] font-semibold'
                                    : 'text-[#9A3412] font-semibold'
                                }
                              >
                                {isInText
                                  ? 'V TEXTU DOPISU · DOSLOVNÁ CITACE OVĚŘENA KÓDEM'
                                  : 'ODHAD MODELU · KONTEXT MIMO TEXT DOPISU'}
                              </span>
                              {f.downgradedByVerifier && (
                                <span className="text-[#9A3412]">
                                  (Změněno na odhad: citace nebyla v textu nalezena)
                                </span>
                              )}
                            </div>

                            <h4 className="text-base font-serif-display font-medium text-[#161412]">
                              {f.title}
                            </h4>
                            <p className="text-sm text-[#57524A] leading-relaxed">
                              {f.explanation}
                            </p>

                            {f.exactQuote && (
                              <div className="pt-2 border-t border-[#DCD5C7] text-xs font-mono-tabular text-[#161412]">
                                Citace z dopisu: „{f.exactQuote}“
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right 5 Cols: Interactive Rentgen Dopisu */}
                  <div className="lg:col-span-5 bg-white border border-[#DCD5C7] rounded-xl p-5 space-y-3 lg:sticky lg:top-24 document-sheet-shadow">
                    <div className="flex items-center justify-between gap-2 border-b border-[#DCD5C7] pb-3">
                      <div>
                        <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                          Rentgen zdrojového dopisu
                        </div>
                        <div className="text-xs text-[#57524A]">
                          Žlutě svítí věta, ze které vychází vybrané tvrzení
                        </div>
                      </div>
                      <Eye className="w-4 h-4 text-[#0D3B3E]" aria-hidden="true" />
                    </div>
                    <div className="max-h-96 overflow-y-auto text-xs font-mono-tabular leading-relaxed whitespace-pre-wrap text-[#161412] bg-[#FAF7F0] p-4 rounded-lg border border-[#DCD5C7]">
                      {renderHighlightedSourceText(letterText, selectedQuote)}
                    </div>
                  </div>
                </div>

                {/* Missing Info + What Tool Does Not Know */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 no-print">
                  <div className="bg-white border border-[#DCD5C7] rounded-xl p-6 space-y-4 document-sheet-shadow">
                    <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#9A3412] font-semibold">
                      Co v dopise chybí a mělo by tam být
                    </div>
                    <h3 className="text-xl font-serif-display font-medium text-[#161412]">
                      Informace, které vám instituce nesdělila
                    </h3>
                    <ul className="space-y-2.5 text-sm text-[#161412]">
                      {explainResult.missingInfo.map((info, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="font-mono-tabular text-xs text-[#9A3412] font-semibold mt-0.5">
                            0{i + 1}.
                          </span>
                          <span className="leading-relaxed">{info}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Visually Prominent "Co tento nástroj neví" */}
                  <div className="bg-[#FEF3C7]/60 border border-[#9A3412]/30 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#9A3412] font-semibold">
                        Poctivé limity AI · Co tento nástroj neví
                      </div>
                      <ShieldAlert className="w-4 h-4 text-[#9A3412]" aria-hidden="true" />
                    </div>
                    <h3 className="text-xl font-serif-display font-medium text-[#161412]">
                      Co z dopisu nelze vyčíst a nástroj si to nedomýšlí
                    </h3>
                    <ul className="space-y-2.5 text-sm text-[#161412]">
                      {explainResult.whatToolDoesNotKnow.map((limit, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="font-mono-tabular text-xs text-[#9A3412] font-semibold mt-0.5">
                            —
                          </span>
                          <span className="leading-relaxed">{limit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Your Rights & Ready-to-copy A4 Clarification Request */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-5 bg-white border border-[#DCD5C7] rounded-xl p-6 space-y-4 document-sheet-shadow no-print">
                    <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                      Vaše práva a opora v předpisech
                    </div>
                    <h3 className="text-xl font-serif-display font-medium text-[#161412]">
                      Na co máte v této situaci právo
                    </h3>
                    <div className="space-y-4 divide-y divide-[#DCD5C7]">
                      {explainResult.rights.map((r, i) => (
                        <div key={i} className={i > 0 ? 'pt-4 space-y-1' : 'space-y-1'}>
                          <div className="font-semibold text-sm text-[#161412]">{r.title}</div>
                          <p className="text-xs text-[#57524A] leading-relaxed">{r.explanation}</p>
                          <div className="text-xs font-mono-tabular text-[#0D3B3E]">
                            Opora: {r.legalBasis}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-7 bg-white border border-[#DCD5C7] rounded-xl p-6 space-y-4 document-sheet-shadow print-only-sheet">
                    <div className="flex flex-wrap items-center justify-between gap-2 no-print">
                      <div>
                        <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                          Okamžitá akce · Žádost o vysvětlení a lidský přezkum
                        </div>
                        <h3 className="text-xl font-serif-display font-medium text-[#161412]">
                          Hotová listina ke zkopírování nebo tisku
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyClarification}
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedRequest ? (
                            <>
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Zkopírováno</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Kopírovat žádost</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="px-3.5 py-2 text-xs font-medium text-[#161412] bg-[#F1ECE1] border border-[#DCD5C7] rounded-md hover:bg-[#e5decE] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Tisk / PDF</span>
                        </button>
                      </div>
                    </div>

                    <div className="a4-paper-sheet border border-[#DCD5C7] rounded-lg p-6 text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed text-[#161412]">
                      {renderFormattedFormalLetter(explainResult.clarificationRequest)}
                    </div>

                    <div className="bg-[#F1ECE1] border border-[#DCD5C7] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
                      <div className="text-xs text-[#161412]">
                        <strong>Kontrolní otázka pro další krok:</strong> {explainResult.followUpQuestion}
                      </div>
                      <button
                        type="button"
                        onClick={handleTransferToAppeal}
                        className="px-4 py-2 text-xs font-semibold text-[#0D3B3E] bg-white border border-[#0D3B3E] rounded-md hover:bg-[#E3EFEF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Přejít k formálnímu odvolání →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Post-Explanation Comprehension Score */}
                <div className="bg-[#F1ECE1] border border-[#DCD5C7] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 no-print">
                  <div className="space-y-1">
                    <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                      Měření srozumitelnosti (anonymní)
                    </div>
                    <h3 className="text-lg font-serif-display font-medium text-[#161412]">
                      Jak dobře po tomto vysvětlení rozumíte tomu, proč bylo rozhodnuto a co můžete dělat?
                    </h3>
                    <p className="text-xs text-[#57524A]">
                      Před vysvětlením jste zvolili {beforeScore}/5. Vaše odpověď aktualizuje veřejné počítadlo bez uložení textu dopisu.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleRecordAfterScore(num)}
                        className={`w-11 h-11 rounded-md border font-mono-tabular text-sm font-semibold transition-colors cursor-pointer ${
                          afterScore === num
                            ? 'bg-[#0D3B3E] text-white border-[#0D3B3E]'
                            : 'bg-white text-[#161412] border-[#DCD5C7] hover:border-[#0D3B3E]'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
                {scoreRecorded && (
                  <div className="text-xs text-[#0D3B3E] font-medium text-right no-print">
                    Děkujeme. Posun porozumění ({beforeScore} → {afterScore}) byl anonymně započítán do statistik.
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: GENERÁTOR ODVOLÁNÍ A HLÍDÁNÍ LHŮT (/odvolani)                */}
        {/* =================================================================== */}
        {activeTab === 'odvolani' && (
          <div className="max-w-7xl mx-auto px-6 py-10 space-y-10" data-state={appealStatus}>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-[#DCD5C7] pb-6 no-print">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-[#0D3B3E] font-mono-tabular font-semibold">
                  Krok 2 · Deterministické hlídání lhůty (včetně českých svátků) a generátor podání
                </div>
                <h1 className="text-3xl lg:text-4xl font-serif-display font-medium text-[#161412]">
                  Hlídač lhůt a generátor odvolání
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAppealCategory('urad');
                    setDeliveredISO('2026-10-13');
                    setInstitutionName('Městský úřad Kolín – odbor dopravy');
                    setCaseReference('MUKO-2026/48102-OD');
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-[#F1ECE1] border border-[#DCD5C7] rounded-md hover:bg-[#e5decE] transition-colors cursor-pointer"
                >
                  Ukázka posunu přes státní svátek 28. října (doručeno 13. 10. 2026)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAppealCategory('urad');
                    setDeliveredISO('2026-10-20');
                    setInstitutionName('Městský úřad Kolín – odbor dopravy');
                    setCaseReference('MUKO-2026/48102-OD');
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-[#DCD5C7] rounded-md hover:bg-[#F1ECE1] transition-colors cursor-pointer"
                >
                  Ukázka běžící lhůty (doručeno 20. 10. 2026)
                </button>
              </div>
            </div>

            {/* Deterministic Deadline Calculator Panel */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch no-print">
              <div className="lg:col-span-5 bg-white border border-[#DCD5C7] rounded-xl p-6 space-y-5 document-sheet-shadow">
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                  1. Výpočet lhůty (počítá deterministický kód, nikoliv AI)
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="delivered-date" className="block text-xs font-semibold text-[#161412] mb-1.5">
                      Datum doručení (převzetí dopisu nebo dodání do datové schránky)
                    </label>
                    <input
                      id="delivered-date"
                      type="date"
                      value={deliveredISO}
                      onChange={(e) => setDeliveredISO(e.target.value)}
                      className="w-full rounded-md border border-[#DCD5C7] px-3 py-2.5 text-sm font-mono-tabular bg-[#FAF7F0]"
                    />
                  </div>

                  <div>
                    <label htmlFor="appeal-category" className="block text-xs font-semibold text-[#161412] mb-1.5">
                      Typ instituce a zákonný režim lhůty
                    </label>
                    <select
                      id="appeal-category"
                      value={appealCategory}
                      onChange={(e) => setAppealCategory(e.target.value as InstitutionCategory)}
                      className="w-full rounded-md border border-[#DCD5C7] px-3 py-2.5 text-sm bg-[#FAF7F0]"
                    >
                      {(Object.keys(DEADLINE_RULES) as InstitutionCategory[]).map((k) => (
                        <option key={k} value={k}>
                          {DEADLINE_RULES[k].label} ({DEADLINE_RULES[k].days} dní)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Computed Deadline Result Card with Visual Day-by-Day Strip */}
              <div
                className={`lg:col-span-7 rounded-xl p-6 border flex flex-col justify-between space-y-5 document-sheet-shadow ${
                  computedDeadline?.status === 'over'
                    ? 'bg-[#FEF3C7]/70 border-[#9A3412]/40'
                    : 'bg-[#E3EFEF]/70 border-[#0D3B3E]/30'
                }`}
              >
                {computedDeadline ? (
                  <>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular">
                        <span className="font-semibold text-[#161412]">
                          {computedDeadline.status === 'open' &&
                            `LHŮTA BĚŽÍ · ZBÝVÁ ${computedDeadline.daysRemaining} DNÍ`}
                          {computedDeadline.status === 'last' &&
                            'DNES JE POSLEDNÍ DEN LHŮTY'}
                          {computedDeadline.status === 'over' &&
                            `POŘÁDKOVÁ LHŮTA UPLYNULA PŘED ${Math.abs(computedDeadline.daysRemaining)} DNY`}
                        </span>
                        <span className="text-[#57524A]">{computedDeadline.rule.legalBasis}</span>
                      </div>

                      <div className="text-2xl lg:text-3xl font-serif-display font-semibold text-[#161412]">
                        Poslední den pro podání: {computedDeadline.finalDeadlineFormatted}
                      </div>

                      {/* Visual Day-by-Day Statutory Calendar Strip */}
                      <StatutoryDaysStrip deadline={computedDeadline} />

                      {computedDeadline.shifted && (
                        <div className="text-xs text-[#161412] font-mono-tabular">
                          Posun konce lhůty podle zákona: Původní konec ({computedDeadline.rawDeadlineISO}) připadl na{' '}
                          <strong>{computedDeadline.shiftReasons.join(' a následně ')}</strong>, proto se poslední den lhůty
                          posouvá na nejbližší pracovní den ({computedDeadline.finalDeadlineFormatted}).
                        </div>
                      )}
                    </div>

                    {computedDeadline.status !== 'over' ? (
                      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#0D3B3E]/15">
                        <a
                          href={buildGoogleCalendarUrl({
                            deadline: computedDeadline,
                            institutionName,
                            caseReference,
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <CalendarIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Přidat do Google kalendáře</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          onClick={handleDownloadIcs}
                          className="px-4 py-2 text-xs font-medium text-[#161412] bg-white border border-[#DCD5C7] rounded-md hover:bg-[#F1ECE1] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Stáhnout .ics (Apple / Outlook, upomínka 3 dny a 1 den předem)</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-white border border-[#9A3412]/30 text-xs text-[#9A3412]">
                        Lhůta již uplynula. Generátor do dopisu automaticky doplní žádost o prominutí zmeškání lhůty ze závažných důvodů a návrh na přezkum.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-[#57524A]">Zadejte platné datum doručení pro výpočet lhůty.</div>
                )}
              </div>
            </section>

            {/* Appeal Form */}
            <form onSubmit={handleGenerateAppeal} className="bg-white border border-[#DCD5C7] rounded-xl p-7 space-y-6 document-sheet-shadow no-print">
              <div className="border-b border-[#DCD5C7] pb-4">
                <h2 className="text-xl font-serif-display font-medium text-[#161412]">
                  2. Údaje pro sestavení odvolání / žádosti o přezkum
                </h2>
                <p className="text-xs text-[#57524A] mt-1">
                  Pole, která necháte prázdná (např. své jméno a adresu), zůstanou v dopise bezpečně označená jako{' '}
                  <code className="font-mono-tabular bg-[#F1ECE1] px-1 py-0.5 rounded">[doplnit …]</code>, abyste si je mohli dopsat až před tiskem.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="inst-name" className="block text-xs font-semibold text-[#161412] mb-1.5">
                    Název instituce / úřadu (povinné)
                  </label>
                  <input
                    id="inst-name"
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder="např. Městský úřad Kolín / Česká spořitelna, a.s."
                    className="w-full rounded-md border border-[#DCD5C7] px-3.5 py-2 text-sm bg-[#FAF7F0]"
                  />
                </div>

                <div>
                  <label htmlFor="case-ref" className="block text-xs font-semibold text-[#161412] mb-1.5">
                    Číslo jednací / číslo smlouvy / pojistné události (nepovinné)
                  </label>
                  <input
                    id="case-ref"
                    type="text"
                    value={caseReference}
                    onChange={(e) => setCaseReference(e.target.value)}
                    placeholder="např. MUKO-2026/48102-OD (nebo nechte prázdné)"
                    className="w-full rounded-md border border-[#DCD5C7] px-3.5 py-2 text-sm font-mono-tabular bg-[#FAF7F0]"
                  />
                </div>

                <div>
                  <label htmlFor="sender-name" className="block text-xs font-semibold text-[#161412] mb-1.5">
                    Vaše jméno a příjmení (nepovinné — lze doplnit až před odesláním)
                  </label>
                  <input
                    id="sender-name"
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Necháte-li prázdné, vloží se [doplnit jméno a příjmení]"
                    className="w-full rounded-md border border-[#DCD5C7] px-3.5 py-2 text-sm bg-[#FAF7F0]"
                  />
                </div>

                <div>
                  <label htmlFor="sender-addr" className="block text-xs font-semibold text-[#161412] mb-1.5">
                    Vaše doručovací adresa nebo ID datové schránky (nepovinné)
                  </label>
                  <input
                    id="sender-addr"
                    type="text"
                    value={senderAddress}
                    onChange={(e) => setSenderAddress(e.target.value)}
                    placeholder="Necháte-li prázdné, vloží se [doplnit adresu]"
                    className="w-full rounded-md border border-[#DCD5C7] px-3.5 py-2 text-sm bg-[#FAF7F0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="what-happened" className="block text-xs font-semibold text-[#161412] mb-1.5">
                    Co se stalo a v čem je rozhodnutí nesprávné nebo neúplné (min. 25 znaků)
                  </label>
                  <textarea
                    id="what-happened"
                    rows={4}
                    value={whatHappened}
                    onChange={(e) => setWhatHappened(e.target.value)}
                    className="w-full rounded-md border border-[#DCD5C7] p-3.5 text-sm bg-[#FAF7F0] leading-relaxed"
                  />
                </div>

                <div>
                  <label htmlFor="what-requested" className="block text-xs font-semibold text-[#161412] mb-1.5">
                    Čeho se domáháte (co má instituce udělat)
                  </label>
                  <textarea
                    id="what-requested"
                    rows={4}
                    value={whatRequested}
                    onChange={(e) => setWhatRequested(e.target.value)}
                    className="w-full rounded-md border border-[#DCD5C7] p-3.5 text-sm bg-[#FAF7F0] leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <div className="text-xs text-[#57524A]">
                  Výsledný dokument bude obsahovat všechny formální náležitosti a kontrolní seznam 10 bodů.
                </div>
                <button
                  type="submit"
                  disabled={!computedDeadline || !institutionName.trim() || whatHappened.trim().length < 25 || appealStatus === 'loading'}
                  className="px-6 py-3 text-sm font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {appealStatus === 'loading'
                    ? 'Sestavuji odvolání a kontroluji náležitosti…'
                    : 'Sestavit kompletní odvolání se všemi náležitostmi'}
                </button>
              </div>

              {appealError && (
                <div role="alert" className="p-4 rounded-md bg-[#FEF3C7] text-xs text-[#9A3412]">
                  {appealError}
                </div>
              )}
            </form>

            {/* Appeal Output */}
            {appealStatus === 'ready' && appealResult && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left 7 Cols: Letter Document */}
                <div className="lg:col-span-7 bg-white border border-[#DCD5C7] rounded-xl p-7 space-y-5 document-sheet-shadow print-only-sheet">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCD5C7] pb-4 no-print">
                    <div>
                      <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                        Vygenerovaná listina
                      </div>
                      <h3 className="text-xl font-serif-display font-medium text-[#161412]">
                        {appealResult.documentTitle}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyAppeal}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedAppeal ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedAppeal ? 'Zkopírováno' : 'Kopírovat dopis'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadAppealTxt}
                        className="px-3.5 py-2 text-xs font-medium text-[#161412] bg-[#F1ECE1] border border-[#DCD5C7] rounded-md hover:bg-[#e5decE] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Stáhnout .txt</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3.5 py-2 text-xs font-medium text-[#161412] bg-white border border-[#DCD5C7] rounded-md hover:bg-[#F1ECE1] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Tisk / PDF</span>
                      </button>
                    </div>
                  </div>

                  <div className="a4-paper-sheet border border-[#DCD5C7] rounded-lg p-6 text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed text-[#161412]">
                    {renderFormattedFormalLetter(appealResult.letterText)}
                  </div>

                  <div className="bg-[#F1ECE1] border border-[#DCD5C7] rounded-lg p-4 space-y-1.5 no-print">
                    <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                      Jak podání doručit
                    </div>
                    <p className="text-xs text-[#161412] leading-relaxed">{appealResult.nextStep}</p>
                  </div>
                </div>

                {/* Right 5 Cols: 10-Point Legal Checklist + Warnings */}
                <div className="lg:col-span-5 space-y-6 no-print">
                  <div className="bg-white border border-[#DCD5C7] rounded-xl p-6 space-y-4 document-sheet-shadow">
                    <div className="flex items-center justify-between border-b border-[#DCD5C7] pb-3">
                      <div>
                        <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#0D3B3E] font-semibold">
                          Kontrola 10 náležitostí podání
                        </div>
                        <h3 className="text-lg font-serif-display font-medium text-[#161412]">
                          Co je hotové a co před odesláním doplnit
                        </h3>
                      </div>
                      <span className="text-xs font-mono-tabular text-[#57524A]">
                        {appealResult.checklist.filter((c) => c.status === 'obsazeno').length} /{' '}
                        {appealResult.checklist.length} hotovo
                      </span>
                    </div>

                    <div className="space-y-3 divide-y divide-[#DCD5C7]">
                      {appealResult.checklist.map((item, idx) => {
                        const done = item.status === 'obsazeno';
                        return (
                          <div key={idx} className={idx > 0 ? 'pt-3 space-y-1' : 'space-y-1'}>
                            <div className="flex items-center justify-between text-xs font-mono-tabular">
                              <span className="font-semibold text-[#161412]">{item.item}</span>
                              <span className={done ? 'text-[#0D3B3E] font-semibold' : 'text-[#9A3412] font-semibold'}>
                                {done ? 'OBSAŽENO V TEXTU' : 'DOPLNIT PŘED ODESLÁNÍM'}
                              </span>
                            </div>
                            <p className="text-xs text-[#57524A]">{item.reason}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Attachments & Pre-Send Warnings */}
                  <div className="bg-[#FEF3C7]/60 border border-[#9A3412]/30 rounded-xl p-6 space-y-4">
                    <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#9A3412] font-semibold">
                      Než podání odešlete (poctivé limity)
                    </div>
                    <ul className="space-y-2 text-xs text-[#161412] leading-relaxed">
                      {appealResult.warnings.map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>

                    {appealResult.attachments.length > 0 && (
                      <div className="pt-3 border-t border-[#9A3412]/20 space-y-1.5">
                        <div className="text-xs font-semibold text-[#161412]">Doporučené přílohy:</div>
                        <ul className="space-y-1 text-xs text-[#57524A]">
                          {appealResult.attachments.map((att, i) => (
                            <li key={i}>— {att}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: UKÁZKOVÉ TESTOVACÍ DOPISY (/vzory)                           */}
        {/* =================================================================== */}
        {activeTab === 'vzory' && (
          <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
            <div className="border-b border-[#DCD5C7] pb-6 space-y-2">
              <div className="text-xs uppercase tracking-widest text-[#0D3B3E] font-mono-tabular font-semibold">
                Sada testovacích dokumentů · 4 modelové situace
              </div>
              <h1 className="text-3xl lg:text-4xl font-serif-display font-medium text-[#161412]">
                Ukázkové dopisy k okamžitému vyzkoušení
              </h1>
              <p className="text-sm text-[#57524A] max-w-3xl leading-relaxed">
                Nemáte po ruce vlastní zamítavé rozhodnutí? Vyberte si některý ze čtyř modelových dopisů níže
                a jedním kliknutím jej otevřete v nástroji ROZKLÍČ.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {SAMPLE_LETTERS.map((sample) => (
                <div
                  key={sample.id}
                  className="bg-white border border-[#DCD5C7] rounded-xl p-6 flex flex-col justify-between space-y-5 document-sheet-shadow"
                >
                  <div className="space-y-4">
                    <CaseCategoryArtwork category={sample.category} />

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular text-[#57524A]">
                      <span>{DEADLINE_RULES[sample.category].label}</span>
                      <span>Č. j.: {sample.caseReference}</span>
                    </div>

                    <h2 className="text-xl font-serif-display font-medium text-[#161412]">
                      {sample.shortLabel}
                    </h2>

                    <pre className="bg-[#FAF7F0] border border-[#DCD5C7] rounded-lg p-4 text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed text-[#161412] max-h-60 overflow-y-auto">
                      {sample.letterText}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#DCD5C7]">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(sample.letterText);
                        setCopiedSampleId(sample.id);
                        setTimeout(() => setCopiedSampleId(''), 2000);
                      }}
                      className="px-3.5 py-2 text-xs font-medium text-[#161412] bg-[#F1ECE1] border border-[#DCD5C7] rounded-md hover:bg-[#e5decE] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedSampleId === sample.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#0D3B3E]" />
                          <span>Text zkopírován</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Kopírovat text dopisu</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectSampleLetter(sample, true)}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#0D3B3E] rounded-md hover:bg-[#082729] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Rozklíčovat tento dopis →</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Quiet Institutional Footer */}
      <footer className="border-t border-[#DCD5C7] bg-[#F1ECE1]/70 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#57524A]">
          <div>
            <strong className="text-[#0D3B3E] font-serif-display text-sm">ROZKLÍČ</strong> · Občanský nástroj pro srozumitelný rozbor automatizovaných a úředních rozhodnutí
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('vysvetlit')}
              className="hover:text-[#161412] cursor-pointer"
            >
              Rozklíčovat dopis
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('odvolani')}
              className="hover:text-[#161412] cursor-pointer"
            >
              Hlídač lhůt a odvolání
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vzory')}
              className="hover:text-[#161412] cursor-pointer"
            >
              Ukázkové dopisy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
