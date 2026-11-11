/**
 * National public holidays of the countries Goose can fill in, worked out for a given year:
 * fixed dates, dates around Easter (Western, or Orthodox for Greece and Egypt), "nth weekday"
 * rules (US, UK) and the weekend moves of the US and UK. Islamic holidays follow the moon:
 * the dates below are the expected ones (Umm al-Qura / astronomical) and can move by a day;
 * governments also announce their exact length shortly before. Regional holidays are not included.
 */

export interface RuleDay { day: string; end?: string; name: string }
type Y = number;

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const D = (y: Y, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const add = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
const dow = (d: Date) => d.getUTCDay();   // 0 Sunday … 6 Saturday
const at = (s: string) => new Date(`${s}T00:00:00Z`);

/** Western Easter Sunday (anonymous Gregorian algorithm). */
function easter(y: Y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return D(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
}
/** Orthodox Easter Sunday (Julian computus, shifted to the Gregorian calendar; valid 1900–2099). */
function orthodoxEaster(y: Y) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return add(D(y, month, day), 13);
}
/** The n-th given weekday of a month (n = -1: the last). */
function nth(y: Y, m: number, wd: number, n: number) {
  if (n > 0) { const first = D(y, m, 1); return add(first, ((wd - dow(first) + 7) % 7) + (n - 1) * 7); }
  const last = D(y, m + 1, 0); return add(last, -((dow(last) - wd + 7) % 7));
}
/** US federal rule: Saturday is observed on Friday, Sunday on Monday. */
const usObserved = (d: Date) => (dow(d) === 6 ? add(d, -1) : dow(d) === 0 ? add(d, 1) : d);

/** Expected Islamic dates (Gregorian), by year. */
const ISLAMIC: Record<number, { fitr: string; arafat: string; adha: string; hijri: string; ashura: string; mawlid: string }> = {
  2026: { fitr: '2026-03-20', arafat: '2026-05-26', adha: '2026-05-27', hijri: '2026-06-16', ashura: '2026-06-25', mawlid: '2026-08-25' },
  2027: { fitr: '2027-03-09', arafat: '2027-05-15', adha: '2027-05-16', hijri: '2027-06-06', ashura: '2027-06-15', mawlid: '2027-08-14' },
  2028: { fitr: '2028-02-27', arafat: '2028-05-04', adha: '2028-05-05', hijri: '2028-05-25', ashura: '2028-06-03', mawlid: '2028-08-03' },
};
const EXP = ' (expected)';
/** Islamic holidays as a country keeps them: `fitr`/`adha` = number of days, `arafat`, `hijri`, `ashura`, `mawlid` (days). */
function islamic(y: Y, o: { fitr: number; adha: number; arafat?: boolean; hijri?: boolean; ashura?: boolean; mawlid?: number }, names = { fitr: 'Eid al-Fitr', adha: 'Eid al-Adha' }): RuleDay[] {
  const t = ISLAMIC[y]; if (!t) return [];
  const span = (s: string, n: number, name: string): RuleDay => ({ day: s, end: n > 1 ? iso(add(at(s), n - 1)) : undefined, name: name + EXP });
  return [
    span(t.fitr, o.fitr, names.fitr),
    ...(o.arafat ? [span(t.arafat, 1, 'Day of Arafah')] : []),
    span(t.adha, o.adha, names.adha),
    ...(o.hijri ? [span(t.hijri, 1, 'Islamic New Year')] : []),
    ...(o.ashura ? [span(t.ashura, 1, 'Ashura')] : []),
    ...(o.mawlid ? [span(t.mawlid, o.mawlid, "Prophet's Birthday (Mawlid)")] : []),
  ];
}
const fixed = (y: Y, list: [number, number, string][]): RuleDay[] => list.map(([m, d, name]) => ({ day: iso(D(y, m, d)), name }));
const rel = (base: Date, list: [number, string][]): RuleDay[] => list.map(([n, name]) => ({ day: iso(add(base, n)), name }));

export interface CountryRule { id: string; label: string; years: number[]; days: (y: Y) => RuleDay[] }
const Y3 = [2026, 2027, 2028];
const ANY = [2026, 2027, 2028, 2029, 2030];

export const COUNTRIES: CountryRule[] = [
  { id: 'de', label: 'Germany (nationwide)', years: ANY, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [5, 1, 'Labour Day'], [10, 3, 'German Unity Day'], [12, 25, 'Christmas Day'], [12, 26, 'Second Day of Christmas']]),
    ...rel(easter(y), [[-2, 'Good Friday'], [1, 'Easter Monday'], [39, 'Ascension Day'], [50, 'Whit Monday']])] },
  { id: 'fr', label: 'France', years: ANY, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [5, 1, 'Labour Day'], [5, 8, 'Victory in Europe Day'], [7, 14, 'Bastille Day'], [8, 15, 'Assumption'],
      [11, 1, 'All Saints\' Day'], [11, 11, 'Armistice Day'], [12, 25, 'Christmas Day']]),
    ...rel(easter(y), [[1, 'Easter Monday'], [39, 'Ascension Day'], [50, 'Whit Monday']])] },
  { id: 'it', label: 'Italy', years: ANY, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [1, 6, 'Epiphany'], [4, 25, 'Liberation Day'], [5, 1, 'Labour Day'], [6, 2, 'Republic Day'], [8, 15, 'Assumption (Ferragosto)'],
      [10, 4, 'Saint Francis of Assisi'], [11, 1, 'All Saints\' Day'], [12, 8, 'Immaculate Conception'], [12, 25, 'Christmas Day'], [12, 26, 'Saint Stephen\'s Day']]),
    ...rel(easter(y), [[1, 'Easter Monday']])] },
  { id: 'gr', label: 'Greece', years: ANY, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [1, 6, 'Epiphany'], [3, 25, 'Independence Day'], [5, 1, 'Labour Day'], [8, 15, 'Assumption'], [10, 28, 'Ohi Day'],
      [12, 25, 'Christmas Day'], [12, 26, 'Glorifying Mother of God']]),
    ...rel(orthodoxEaster(y), [[-48, 'Clean Monday'], [-2, 'Orthodox Good Friday'], [1, 'Orthodox Easter Monday'], [50, 'Orthodox Whit Monday']])] },
  { id: 'gb', label: 'United Kingdom (England and Wales)', years: ANY, days: y => {
    const out: RuleDay[] = [];
    const ny = D(y, 1, 1); out.push({ day: iso(dow(ny) === 6 ? add(ny, 2) : dow(ny) === 0 ? add(ny, 1) : ny), name: 'New Year\'s Day' + (dow(ny) % 6 === 0 ? ' (substitute)' : '') });
    out.push(...rel(easter(y), [[-2, 'Good Friday'], [1, 'Easter Monday']]));
    out.push({ day: iso(nth(y, 5, 1, 1)), name: 'Early May bank holiday' }, { day: iso(nth(y, 5, 1, -1)), name: 'Spring bank holiday' }, { day: iso(nth(y, 8, 1, -1)), name: 'Summer bank holiday' });
    const xmas = D(y, 12, 25), w = dow(xmas);   // Christmas and Boxing Day move to the next free weekdays
    const [c, b] = w === 6 ? [add(xmas, 2), add(xmas, 3)] : w === 0 ? [add(xmas, 2), add(xmas, 1)] : w === 5 ? [xmas, add(xmas, 3)] : [xmas, add(xmas, 1)];
    out.push({ day: iso(c), name: 'Christmas Day' + (w === 6 || w === 0 ? ' (substitute)' : '') }, { day: iso(b), name: 'Boxing Day' + (w >= 5 || w === 0 ? ' (substitute)' : '') });
    return out;
  } },
  { id: 'us', label: 'United States (federal)', years: ANY, days: y => {
    const out: RuleDay[] = [];
    const obs = (m: number, d: number, name: string) => { const o = usObserved(D(y, m, d)); if (o.getUTCFullYear() === y) out.push({ day: iso(o), name: name + (o.getUTCDate() !== d ? ' (observed)' : '') }); };
    obs(1, 1, 'New Year\'s Day');
    if (dow(D(y + 1, 1, 1)) === 6) out.push({ day: iso(D(y, 12, 31)), name: 'New Year\'s Day (observed)' });
    out.push({ day: iso(nth(y, 1, 1, 3)), name: 'Martin Luther King Jr. Day' }, { day: iso(nth(y, 2, 1, 3)), name: 'Washington\'s Birthday' }, { day: iso(nth(y, 5, 1, -1)), name: 'Memorial Day' });
    obs(6, 19, 'Juneteenth'); obs(7, 4, 'Independence Day');
    out.push({ day: iso(nth(y, 9, 1, 1)), name: 'Labor Day' }, { day: iso(nth(y, 10, 1, 2)), name: 'Columbus Day' });
    obs(11, 11, 'Veterans Day');
    out.push({ day: iso(nth(y, 11, 4, 4)), name: 'Thanksgiving Day' });
    obs(12, 25, 'Christmas Day');
    return out;
  } },
  { id: 've', label: 'Venezuela', years: ANY, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [4, 19, 'Declaration of Independence'], [5, 1, 'Labour Day'], [6, 24, 'Battle of Carabobo'], [7, 5, 'Independence Day'],
      [7, 24, 'Birth of Simón Bolívar'], [10, 12, 'Day of Indigenous Resistance'], [12, 24, 'Christmas Eve'], [12, 25, 'Christmas Day'], [12, 31, 'New Year\'s Eve']]),
    ...rel(easter(y), [[-48, 'Carnival Monday'], [-47, 'Carnival Tuesday'], [-3, 'Holy Thursday'], [-2, 'Good Friday']])] },
  { id: 'tr', label: 'Türkiye', years: Y3, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [4, 23, 'National Sovereignty and Children\'s Day'], [5, 1, 'Labour and Solidarity Day'], [5, 19, 'Atatürk Youth and Sports Day'],
      [7, 15, 'Democracy and National Unity Day'], [8, 30, 'Victory Day'], [10, 29, 'Republic Day']]),
    ...islamic(y, { fitr: 3, adha: 4 }, { fitr: 'Ramazan Bayramı', adha: 'Kurban Bayramı' })] },
  { id: 'eg', label: 'Egypt', years: Y3, days: y => [
    ...fixed(y, [[1, 7, 'Coptic Christmas'], [1, 25, 'Revolution Day (25 January) and Police Day'], [4, 25, 'Sinai Liberation Day'], [5, 1, 'Labour Day'],
      [6, 30, '30 June Revolution'], [7, 23, 'Revolution Day (23 July)'], [10, 6, 'Armed Forces Day']]),
    ...rel(orthodoxEaster(y), [[1, 'Sham el-Nessim']]),
    ...islamic(y, { fitr: 3, adha: 3, arafat: true, hijri: true, mawlid: 1 })] },
  { id: 'dz', label: 'Algeria', years: Y3, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [1, 12, 'Yennayer (Amazigh New Year)'], [5, 1, 'Labour Day'], [7, 5, 'Independence Day'], [11, 1, 'Revolution Day']]),
    ...islamic(y, { fitr: 2, adha: 2, hijri: true, ashura: true, mawlid: 1 })] },
  { id: 'tn', label: 'Tunisia', years: Y3, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [3, 20, 'Independence Day'], [4, 9, 'Martyrs\' Day'], [5, 1, 'Labour Day'], [7, 25, 'Republic Day'], [8, 13, 'Women\'s Day'],
      [10, 15, 'Evacuation Day'], [12, 17, 'Revolution Day']]),
    ...islamic(y, { fitr: 2, adha: 2, hijri: true, mawlid: 1 })] },
  { id: 'ly', label: 'Libya', years: Y3, days: y => [
    ...fixed(y, [[2, 17, 'Revolution Day'], [5, 1, 'Labour Day'], [9, 16, 'Martyrs\' Day'], [10, 23, 'Liberation Day'], [12, 24, 'Independence Day']]),
    ...islamic(y, { fitr: 3, adha: 3, arafat: true, hijri: true, mawlid: 1 })] },
  { id: 'ma', label: 'Morocco', years: Y3, days: y => [
    ...fixed(y, [[1, 1, 'New Year\'s Day'], [1, 11, 'Independence Manifesto Day'], [1, 14, 'Amazigh New Year'], [5, 1, 'Labour Day'], [7, 30, 'Throne Day'],
      [8, 14, 'Oued Ed-Dahab Day'], [8, 20, 'Revolution of the King and the People'], [8, 21, 'Youth Day'], [10, 31, 'Unity Day (Aid Al Wahda)'], [11, 6, 'Green March'], [11, 18, 'Independence Day']]),
    ...islamic(y, { fitr: 2, adha: 2, hijri: true, mawlid: 2 })] },
];
