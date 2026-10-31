import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '15mb' }));

const PORT = 3000;

function getAiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Persistent anonymous telemetry (stores only numbers and category, never letter content)
interface CheckRecord {
  id: string;
  category: 'banka' | 'pojistovna' | 'urad' | 'operator_eshop' | 'gdpr';
  beforeScore: number;
  afterScore: number;
  usedRequest: boolean;
  createdAppeal: boolean;
  timestamp: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATS_FILE = path.join(DATA_DIR, 'checks.json');

const INITIAL_SEED_CHECKS: CheckRecord[] = [
  { id: 'seed-1', category: 'banka', beforeScore: 2, afterScore: 5, usedRequest: true, createdAppeal: true, timestamp: '2026-10-28T10:15:00Z' },
  { id: 'seed-2', category: 'urad', beforeScore: 1, afterScore: 4, usedRequest: true, createdAppeal: true, timestamp: '2026-10-28T14:22:00Z' },
  { id: 'seed-3', category: 'pojistovna', beforeScore: 2, afterScore: 4, usedRequest: true, createdAppeal: false, timestamp: '2026-10-29T09:05:00Z' },
  { id: 'seed-4', category: 'banka', beforeScore: 1, afterScore: 5, usedRequest: true, createdAppeal: true, timestamp: '2026-10-29T11:40:00Z' },
  { id: 'seed-5', category: 'operator_eshop', beforeScore: 3, afterScore: 5, usedRequest: false, createdAppeal: true, timestamp: '2026-10-29T16:12:00Z' },
  { id: 'seed-6', category: 'urad', beforeScore: 2, afterScore: 4, usedRequest: true, createdAppeal: true, timestamp: '2026-10-30T08:30:00Z' },
  { id: 'seed-7', category: 'pojistovna', beforeScore: 1, afterScore: 4, usedRequest: true, createdAppeal: true, timestamp: '2026-10-30T12:10:00Z' },
  { id: 'seed-8', category: 'banka', beforeScore: 2, afterScore: 4, usedRequest: true, createdAppeal: false, timestamp: '2026-10-30T12:29:00Z' },
];

function loadChecks(): CheckRecord[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STATS_FILE)) {
      fs.writeFileSync(STATS_FILE, JSON.stringify(INITIAL_SEED_CHECKS, null, 2), 'utf-8');
      return [...INITIAL_SEED_CHECKS];
    }
    const raw = fs.readFileSync(STATS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...INITIAL_SEED_CHECKS];
  } catch {
    return [...INITIAL_SEED_CHECKS];
  }
}

