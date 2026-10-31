import assert from 'node:assert/strict';
import { computeDeadline } from './deadlines';
import { anonymizeCzechLetter } from './anonymizer';
import { buildGoogleCalendarUrl, buildIcsFileContent } from './calendar';
import { SAMPLE_LETTERS } from './sample-letters';

async function runAllTests() {
  console.log('=== 1. TESTY DETERMINISTICKÝCH LHŮT (VČETNĚ ČESKÝCH SVÁTKŮ) ===');

  // Test 1A: 13. 10. 2026 + 15 days (úřad) -> raw end is 28. 10. 2026 (Státní svátek!), must shift to 29. 10. 2026
  const d1 = computeDeadline('2026-10-13', 'urad', new Date('2026-10-25T12:00:00Z'));
  assert(d1 !== null, 'Deadline d1 must not be null');
  assert.equal(d1.rawDeadlineISO, '2026-10-28');
  assert.equal(d1.finalDeadlineISO, '2026-10-29');
  assert.equal(d1.shifted, true);
  assert(d1.shiftReasons.some((r) => r.includes('28.') || r.includes('československého')), 'Must mention 28.10. holiday');
  console.log('✔ Test 1A (posun přes státní svátek 28. října): OK ->', d1.finalDeadlineISO, d1.shiftReasons);

  // Test 1B: Weekend shift: 2026-10-16 + 15 days = 2026-10-31 (Saturday) -> shifts through Sunday 2026-11-01 to Monday 2026-11-02
  const d2 = computeDeadline('2026-10-16', 'urad', new Date('2026-10-25T12:00:00Z'));
  assert(d2 !== null);
  assert.equal(d2.rawDeadlineISO, '2026-10-31');
  assert.equal(d2.finalDeadlineISO, '2026-11-02');
  assert.equal(d2.shifted, true);
  console.log('✔ Test 1B (posun přes sobotu a neděli na pondělí): OK ->', d2.finalDeadlineISO);

  // Test 1C: Movable Easter holiday in 2026: Good Friday is 2026-04-03, Easter Monday is 2026-04-06
  // Delivery on 2026-03-19 + 15 days = 2026-04-03 (Velký pátek) -> shifts through Fri, Sat, Sun, Easter Mon to Tue 2026-04-07!
  const d3 = computeDeadline('2026-03-19', 'urad', new Date('2026-03-20T12:00:00Z'));
  assert(d3 !== null);
  assert.equal(d3.rawDeadlineISO, '2026-04-03');
  assert.equal(d3.finalDeadlineISO, '2026-04-07');
  console.log('✔ Test 1C (posun přes Velký pátek, víkend a Velikonoční pondělí): OK ->', d3.finalDeadlineISO, d3.shiftReasons);

  console.log('\n=== 2. TESTY LOKÁLNÍHO ANONYMIZÉRU OSOBNÍCH ÚDAJŮ (PII SCRUBBER) ===');
  const bankSample = SAMPLE_LETTERS[0].letterText;
  const anonRes = anonymizeCzechLetter(bankSample);
  assert(!anonRes.sanitizedText.includes('710418/1429'), 'Rodné číslo musí být skryto');
  assert(!anonRes.sanitizedText.includes('19-4482010287/0100'), 'Číslo účtu musí být skryto');
  assert(!anonRes.sanitizedText.includes('724 881 203'), 'Telefon musí být skryt');
  assert(anonRes.redactions.length >= 4, 'Měly by být nalezeny alespoň 4 citlivé údaje');
  console.log('✔ Test 2 (maskování RČ, účtu, telefonu a jména): OK -> nalezeno a skryto položek:', anonRes.redactions.length);

  console.log('\n=== 3. TESTY KALENDÁŘE (GOOGLE CALENDAR URL & .ICS) ===');
  const gcalUrl = buildGoogleCalendarUrl({
    deadline: d1,
    institutionName: 'Městský úřad Kolín',
    caseReference: 'MUKO-2026/123',
  });
  assert(gcalUrl.startsWith('https://calendar.google.com/calendar/render?'));
  assert(gcalUrl.includes('20261029%2F20261030'));
  const ics = buildIcsFileContent({
    deadline: d1,
    institutionName: 'Městský úřad Kolín',
    caseReference: 'MUKO-2026/123',
  });
  assert(ics.includes('BEGIN:VCALENDAR'));
  assert(ics.includes('TRIGGER:-P3D'));
  assert(ics.includes('TRIGGER:-P1D'));
  console.log('✔ Test 3 (Google Calendar URL a .ics upomínky -3d/-1d): OK');

  console.log('\n=== 4. TESTY ŽIVÝCH API ENDPOINTŮ SERVERU ===');
  const statsBeforeResp = await fetch('http://localhost:3000/api/stats');
  assert.equal(statsBeforeResp.status, 200);
  const statsBefore = await statsBeforeResp.json();
  assert(statsBefore.count >= 8, 'Stats count should be at least 8');
  console.log('✔ Test 4A (GET /api/stats): OK -> count =', statsBefore.count, 'avgBefore =', statsBefore.avgBefore, 'avgAfter =', statsBefore.avgAfter);

  // Test /api/explain with Bank sample letter (anonymized)
  const explainResp = await fetch('http://localhost:3000/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'banka',
      letterText: anonRes.sanitizedText,
    }),
  });
  assert.equal(explainResp.status, 200, 'POST /api/explain must return 200');
  const explainData = await explainResp.json();
  assert(typeof explainData.summary === 'string' && explainData.summary.length > 20);
  assert(Array.isArray(explainData.factors) && explainData.factors.length >= 2);
  assert(Array.isArray(explainData.whatToolDoesNotKnow) && explainData.whatToolDoesNotKnow.length >= 1);
  assert(typeof explainData.clarificationRequest === 'string' && explainData.clarificationRequest.length > 30);
  console.log('✔ Test 4B (POST /api/explain + deterministický ověřovač citací): OK -> faktorů:', explainData.factors.length);

  // Test /api/appeal
  const appealResp = await fetch('http://localhost:3000/api/appeal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: d1.rule.label,
      institutionName: 'Městský úřad Kolín',
      caseReference: 'MUKO-2026/48102-OD',
      deliveredDateFormatted: d1.deliveredFormatted,
      deadlineFormatted: d1.finalDeadlineFormatted,
      daysRemaining: d1.daysRemaining,
      deadlineStatus: d1.status,
      legalBasisRule: d1.rule.legalBasis,
      senderName: '',
      senderAddress: '',
      whatHappened: 'Úřad zamítl žádost o přepis vozidla s odkazem na chybějící plnou moc, která však byla přiložena.',
      whatRequested: 'Zrušení rozhodnutí a provedení zápisu změny vlastníka vozidla.',
    }),
  });
  assert.equal(appealResp.status, 200, 'POST /api/appeal must return 200');
  const appealData = await appealResp.json();
  assert(typeof appealData.letterText === 'string' && appealData.letterText.includes('[doplnit'));
  assert(Array.isArray(appealData.checklist) && appealData.checklist.length === 10);
  console.log('✔ Test 4C (POST /api/appeal + 10bodový kontrolní seznam): OK -> položek checklistu:', appealData.checklist.length);

  console.log('\n🎉 VŠECHNY TESTY PROŠLY BEZ CHYBY!');
}

runAllTests().catch((err) => {
  console.error('TEST SELHAL:', err);
  process.exit(1);
});
