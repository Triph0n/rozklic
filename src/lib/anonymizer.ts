export interface RedactionItem {
  type: string;
  original: string;
  replacement: string;
}

export interface AnonymizationResult {
  sanitizedText: string;
  redactions: RedactionItem[];
}

/**
 * Deterministic client-side PII scrubber (Anonymizér osobních údajů).
 * Runs 100% in the browser before the letter text is sent to the server/LLM.
 */
export function anonymizeCzechLetter(rawText: string): AnonymizationResult {
  let text = rawText;
  const redactions: RedactionItem[] = [];

  // 1. Czech Birth Numbers (Rodné číslo: e.g. 740512/1234 or 685224/098)
  text = text.replace(/\b(\d{6}\s*\/\s*\d{3,4})\b/g, (match) => {
    redactions.push({
      type: 'Rodné číslo',
      original: match,
      replacement: '[RODNÉ ČÍSLO SKRYTO]',
    });
    return '[RODNÉ ČÍSLO SKRYTO]';
  });

  // 2. Czech Bank Account Numbers (e.g. 19-123456789/0800 or 1234567890/0100)
  text = text.replace(/\b((?:\d{1,6}-)?\d{2,10}\/\d{4})\b/g, (match) => {
    // Avoid matching case numbers like 2026/1045 by checking common bank codes or length
    const parts = match.split('/');
    const prefixAndMain = parts[0].replace('-', '');
    if (prefixAndMain.length >= 6) {
      redactions.push({
        type: 'Číslo účtu',
        original: match,
        replacement: '[ČÍSLO ÚČTU SKRYTO]',
      });
      return '[ČÍSLO ÚČTU SKRYTO]';
    }
    return match;
  });

  // 3. IBAN (CZxx xxxx ...)
  text = text.replace(/\b(CZ\d{2}\s*(?:\d{4}\s*){5})\b/gi, (match) => {
    redactions.push({
      type: 'IBAN účet',
      original: match,
      replacement: '[IBAN SKRYT]',
    });
    return '[IBAN SKRYT]';
  });

  // 4. Email addresses
  text = text.replace(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, (match) => {
    redactions.push({
      type: 'E-mail',
      original: match,
      replacement: '[E-MAIL SKRYT]',
    });
    return '[E-MAIL SKRYT]';
  });

  // 5. Czech phone numbers (+420 xxx xxx xxx or 7xx xxx xxx / 6xx xxx xxx)
  text = text.replace(/(?:\+420\s*)?\b([67]\d{2}\s*\d{3}\s*\d{3})\b/g, (match) => {
    redactions.push({
      type: 'Telefon',
      original: match,
      replacement: '[TELEFON SKRYT]',
    });
    return '[TELEFON SKRYT]';
  });

  // 6. Named salutations ("Vážený pane Nováku", "Vážená paní Svobodová", "Jméno žadatele: Jan Novák")
  text = text.replace(
    /(Vážený pane|Vážená paní|Žadatel(?:ka)?|Pojištěný|Účastník řízení)(\s*:\s*|\s+)([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)?)/g,
    (_full, prefix, sep, name) => {
      redactions.push({
        type: 'Jméno osoby',
        original: name,
        replacement: '[JMÉNO SKRYTO]',
      });
      return `${prefix}${sep}[JMÉNO SKRYTO]`;
    }
  );

  return {
    sanitizedText: text,
    redactions,
  };
}