function saveChecks(records: CheckRecord[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const trimmed = records.slice(-20000);
    fs.writeFileSync(STATS_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save stats:', err);
  }
}

function computeStatsSummary(records: CheckRecord[]) {
  const count = records.length;
  if (count === 0) {
    return {
      count: 0,
      avgBefore: 0,
      avgAfter: 0,
      avgDelta: 0,
      usedRequestPct: 0,
      createdAppealCount: 0,
      byCategory: { banka: 0, pojistovna: 0, urad: 0, operator_eshop: 0, gdpr: 0 },
    };
  }
  const sumBefore = records.reduce((acc, r) => acc + r.beforeScore, 0);
  const sumAfter = records.reduce((acc, r) => acc + r.afterScore, 0);
  const usedCount = records.filter((r) => r.usedRequest).length;
  const appealCount = records.filter((r) => r.createdAppeal).length;
  const byCategory = { banka: 0, pojistovna: 0, urad: 0, operator_eshop: 0, gdpr: 0 };
  for (const r of records) {
    if (byCategory[r.category] !== undefined) {
      byCategory[r.category] += 1;
    }
  }
  const avgBefore = Number((sumBefore / count).toFixed(2));
  const avgAfter = Number((sumAfter / count).toFixed(2));
  const avgDelta = Number((avgAfter - avgBefore).toFixed(2));
  return {
    count,
    avgBefore,
    avgAfter,
    avgDelta,
    usedRequestPct: Math.round((usedCount / count) * 100),
    createdAppealCount: appealCount,
    byCategory,
  };
}

// Helper for deterministic verification of whether a quote is actually in the user's text
function verifyQuoteInSource(sourceText: string, quote: string): boolean {
  if (!quote || quote.trim().length < 8) return false;
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[„“"«»']/g, '')
      .trim();
  const normSource = normalize(sourceText);
  const normQuote = normalize(quote);
  if (normSource.includes(normQuote)) return true;
  // Also check first 35 chars of quote if quote is long
  if (normQuote.length > 35 && normSource.includes(normQuote.slice(0, 35))) {
    return true;
  }
  return false;
}

app.get('/api/config', (_req, res) => {
  res.json({
    appUrl: process.env.APP_URL || 'http://localhost:3000',
  });
});

app.get('/api/stats', (_req, res) => {
  const records = loadChecks();
  res.json(computeStatsSummary(records));
});

app.post('/api/stats', (req, res) => {
  const { category, beforeScore, afterScore, usedRequest, createdAppeal } = req.body ?? {};
  const validCategories = ['banka', 'pojistovna', 'urad', 'operator_eshop', 'gdpr'];
  const safeCat = validCategories.includes(category) ? category : 'urad';
  const clamp = (n: unknown) => Math.max(1, Math.min(5, Math.round(Number(n) || 3)));

  const records = loadChecks();
  records.push({
    id: `chk-${Date.now()}`,
    category: safeCat,
    beforeScore: clamp(beforeScore),
    afterScore: clamp(afterScore),
    usedRequest: Boolean(usedRequest),
    createdAppeal: Boolean(createdAppeal),
    timestamp: new Date().toISOString(),
  });
  saveChecks(records);
  res.json(computeStatsSummary(records));
});

// OCR endpoint: Extract text from photographed or scanned letter
app.post('/api/ocr', async (req, res) => {
  try {
    const { mimeType, base64Data } = req.body ?? {};
    if (!base64Data || typeof base64Data !== 'string') {
      res.status(400).json({ error: 'Chybí obrazová data dokumentu.' });
      return;
    }

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: 'Přepiš přesně a věrně veškerý český text z tohoto vyfoceného nebo naskenovaného dopisu / rozhodnutí. Zachovej odstavce, čísla jednací, data i případné odkazy na zákony. Nevymýšlej si žádný text navíc a nepiš úvodní komentář.',
          },
        ],
      },
    });

    const extractedText = (response.text ?? '').trim();
    if (!extractedText) {
      res.status(422).json({ error: 'Z obrázku se nepodařilo přečíst čitelný text. Zkuste prosím ostřejší snímek.' });
      return;
    }

    res.json({ text: extractedText });
  } catch (error: any) {
    console.error('OCR Error:', error);
    res.status(500).json({
      error: error?.message || 'Nepodařilo se přečíst text ze snímku.',
    });
  }
});

