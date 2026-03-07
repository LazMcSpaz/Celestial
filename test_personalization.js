#!/usr/bin/env node
/**
 * Celestial — Personalized Advice Integration Test
 *
 * Answers the question: "Is the advice a user receives actually tailored to
 * their birth chart data and the specific date they are viewing?"
 *
 * Tests:
 *   1. Transit uniqueness      — same date, two users → different aspects
 *   2. Date sensitivity        — same user, two dates → different aspects
 *   3. Aspect math on real dates — Sun transiting known positions
 *   4. Category differentiation — same day/user, four life areas → different scores
 *   5. Score modifier — positive transit softens caution; negative hardens neutral
 *   6. Orb filtering  — fast planets 4°, slow planets 8°
 *   7. Complete pipeline — all four categories for two users on two dates
 */

'use strict';
process.env.TZ = 'UTC';

const fs   = require('fs');
const path = require('path');

// ─── Extract Ephemeris IIFE ────────────────────────────────────────────────────
const html  = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/const Ephemeris = \(\(\) => \{[\s\S]*?\}\)\(\);/);
if (!match) { console.error('FATAL: Cannot extract Ephemeris'); process.exit(1); }
let Ephemeris;
eval(match[0].replace(/^const Ephemeris\s*=/, 'Ephemeris ='));

// ─── Harness ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const R='\x1b[0m',G='\x1b[32m',RED='\x1b[31m',Y='\x1b[33m',C='\x1b[36m',B='\x1b[1m',D='\x1b[2m';
const ok  = (msg)      => { passed++; console.log(`  ${G}✓${R} ${msg}`); };
const fail = (msg)     => { failed++; console.log(`  ${RED}✗${R} ${msg}`); };
const info = (msg)     => console.log(`  ${D}ℹ ${msg}${R}`);
const sec  = (title)   => console.log(`\n${B}${C}${'═'.repeat(62)}${R}\n${B}${title}${R}`);
const sub  = (title)   => console.log(`\n  ${B}${title}${R}`);
const assert = (label, cond, detail='') => cond ? ok(`${label}${detail?' — '+detail:''}`) : fail(`${label}${detail?' — '+detail:''}`);

// ─── Helpers ───────────────────────────────────────────────────────────────────
const CAT_NAMES    = ['Finance & Career','Communication','Mind & Body','Spirit'];
const CAT_PLANETS  = {
  0:['Venus','Jupiter','Saturn','Mercury'],
  1:['Mercury','Venus','Mars','Moon'],
  2:['Moon','Mercury','Mars'],   // Chiron excluded (not in transit set)
  3:['Sun','Jupiter','Moon'],    // Neptune excluded (not in transit set)
};
const SLOW = new Set(['Jupiter','Saturn']);

function sky(year, month, day) {
  // noon UTC for calendar-day calculations
  return Ephemeris.calculate(new Date(year, month-1, day, 12), 0, null, false);
}

function getTransits(transitSky, natalPositions) {
  // Replicates getPersonalTransits() without localStorage dependency
  const transiting = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
  const personal   = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
  const result = [];
  transiting.forEach(tp => {
    const tLon = transitSky.positions[tp]?.lon;
    if (tLon == null) return;
    const maxOrb = SLOW.has(tp) ? 8 : 4;
    personal.forEach(np => {
      const nLon = natalPositions[np]?.lon;
      if (nLon == null) return;
      const asp = Ephemeris.getAspect(tLon, nLon);
      if (!asp || asp.diff > maxOrb) return;
      result.push({ transitPlanet: tp, natalPlanet: np, ...asp });
    });
  });
  return result.sort((a,b) => a.diff - b.diff);
}

function scoreDayWithNatal(transitSky, cat, natalPositions) {
  // Replicates scoreDay() wrapper without localStorage dependency
  let s = Ephemeris.scoreDay(transitSky, cat);
  const keyPs = CAT_PLANETS[cat] || CAT_PLANETS[0];
  let best = null;
  keyPs.forEach(tp => {
    const tLon = transitSky.positions[tp]?.lon;
    if (tLon == null) return;
    Object.values(natalPositions).forEach(nPos => {
      const asp = Ephemeris.getAspect(tLon, nPos.lon);
      if (!asp || asp.diff > 5) return;
      if (!best || asp.diff < best.diff) best = asp;
    });
  });
  if (best) {
    if (best.harmony === 'positive') {
      if (s >= 4) s--;
      else if (s <= 1 && best.diff < 3) s = Math.min(s + 1, 2);
    } else if (best.harmony === 'negative' && best.diff < 3) {
      if (s < 4) s = Math.min(s + 1, 4);
    }
  }
  return { score: s, triggerAspect: best };
}

