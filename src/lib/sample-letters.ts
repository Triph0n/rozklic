import { InstitutionCategory } from './deadlines';

export interface SampleLetter {
  id: string;
  category: InstitutionCategory;
  shortLabel: string;
  institutionName: string;
  caseReference: string;
  deliveredISO: string;
  letterText: string;
}

export const SAMPLE_LETTERS: SampleLetter[] = [
  {
    id: 'banka-hypoteka',
    category: 'banka',
    shortLabel: 'Banka: Zamítnutí úvěru skóringem',
    institutionName: 'Česká hypoteční a úvěrová banka, a.s.',
    caseReference: 'REG-2026-88412-UV',
    deliveredISO: '2026-10-22',
    letterText: `Česká hypoteční a úvěrová banka, a.s.
Odbor automatizovaného posuzování retailových rizik
Č. žádosti: REG-2026-88412-UV
V Praze dne 21. 10. 2026

Žadatel: Jan Dvořák, r. č. 710418/1429, tel. +420 724 881 203, účet 19-4482010287/0100

Věc: Vyrozumění o zamítnutí žádosti o spotřebitelský úvěr na bydlení

Vážený pane Dvořáku,

na základě Vaší žádosti ze dne 14. 10. 2026 o poskytnutí účelového spotřebitelského úvěru ve výši 2 400 000 Kč Vám tímto sdělujeme, že Vaší žádosti nebylo možné vyhovět.

Posouzení Vaší úvěruschopnosti proběhlo v souladu s § 86 zákona č. 257/2016 Sb., o spotřebitelském úvěru, s využitím interního automatizovaného skóringového modelu banky a dotazů do úvěrových registrů BRKI a NRKI. Výsledný rizikový index Vaší žádosti překročil interní limit pro schválení v daném segmentu.

Konkrétní váhy jednotlivých parametrů skóringového modelu tvoří obchodní tajemství banky, a proto je nelze v tomto dopise blíže specifikovat. Na uzavření úvěrové smlouvy není právní nárok.

S pozdravem
Automatizované klientské centrum`,
  },
  {
    id: 'urad-prispevek',
    category: 'urad',
    shortLabel: 'Úřad: Nepřiznání dávky',
    institutionName: 'Úřad práce ČR – krajská pobočka Kolín',
    caseReference: 'UPCR-2026/419820-KO',
    deliveredISO: '2026-10-20',
    letterText: `ÚŘAD PRÁCE ČESKÉ REPUBLIKY
Krajská pobočka v Příbrami, kontaktní pracoviště Kolín
Č. j.: UPCR-2026/419820-KO
Vyřizuje: oddělení nepojistných sociálních dávek

Účastník řízení: Marie Králová, r. č. 595812/0412

ROZHODNUTÍ

Úřad práce České republiky rozhodl ve věci žádosti o dávku státní sociální pomoci ze dne 15. 9. 2026 takto:

Žádost účastníka řízení se podle § 51 zákona o státní sociální podpoře zamítá, neboť po automatizovaném porovnání údajů z informačních systémů veřejné správy vyhodnotil systém celkové rozhodné příjmy okruhu společně posuzovaných osob jako převyšující zákonný násobek životního minima.

Odůvodnění:
Správní orgán provedl kontrolu dat vedených v evidenci ČSSZ a Finanční správy za rozhodné čtvrtletí. Vzhledem k tomu, že výsledná hodnota normativního výpočtu v informačním systému nevykázala kladný nárok, nebylo možné dávku přiznat. Přesný rozpis započtených příjmů jednotlivých členů domácnosti není součástí tohoto zkráceného výpisu.

Poučení:
Proti tomuto rozhodnutí lze podat odvolání do 15 dnů ode dne jeho oznámení k Ministerstvu práce a sociálních věcí prostřednictvím zdejšího úřadu podle § 81 a § 83 zákona č. 500/2004 Sb., správní řád.`,
  },
  {
    id: 'pojistovna-kraceni',
    category: 'pojistovna',
    shortLabel: 'Pojišťovna: Krácení pojistného o 60 %',
    institutionName: 'Středoevropská majetková pojišťovna, a.s.',
    caseReference: 'PU-2026-099142-DOM',
    deliveredISO: '2026-10-16',
    letterText: `Středoevropská majetková pojišťovna, a.s.
Centrum automatizované likvidace škod
Číslo pojistné události: PU-2026-099142-DOM

Pojištěný: Petr Svoboda, e-mail: petr.svoboda77@seznam.cz

Věc: Oznámení o ukončení šetření škodní události a krácení pojistného plnění

Vážený pane Svobodo,
dne 2. 10. 2026 jste nahlásil škodu způsobenou atmosférickými srážkami a zatečením střechou do obytného podkroví v celkové vyčíslené výši 148 000 Kč.

Po vyhodnocení fotodokumentace naším expertním analytickým systémem jsme dospěli k závěru, že na vzniku a rozsahu škody se podílel nevyhovující technický stav střešní krytiny a zanedbaná preventivní údržba podle čl. 14 odst. 2 Všeobecných pojistných podmínek VPP-MAJ-2024. Z tohoto důvodu přistupujeme ke krácení pojistného plnění o 60 % a na Váš účet poukazujeme částku 59 200 Kč.

Tímto považujeme škodní událost za vyřízenou.`,
  },
  {
    id: 'eshop-reklamace',
    category: 'operator_eshop',
    shortLabel: 'E-shop: Zamítnutá reklamace obuvi',
    institutionName: 'TrekSport Outdoor CZ s.r.o.',
    caseReference: 'REK-2026-11408',
    deliveredISO: '2026-10-25',
    letterText: `TrekSport Outdoor CZ s.r.o.
Reklamační oddělení
Reklamační protokol č.: REK-2026-11408

Zákazník: Eva Černá, tel. 603 412 998

Vyjádření k reklamaci turistické obuvi AlpinePro GTX (koupeno 12. 3. 2026, cena 4 290 Kč):

Reklamace se ZAMÍTÁ.

Odůvodnění:
Uplatněná závada (prasknutí podešve a prosakování membrány ve švu po 6 měsících od zakoupení) nevznikla výrobní vadou materiálu, ale mechanickým poškozením a nevhodným užíváním obuvi v rozporu s návodem k údržbě. Opotřebení odpovídá intenzivnímu zatížení, na které se zákonná odpovědnost za vady podle § 2167 občanského zákoníku nevztahuje. Zboží Vám zasíláme zpět na Vaši adresu.`,
  },
];