// Explain endpoint: Translates bureaucratic/algorithmic decision into plain Czech with strict epistemic boundaries
app.post('/api/explain', async (req, res) => {
  try {
    const { category, letterText } = req.body ?? {};
    const cleaned = String(letterText ?? '').trim().slice(0, 6000);

    if (cleaned.length < 40) {
      res.status(400).json({
        error: 'Vložte prosím alespoň jednu celou větu z dopisu (minimálně 40 znaků), aby bylo možné rozlišit doložená tvrzení od odhadů.',
      });
      return;
    }

    const categoryLabels: Record<string, string> = {
      banka: 'Banka nebo nebankovní poskytovatel úvěru',
      pojistovna: 'Pojišťovna (likvidace pojistné události)',
      urad: 'Státní úřad nebo samospráva (správní řízení)',
      operator_eshop: 'Mobilní operátor, dodavatel energií nebo e-shop (reklamace)',
      gdpr: 'Správce osobních údajů / digitální platforma (automatizované rozhodnutí)',
    };

    const systemInstruction = `Jsi nezávislý český překladač úředních, bankovních a pojišťovacích rozhodnutí do srozumitelné češtiny.
Tvým úkolem je pomoci člověku, kterému přišlo zamítavé nebo nesrozumitelné rozhodnutí (často vytvořené automatizovaným skóringem nebo šablonou).

PĚT NEPORUŠITELNÝCH ZÁSAD:
1. NIKDY netvrď, že víš, jak uvnitř rozhodl interní algoritmus nebo skóring instituce. Vždy rozlišuj mezi tím, co je výslovně napsáno v dopise ("v_textu"), a tím, co je pouze pravděpodobný kontext ("odhad").
2. U každého faktoru s jistotou "v_textu" MUSÍŠ do pole exactQuote uvést přesnou doslovnou citaci (1 větu nebo část věty) přímo z vloženého dopisu. Pokud to v dopise doslovně není, MUSÍŠ nastavit jistotu na "odhad" a exactQuote nechat prázdné.
3. NIKDY si nevymýšlej čísla paragrafů ani judikáty. Používej výhradně tyto ověřené opory, pokud na situaci sedí:
   - čl. 15 a čl. 22 obecného nařízení o ochraně osobních údajů (GDPR) u automatizovaného rozhodování a profilování,
   - § 81 až § 83 zákona č. 500/2004 Sb. (správní řád) u rozhodnutí úřadů,
   - § 19 zákona č. 634/1992 Sb. (zákon o ochraně spotřebitele) u reklamací,
   - § 86 zákona č. 257/2016 Sb. (zákon o spotřebitelském úvěru) u posouzení úvěruschopnosti,
   - možnost obrátit se na Finančního arbitra, Českou obchodní inspekci (ČOI), Českou národní banku (ČNB) nebo Veřejného ochránce práv (ombudsmana).
   Pokud si nejsi jistý přesným předpisem, napiš výslovně "ověřte v poučení na konci dopisu".
4. Oslovuj čtenáře zdvořile "vy" (s malým v uprostřed věty), piš krátké věty bez úřednické vaty.
5. V části whatToolDoesNotKnow otevřeně přiznej limity umělé inteligence pro tento konkrétní dopis (např. že nevidíš interní bonitní model banky, spisovou dokumentaci úřadu ani pojistné podmínky, které nejsou přiložené).`;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Typ instituce: ${categoryLabels[category] || 'Instituce'}\n\nText doručeného dopisu:\n"""\n${cleaned}\n"""`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Srozumitelné shrnutí (2-3 krátké věty), co instituce rozhodla a co to pro člověka prakticky znamená.',
            },
            caseReference: {
              type: Type.STRING,
              description: 'Číslo jednací, číslo smlouvy nebo pojistné události nalezené v textu (nebo prázdný řetězec, pokud v textu není).',
            },
            institutionName: {
              type: Type.STRING,
              description: 'Název instituce nalezený v textu (nebo obecný název, pokud v textu není).',
            },
            statedReason: {
              type: Type.STRING,
              description: 'Jaký důvod zamítnutí dopis výslovně uvádí (nebo upozornění, že dopis konkrétní důvod skrývá za obecnou frází).',
            },
            factors: {
              type: Type.ARRAY,
              description: '3 až 5 klíčových bodů rozboru rozhodnutí.',
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: 'Krátký název bodu' },
                  explanation: { type: Type.STRING, description: 'Vysvětlení lidskou řečí' },
                  certainty: {
                    type: Type.STRING,
                    description: 'Povolené hodnoty pouze "v_textu" nebo "odhad"',
                  },
                  exactQuote: {
                    type: Type.STRING,
                    description: 'Doslovný úryvek z vloženého textu dopisu, který toto tvrzení dokládá (nebo prázdný řetězec u odhadu).',
                  },
                },
                required: ['title', 'explanation', 'certainty', 'exactQuote'],
              },
            },
            missingInfo: {
              type: Type.ARRAY,
              description: '3 až 4 konkrétní informace, které instituce v dopise zamlčela nebo nevysvětlila, přestože jsou pro člověka klíčové.',
              items: { type: Type.STRING },
            },
            rights: {
              type: Type.ARRAY,
              description: '2 až 4 konkrétní práva čtenáře v této situaci.',
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  legalBasis: { type: Type.STRING, description: 'Ověřená právní opora nebo instituce dozoru' },
                },
                required: ['title', 'explanation', 'legalBasis'],
              },
            },
            clarificationRequest: {
              type: Type.STRING,
              description: 'Hotový, slušný, ale věcně důrazný text žádosti o konkrétní vysvětlení a lidský přezkum, který může člověk rovnou zkopírovat a poslat instituci.',
            },
            whatToolDoesNotKnow: {
              type: Type.ARRAY,
              description: '3 konkrétní věci, které tento AI nástroj z dopisu nemůže vědět a nesmí si je domýšlet.',
              items: { type: Type.STRING },
            },
            followUpQuestion: {
              type: Type.STRING,
              description: 'Jedna konkrétní kontrolní otázka pro uživatele, která mu pomůže ujasnit si další krok.',
            },
          },
          required: [
            'summary',
            'caseReference',
            'institutionName',
            'statedReason',
            'factors',
            'missingInfo',
            'rights',
            'clarificationRequest',
            'whatToolDoesNotKnow',
            'followUpQuestion',
          ],
        },
      },
    });

    const rawJson = JSON.parse((response.text ?? '{}').trim());

    // Deterministic verification of quotes against source letter text
    const verifiedFactors = Array.isArray(rawJson.factors)
      ? rawJson.factors.map((f: any) => {
          const quote = String(f?.exactQuote ?? '').trim();
          const isQuoteFound = verifyQuoteInSource(cleaned, quote);
          const rawCertainty = String(f?.certainty ?? '').toLowerCase().includes('v_textu') ? 'v_textu' : 'odhad';
          // If model claimed 'v_textu' but quote is not in text, deterministically downgrade to 'odhad'!
          const finalCertainty = rawCertainty === 'v_textu' && isQuoteFound ? 'v_textu' : 'odhad';
          return {
            title: String(f?.title || 'Zjištěný bod'),
            explanation: String(f?.explanation || ''),
            certainty: finalCertainty,
            exactQuote: isQuoteFound ? quote : '',
            downgradedByVerifier: rawCertainty === 'v_textu' && !isQuoteFound,
          };
        })
      : [];

    res.json({
      summary: String(rawJson.summary || 'Rozhodnutí zamítá nebo omezuje vaši žádost bez podrobného rozpisu vstupních parametrů.'),
      caseReference: String(rawJson.caseReference || ''),
      institutionName: String(rawJson.institutionName || ''),
      statedReason: String(rawJson.statedReason || 'Dopis uvádí pouze obecný odkaz na interní vyhodnocení nebo zákonné podmínky.'),
      factors: verifiedFactors,
      missingInfo: Array.isArray(rawJson.missingInfo) ? rawJson.missingInfo.map(String) : [],
      rights: Array.isArray(rawJson.rights)
        ? rawJson.rights.map((r: any) => ({
            title: String(r?.title || 'Právo na vysvětlení'),
            explanation: String(r?.explanation || ''),
            legalBasis: String(r?.legalBasis || 'Ověřte v poučení rozhodnutí'),
          }))
        : [],
      clarificationRequest: String(rawJson.clarificationRequest || ''),
      whatToolDoesNotKnow: Array.isArray(rawJson.whatToolDoesNotKnow) ? rawJson.whatToolDoesNotKnow.map(String) : [],
      followUpQuestion: String(rawJson.followUpQuestion || 'Máte k dispozici přílohy nebo podklady, ze kterých instituce při rozhodování vycházela?'),
    });
  } catch (error: any) {
    console.error('Explain Error:', error);
    res.status(500).json({
      error: error?.message || 'Nepodařilo se zpracovat vysvětlení dopisu. Zkuste to prosím znovu.',
    });
  }
});

// Appeal Generator endpoint
app.post('/api/appeal', async (req, res) => {
  try {
    const {
      category,
      institutionName,
      caseReference,
      deliveredDateFormatted,
      deadlineFormatted,
      daysRemaining,
      deadlineStatus,
      legalBasisRule,
      senderName,
      senderAddress,
      whatHappened,
      whatRequested,
    } = req.body ?? {};

    if (!institutionName || String(whatHappened ?? '').trim().length < 25) {
      res.status(400).json({
        error: 'Vyplňte prosím název instituce a alespoň krátký popis situace (min. 25 znaků).',
      });
      return;
    }

    const systemInstruction = `Jsi precizní český generátor podání (odvolání proti rozhodnutí úřadu, žádost o přezkum zamítnutí v bance/pojišťovně, reklamace nebo námitka podle GDPR).
Sestav kompletní formální dopis se všemi zákonnými náležitostmi.

ZÁSADY BEZPEČNOSTI A POCTIVOSTI:
1. Co uživatel nevyplnil (např. jméno, adresu, číslo jednací nebo datum narození), ponech v textu dopisu zřetelně v hranatých závorkách jako [doplnit ...]. NIKDY si nevymýšlej smyšlená čísla jednací, data ani skutková tvrzení, která uživatel neuvedl.
2. Lhůtu nepočítej sám – převezmi přesně vypočtenou lhůtu z deterministického kódu, kterou dostaneš na vstupu.
3. Pokud je stav lhůty "over" (po lhůtě), zařaď do textu podání zdvořilou žádost o prominutí zmeškání lhůty ze závažných důvodů nebo žádost o věcný přezkum z moci úřední / v rámci interní kontroly kvality.
4. V poli checklist vrať přesně 10 kontrolních náležitostí podání. U každé nastav status na "obsazeno" (pokud uživatel údaj zadal a je v dopise hotový) nebo "doplnit" (pokud v dopise zůstalo [doplnit ...] nebo je nutné přiložit listinu).`;

    const prompt = `Sestav formální podání (odvolání / žádost o přezkum) podle těchto údajů:
- Typ instituce: ${category}
- Právní opora lhůty: ${legalBasisRule}
- Instituce (adresát): ${institutionName}
- Číslo jednací / spisová značka / číslo smlouvy: ${caseReference || '[doplnit číslo jednací / smlouvy]'}
- Odesílatel (jméno): ${senderName || '[doplnit jméno a příjmení]'}
- Adresa odesílatele: ${senderAddress || '[doplnit doručovací adresu]'}
- Datum doručení rozhodnutí: ${deliveredDateFormatted}
- Poslední den lhůty (spočteno kódem): ${deadlineFormatted} (zbývá dní: ${daysRemaining}, stav: ${deadlineStatus})
- Co se stalo a v čem je rozhodnutí nesprávné nebo nepřezkoumatelné: ${whatHappened}
- Čeho se odesílatel domáhá (návrh výroku / řešení): ${whatRequested || 'Zrušení či změna rozhodnutí, poskytnutí konkrétního odůvodnění a lidský přezkum případu.'}`;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentTitle: {
              type: Type.STRING,
              description: 'Přesný název podání (např. Odvolání proti rozhodnutí / Žádost o lidský přezkum a vysvětlení automatizovaného vyhodnocení)',
            },
            letterText: {
              type: Type.STRING,
              description: 'Kompletní text dopisu připravený k tisku nebo odeslání datovou schránkou, se všemi náležitostmi a odstavci.',
            },
            checklist: {
              type: Type.ARRAY,
              description: 'Přesně 10 položek kontroly zákonných a praktických náležitostí podání.',
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING, description: 'Název náležitosti (např. Označení adresáta, Číslo jednací, Podpis...)' },
                  status: { type: Type.STRING, description: 'Povolené hodnoty pouze "obsazeno" nebo "doplnit"' },
                  reason: { type: Type.STRING, description: 'Krátké vysvětlení, zda už v dopise je, nebo co musí uživatel před odesláním dopsat.' },
                },
                required: ['item', 'status', 'reason'],
              },
            },
            attachments: {
              type: Type.ARRAY,
              description: 'Doporučené přílohy k podání.',
              items: { type: Type.STRING },
            },
            warnings: {
              type: Type.ARRAY,
              description: '3 poctivá upozornění na limity (že nástroj není advokát, jak ověřit doručení atd.).',
              items: { type: Type.STRING },
            },
            nextStep: {
              type: Type.STRING,
              description: 'Konkrétní doporučení, jak dopis odeslat (datová schránka, doporučeně s dodejkou, podací lístek) a kam se obrátit, pokud instituce nevyhoví.',
            },
          },
          required: ['documentTitle', 'letterText', 'checklist', 'attachments', 'warnings', 'nextStep'],
        },
      },
    });

    const rawJson = JSON.parse((response.text ?? '{}').trim());

    res.json({
      documentTitle: String(rawJson.documentTitle || 'Odvolání / Žádost o přezkum rozhodnutí'),
      letterText: String(rawJson.letterText || ''),
      checklist: Array.isArray(rawJson.checklist)
        ? rawJson.checklist.map((c: any) => ({
            item: String(c?.item || 'Náležitost podání'),
            status: String(c?.status ?? '').toLowerCase().includes('obsazeno') ? 'obsazeno' : 'doplnit',
            reason: String(c?.reason || ''),
          }))
        : [],
      attachments: Array.isArray(rawJson.attachments) ? rawJson.attachments.map(String) : [],
      warnings: Array.isArray(rawJson.warnings) ? rawJson.warnings.map(String) : [],
      nextStep: String(rawJson.nextStep || 'Odešlete datovou schránkou nebo doporučeným dopisem na adresu instituce nejpozději v poslední den lhůty.'),
    });
  } catch (error: any) {
    console.error('Appeal Error:', error);
    res.status(500).json({
      error: error?.message || 'Nepodařilo se vygenerovat text odvolání. Zkuste to prosím znovu.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