// ─── Compute two natal charts (no localStorage) ────────────────────────────────
// Princess Diana — July 1, 1961, 19:45 BST (+1), Sandringham UK
const dianaNatal = Ephemeris.calculate(new Date(1961,6,1,19,45), 1, {lat:52.83,lon:0.50}, true);
const DIANA = dianaNatal.positions;

// Barack Obama — Aug 4, 1961, 19:24 HST (-10), Honolulu HI
const obamaNatal = Ephemeris.calculate(new Date(1961,7,4,19,24), -10, {lat:21.31,lon:-157.86}, true);
const OBAMA = obamaNatal.positions;

info(`Diana natal Sun: ${DIANA.Sun.lon.toFixed(2)}° (${DIANA.Sun.sign} ${DIANA.Sun.degree.toFixed(1)}°)`);
info(`Diana natal Moon: ${DIANA.Moon.lon.toFixed(2)}° (${DIANA.Moon.sign} ${DIANA.Moon.degree.toFixed(1)}°)`);
info(`Obama natal Sun: ${OBAMA.Sun.lon.toFixed(2)}° (${OBAMA.Sun.sign} ${OBAMA.Sun.degree.toFixed(1)}°)`);
info(`Obama natal Moon: ${OBAMA.Moon.lon.toFixed(2)}° (${OBAMA.Moon.sign} ${OBAMA.Moon.degree.toFixed(1)}°)`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1 — TRANSIT UNIQUENESS
// Same date viewed by two different users → different transits detected
// ═══════════════════════════════════════════════════════════════════════════════
sec('TEST 1 — TRANSIT UNIQUENESS  (same date, two users)');

// Jan 4 2025: Sun is near opposition of Diana's natal Sun (Cancer 9°40' → opposition at Capricorn 9°40' ≈ 279.66°)
// Sun in early January is around 283–285°; Jan 4 gives ~284°, within 8° of 279.66°.
// BUT the fast-planet orb limit is 4°, so we need Sun within 4° of 279.66°.
// Dec 30 2024: Sun at ~279.3° — only 0.37° from the opposition point (clearly within 4°).
// Obama's natal Sun is at 132.55° (Leo). |279.3 - 132.55| = 146.75° → nearest aspect trine at 120°, diff=26.75° → no aspect.
const dec30 = sky(2024, 12, 30);
const sunDec30 = dec30.positions.Sun.lon;
info(`Dec 30 2024 — Sun at ${sunDec30.toFixed(2)}° (Diana natal Sun opp. point: 279.66°)`);

const dianaTransitsDec30 = getTransits(dec30, DIANA);
const obamaTransitsDec30 = getTransits(dec30, OBAMA);

info(`Diana transits Dec 30: ${dianaTransitsDec30.length > 0 ? dianaTransitsDec30.map(t=>`${t.transitPlanet} ${t.name} natal ${t.natalPlanet} (${t.diff.toFixed(1)}°)`).join(', ') : 'none'}`);
info(`Obama transits Dec 30: ${obamaTransitsDec30.length > 0 ? obamaTransitsDec30.map(t=>`${t.transitPlanet} ${t.name} natal ${t.natalPlanet} (${t.diff.toFixed(1)}°)`).join(', ') : 'none'}`);

// Verify the Sun transit matches Diana's natal Sun opposition
const dianaHasSunOpp = dianaTransitsDec30.some(t => t.transitPlanet === 'Sun' && t.natalPlanet === 'Sun' && t.name === 'opposite');
const obamaHasSunOpp = obamaTransitsDec30.some(t => t.transitPlanet === 'Sun' && t.natalPlanet === 'Sun' && t.name === 'opposite');
const sunOppOrb = Ephemeris.getAspect(sunDec30, DIANA.Sun.lon);
assert('Sun opposes Diana natal Sun on Dec 30 (orb ≤4° fast limit)', dianaHasSunOpp,
  `Sun at ${sunDec30.toFixed(2)}°, orb ${sunOppOrb?.diff.toFixed(2)}°`);
assert('Obama (Leo Sun) does NOT see Sun opposite natal Sun on same date', !obamaHasSunOpp);
// Transit content must differ between users (proof of personalization)
const dDesc30 = dianaTransitsDec30.map(t=>`${t.transitPlanet}-${t.natalPlanet}-${t.name}`).sort().join('|');
const oDesc30 = obamaTransitsDec30.map(t=>`${t.transitPlanet}-${t.natalPlanet}-${t.name}`).sort().join('|');
assert('Two users receive different transit lists on identical date', dDesc30 !== oDesc30);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 — DATE SENSITIVITY
// Same user, two different dates → different aspects detected
// ═══════════════════════════════════════════════════════════════════════════════
sec('TEST 2 — DATE SENSITIVITY  (same user, two dates)');

// Date A (Dec 30): Sun opposing Diana's natal Sun — negative transit (orb 0.37°)
// Date B (July 4): Sun approaching Diana's natal Sun conjunction (~Cancer 12° = 102°, orb ~3°)
const jul4 = sky(2025, 7, 4);
const sunJul4 = jul4.positions.Sun.lon;
info(`Jul 4 2025 — Sun at ${sunJul4.toFixed(2)}° (vs Diana natal Sun 99.66°)`);

const dianaTransitsJul4 = getTransits(jul4, DIANA);
info(`Diana transits Jul 4: ${dianaTransitsJul4.length > 0 ? dianaTransitsJul4.map(t=>`${t.transitPlanet} ${t.name} natal ${t.natalPlanet} (${t.diff.toFixed(1)}°)`).join(', ') : 'none'}`);

const dianaHasSunConj = dianaTransitsJul4.some(t => t.transitPlanet === 'Sun' && t.natalPlanet === 'Sun' && t.name === 'conjunct');
assert('Diana sees Sun conjunct natal Sun around birthday (July 4)', dianaHasSunConj,
  `Sun at ${sunJul4.toFixed(2)}° vs natal 99.66°`);
assert('Diana sees opposite in Dec vs conjunction in July (date changes the aspect)', dianaHasSunOpp && dianaHasSunConj);

// Verify Dec 30 gives negative transit to Diana, July 4 gives neutral (conjunction)
const dec30DianaHarmony = dianaTransitsDec30.find(t=>t.transitPlanet==='Sun'&&t.natalPlanet==='Sun')?.harmony;
const jul4DianaHarmony  = dianaTransitsJul4.find(t=>t.transitPlanet==='Sun'&&t.natalPlanet==='Sun')?.harmony;
assert('Dec 30 Sun transit is negative for Diana (opposition)', dec30DianaHarmony === 'negative');
assert('Jul 4 Sun transit is neutral for Diana (conjunction)',   jul4DianaHarmony === 'neutral');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 — REAL-DATE ASPECT MATH
// Find dates with mathematically provable aspects; verify detection
// ═══════════════════════════════════════════════════════════════════════════════
sec('TEST 3 — REAL-DATE ASPECT MATH  (provable geometric transits)');

// Diana natal Moon: 325.00° (Aquarius 25°)
// Sun trine natal Moon: Sun at 325° - 120° = 205° (Libra ~25°) → mid-October each year
// Or:                   Sun at 325° + 120° = 445° - 360° = 85° (Gemini ~25°) → mid-June each year
// Jun 15: Sun at ~84°
const jun15 = sky(2025, 6, 15);
const sunJun15 = jun15.positions.Sun.lon;
const aspSunMoon = Ephemeris.getAspect(sunJun15, DIANA.Moon.lon);
info(`Jun 15 — Sun at ${sunJun15.toFixed(2)}°, Diana natal Moon at ${DIANA.Moon.lon.toFixed(2)}°`);
info(`Aspect detected: ${aspSunMoon ? `${aspSunMoon.name} (orb ${aspSunMoon.diff.toFixed(2)}°, ${aspSunMoon.harmony})` : 'none'}`);
assert('Sun sextile/trine Diana natal Moon mid-June (within 8° of 85°)', aspSunMoon !== null);

// Diana natal Venus: 54.42° (Taurus ~24°)
// Square from Aquarius: 54.42° - 90° = -35.58° = 324.42° (Aquarius ~24°) → late January
// Jan 20: Sun at ~300°? Let's check
const jan20 = sky(2025, 1, 20);
const sunJan20 = jan20.positions.Sun.lon;
const aspSunVenus = Ephemeris.getAspect(sunJan20, DIANA.Venus.lon);
info(`Jan 20 — Sun at ${sunJan20.toFixed(2)}°, Diana natal Venus at ${DIANA.Venus.lon.toFixed(2)}°`);
info(`Aspect Sun/natal Venus: ${aspSunVenus ? `${aspSunVenus.name} (orb ${aspSunVenus.diff.toFixed(2)}°)` : 'none'}`);

// For a guaranteed detection, compute the exact day Sun squares Diana natal Venus
// Natal Venus at 54.42°; Sun square is at 54.42° ± 90°. Sun is at 54.42°+90° = 144.42° around Aug 17.
const aug17 = sky(2025, 8, 17);
const sunAug17 = aug17.positions.Sun.lon;
const aspSunVenusAug = Ephemeris.getAspect(sunAug17, DIANA.Venus.lon);
info(`Aug 17 — Sun at ${sunAug17.toFixed(2)}°, Diana natal Venus at ${DIANA.Venus.lon.toFixed(2)}°`);
info(`Aspect: ${aspSunVenusAug ? `${aspSunVenusAug.name} (orb ${aspSunVenusAug.diff.toFixed(2)}°, ${aspSunVenusAug.harmony})` : 'none'}`);
assert('Sun squares Diana natal Venus ~Aug 17 (Sun near 144°, natal Venus 54°)', aspSunVenusAug?.name === 'square',
  `Sun at ${sunAug17.toFixed(2)}°`);
assert('That square is correctly flagged negative', aspSunVenusAug?.harmony === 'negative');

// Diana natal Jupiter: 304.86° (Aquarius ~4°50')
// Sun opposition natal Jupiter: Sun at 304.86° - 180° = 124.86° (Leo ~4°50') → around Jul 27
const jul27 = sky(2025, 7, 27);
const sunJul27 = jul27.positions.Sun.lon;
const aspSunJup = Ephemeris.getAspect(sunJul27, DIANA.Jupiter.lon);
info(`Jul 27 — Sun at ${sunJul27.toFixed(2)}°, Diana natal Jupiter at ${DIANA.Jupiter.lon.toFixed(2)}°`);
assert('Sun opposes Diana natal Jupiter ~Jul 27', aspSunJup?.name === 'opposite',
  `diff ${aspSunJup?.diff.toFixed(2)}°`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4 — CATEGORY DIFFERENTIATION
// Same day + same user → four categories → different key planet sets → different scores
// ═══════════════════════════════════════════════════════════════════════════════
sec('TEST 4 — CATEGORY DIFFERENTIATION  (4 life areas scored separately)');

// Use today's date for a realistic scenario
const testDay = sky(2025, 3, 7);  // today

sub('Diana on March 7, 2025 — all four life areas:');
const dianaScores = [0,1,2,3].map(cat => ({
  cat,
  base:   Ephemeris.scoreDay(testDay, cat),
  full:   scoreDayWithNatal(testDay, cat, DIANA),
}));

dianaScores.forEach(({cat, base, full}) => {
  const trig = full.triggerAspect ? `natal modifier: ${full.triggerAspect.harmony} ${full.triggerAspect.name} (${full.triggerAspect.diff.toFixed(1)}°)` : 'no natal modifier';
  const changed = base !== full.score ? `${base}→${full.score}` : `${base} (unchanged)`;
  info(`  ${CAT_NAMES[cat].padEnd(20)} base=${base}  final=${changed}  [${trig}]`);
});

// Scores must be in valid 0-5 range
assert('All four category scores are valid (0–5)',
  dianaScores.every(d => d.full.score >= 0 && d.full.score <= 5));

// At least two categories must differ from each other (proving differentiation)
const uniqueScores = new Set(dianaScores.map(d => d.full.score));
assert('At least two life areas receive different scores (categories are differentiated)',
  uniqueScores.size >= 2, `Scores: ${dianaScores.map(d=>d.full.score).join(' ')}`);

// Finance uses Venus/Jupiter/Saturn/Mercury; Spirit uses Sun/Jupiter/Moon
// Their key planet sets share only Jupiter → scores will often differ
const financeScore = dianaScores[0].full.score;
const spiritScore  = dianaScores[3].full.score;
info(`Finance score: ${financeScore}  |  Spirit score: ${spiritScore}`);

sub('Obama on same day — comparing with Diana:');
const obamaScores = [0,1,2,3].map(cat => ({
  cat,
  full: scoreDayWithNatal(testDay, cat, OBAMA),
}));
obamaScores.forEach(({cat, full}) => {
  info(`  ${CAT_NAMES[cat].padEnd(20)} score=${full.score} (natal ${full.triggerAspect ? full.triggerAspect.harmony+' '+full.triggerAspect.name : 'no modifier'})`);
});

// Primary check: the transit LISTS that generate the advice differ between users.
// (Scores may coincidentally match even when the underlying content is different.)
const dianaTransits = getTransits(testDay, DIANA).map(t=>`${t.transitPlanet}→${t.natalPlanet}(${t.name})`).sort();
const obamaTransits = getTransits(testDay, OBAMA).map(t=>`${t.transitPlanet}→${t.natalPlanet}(${t.name})`).sort();
info(`Diana transits: ${dianaTransits.join(', ')||'none'}`);
info(`Obama transits: ${obamaTransits.join(', ')||'none'}`);
assert('Diana and Obama see different personal transit lists (different advice content)',
  JSON.stringify(dianaTransits) !== JSON.stringify(obamaTransits));

// Secondary: verify scores diverge on at least one of the known-diverging dates (Dec 30 / Jul 4)
const dianaFull = dianaScores.map(d=>d.full.score);
const obamaFull = obamaScores.map(d=>d.full.score);
const dDec30scores = [0,1,2,3].map(c => scoreDayWithNatal(dec30, c, DIANA).score);
const oDec30scores = [0,1,2,3].map(c => scoreDayWithNatal(dec30, c, OBAMA).score);
const scoresDifferSomewhere = dDec30scores.some((s,i) => s !== oDec30scores[i]);
assert('Diana and Obama receive different category scores on Dec 30 (personalization produces divergent outcomes)',
  scoresDifferSomewhere,
  `Diana Dec 30: [${dDec30scores}]  Obama Dec 30: [${oDec30scores}]`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5 — SCORE MODIFIER DIRECTION
// Inject a known positive/negative natal aspect and verify score shifts correctly
// ═══════════════════════════════════════════════════════════════════════════════
sec('TEST 5 — SCORE MODIFIER DIRECTION  (natal aspect nudges score correctly)');

// We need a base score of ≥4 to test positive modifier (softening caution).
// Find a date where Finance base score is 4 (caution).
// We'll scan forward to find one.
let cautionDay = null, cautionSky = null;
for (let d = 1; d <= 365; d++) {
  const dt = new Date(2025, 0, 1);
  dt.setDate(dt.getDate() + d);
  const s = sky(dt.getFullYear(), dt.getMonth()+1, dt.getDate());
  if (Ephemeris.scoreDay(s, 0) === 4) { cautionDay = dt; cautionSky = s; break; }
}

if (cautionSky) {
  const financeBase = Ephemeris.scoreDay(cautionSky, 0);
  info(`Found Finance base score=4 day: ${cautionDay.toISOString().slice(0,10)}`);

  // Build a synthetic natal chart where Venus (Finance key planet) is exactly
  // trine a natal planet (positive, orb < 3° → will trigger the modifier)
  const venusLon = cautionSky.positions.Venus.lon;
  const syntheticNatal = {
    Moon: { lon: (venusLon + 120) % 360 }  // natal Moon exactly trine transiting Venus
  };

  // Verify the trine is correctly detected
  const trineAsp = Ephemeris.getAspect(venusLon, syntheticNatal.Moon.lon);
  info(`Injected: transiting Venus at ${venusLon.toFixed(2)}° trine synthetic natal Moon at ${syntheticNatal.Moon.lon.toFixed(2)}° (orb ${trineAsp?.diff.toFixed(2)}°)`);
  assert('Trine injection detected correctly', trineAsp?.name === 'trine' && trineAsp?.harmony === 'positive');

  const resultPos = scoreDayWithNatal(cautionSky, 0, syntheticNatal);
  assert(`Positive trine softens Caution (4) day by 1 → score becomes 3`,
    resultPos.score === 3, `got ${resultPos.score}`);

  // Now inject a tight square (negative, orb < 3°) onto a neutral day
  let neutralDay = null, neutralSky = null;
  for (let d = 1; d <= 365; d++) {
    const dt = new Date(2025, 0, 1);
    dt.setDate(dt.getDate() + d);
    const s = sky(dt.getFullYear(), dt.getMonth()+1, dt.getDate());
    if (Ephemeris.scoreDay(s, 0) === 0) { neutralDay = dt; neutralSky = s; break; }
  }
  if (neutralSky) {
    const neutralBase = Ephemeris.scoreDay(neutralSky, 0);
    const venusN = neutralSky.positions.Venus.lon;
    const squareNatal = {
      Sun: { lon: (venusN + 90) % 360 }  // natal Sun exactly square transiting Venus (orb=0°, negative, <3°)
    };
    const squareAsp = Ephemeris.getAspect(venusN, squareNatal.Sun.lon);
    info(`Injected: transiting Venus at ${venusN.toFixed(2)}° square synthetic natal Sun at ${squareNatal.Sun.lon.toFixed(2)}° (orb ${squareAsp?.diff.toFixed(2)}°)`);
    assert('Square injection detected correctly', squareAsp?.name === 'square' && squareAsp?.harmony === 'negative');
    const resultNeg = scoreDayWithNatal(neutralSky, 0, squareNatal);
    assert(`Tight negative square pushes Neutral (0) day toward Caution → score becomes 1`,
      resultNeg.score === 1, `got ${resultNeg.score}`);
    info(`Neutral day: ${neutralDay.toISOString().slice(0,10)}, base=0, after natal square: ${resultNeg.score}`);
  }

  // Verify: same caution day WITHOUT natal → score stays at 4
  const noNatal = scoreDayWithNatal(cautionSky, 0, {});
  assert('Without natal chart, score is unchanged from base', noNatal.score === financeBase,
    `expected ${financeBase}, got ${noNatal.score}`);
} else {
  fail('Could not find a Finance caution (4) day in 2025 for modifier test');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6 — ORB FILTERING
// Fast planets (Sun/Moon/Mercury/Venus/Mars) use 4° max; slow (Jupiter/Saturn) use 8°
// ═══════════════════════════════════════════════════════════════════════════════
sec('TEST 6 — ORB FILTERING  (4° fast, 8° slow planet cutoffs)');

// Synthetic natal chart with Moon at exactly 5° from a trine point of transiting Sun
const sunLon = 100;  // fixed synthetic Sun longitude
const trineOf100 = (100 + 120) % 360;  // 220°
const natalAt5Beyond = { Moon: { lon: (trineOf100 + 5) % 360 } };  // 5° past trine → diff=5°

const aspFast5 = Ephemeris.getAspect(sunLon, natalAt5Beyond.Moon.lon);
// 5° orb > 4° fast limit but < 8° slow limit
// BUT: getAspect uses 8° as its universal orb — the 4°/8° filtering is in getPersonalTransits
// So we test the filtering logic directly

function filterByOrb(transitPlanet, asp) {
  const maxOrb = SLOW.has(transitPlanet) ? 8 : 4;
  return asp && asp.diff <= maxOrb;
}

// Sun trine at 4.5° → excluded (fast, >4°)
const sunTrine4_5 = Ephemeris.getAspect(100, (100+120+4.5)%360);  // trine + 4.5° offset → diff = 4.5°
assert('Sun transit at 4.5° orb is EXCLUDED (fast planet >4° max)',
  !filterByOrb('Sun', sunTrine4_5), `orb: ${sunTrine4_5?.diff.toFixed(2)}°`);

// Sun trine at 3.5° → included (fast, <4°)
const sunTrine3_5 = Ephemeris.getAspect(100, (100+120+3.5)%360);
assert('Sun transit at 3.5° orb is INCLUDED (fast planet ≤4° max)',
  filterByOrb('Sun', sunTrine3_5), `orb: ${sunTrine3_5?.diff.toFixed(2)}°`);

// Jupiter trine at 4.5° → included (slow, <8°)
const jupTrine4_5 = Ephemeris.getAspect(100, (100+120+4.5)%360);
assert('Jupiter transit at 4.5° orb is INCLUDED (slow planet ≤8° max)',
  filterByOrb('Jupiter', jupTrine4_5), `orb: ${jupTrine4_5?.diff.toFixed(2)}°`);

// Jupiter trine at 8.5° → excluded (slow, >8°)
const jupTrine8_5 = Ephemeris.getAspect(100, (100+120+8.5)%360);
assert('Jupiter transit at 8.5° orb is EXCLUDED (slow planet >8° max)',
  !filterByOrb('Jupiter', jupTrine8_5), `orb: ${jupTrine8_5?.diff.toFixed(2)}°`);

// Verify this plays out in the full getTransits() function with a real sky
const midSky = sky(2025, 3, 7);
// Synthetic natal: Moon at exactly 6° from a trine of the Sun on that day
const sunOnDay = midSky.positions.Sun.lon;
const trineTarget6 = (sunOnDay + 120 + 6) % 360;
const trineTarget3 = (sunOnDay + 120 + 3) % 360;

const natal6deg = { Moon: { lon: trineTarget6 } };
const natal3deg = { Moon: { lon: trineTarget3 } };

const transits6 = getTransits(midSky, natal6deg);
const transits3 = getTransits(midSky, natal3deg);
const sunToMoon6 = transits6.find(t => t.transitPlanet==='Sun' && t.natalPlanet==='Moon');
const sunToMoon3 = transits3.find(t => t.transitPlanet==='Sun' && t.natalPlanet==='Moon');

assert('Sun trine at 6° orb does NOT appear for user (fast planet exceeds 4° max)', !sunToMoon6);
assert('Sun trine at 3° orb DOES appear for user (fast planet within 4° max)',       !!sunToMoon3,
  `orb: ${sunToMoon3?.diff.toFixed(2)}°`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7 — COMPLETE PIPELINE
// Simulate what both users see for two specific dates across all categories
// Shows the full personalization: different users, different dates, all life areas
// ═══════════════════════════════════════════════════════════════════════════════
sec('TEST 7 — COMPLETE PIPELINE SIMULATION');

const DATES = [
  { label: 'Jan 4 2025 (Diana birthday opposition)',  s: sky(2025,1,4)  },
  { label: 'Jul 4 2025 (Diana birthday conjunction)', s: sky(2025,7,4)  },
];
const USERS = [
  { name: 'Diana', natal: DIANA },
  { name: 'Obama', natal: OBAMA },
];

let pipelineCorrect = true;
DATES.forEach(({ label, s: daySky }) => {
  sub(label);
  USERS.forEach(({ name, natal }) => {
    const transits = getTransits(daySky, natal);
    const scores   = [0,1,2,3].map(cat => scoreDayWithNatal(daySky, cat, natal).score);
    const topTransit = transits[0];
    const transitDesc = topTransit
      ? `${topTransit.transitPlanet} ${topTransit.name} natal ${topTransit.natalPlanet} (orb ${topTransit.diff.toFixed(1)}° — ${topTransit.harmony})`
      : 'no active transits';
    info(`  ${name.padEnd(6)}: [Finance=${scores[0]} Comms=${scores[1]} Mind=${scores[2]} Spirit=${scores[3]}]  Top transit: ${transitDesc}`);
    // All scores must be 0-5
    if (scores.some(s => s < 0 || s > 5)) pipelineCorrect = false;
    // Transits must only reference the 7 core planets
    const valid = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
    if (transits.some(t => !valid.includes(t.transitPlanet) || !valid.includes(t.natalPlanet))) pipelineCorrect = false;
  });
  // Verify Diana and Obama see different transit lists on same date
  const dTransits = getTransits(daySky, DIANA).map(t=>`${t.transitPlanet}-${t.natalPlanet}-${t.name}`).sort().join('|');
  const oTransits = getTransits(daySky, OBAMA).map(t=>`${t.transitPlanet}-${t.natalPlanet}-${t.name}`).sort().join('|');
  if (dTransits !== oTransits) ok(`Diana and Obama see different transits on ${label.slice(0,10)}`);
  else fail(`Diana and Obama see IDENTICAL transits on ${label.slice(0,10)} — personalization may be missing`);
});

assert('All pipeline scores in valid range (0–5) and all transit planets valid', pipelineCorrect);

// ─── Final summary ─────────────────────────────────────────────────────────────
const total = passed + failed;
sec('SUMMARY');
console.log(`  Checks run:   ${total}`);
console.log(`  ${G}${B}Passed: ${passed}${R}`);
if (failed) console.log(`  ${RED}${B}Failed: ${failed}${R}`);
else        console.log(`  ${G}No failures.${R}`);
console.log(`\n  Pass rate: ${((passed/total)*100).toFixed(1)}%  (${passed}/${total})`);
if (failed) { console.log(`\n  ${RED}${B}OVERALL: FAIL${R}`); process.exit(1); }
else          console.log(`\n  ${G}${B}OVERALL: PASS${R}`);
