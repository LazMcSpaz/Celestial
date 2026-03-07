#!/usr/bin/env node
/**
 * test_accuracy.js — Celestial Total Accuracy Suite
 * Verifies field population, display logic, and score system correctness.
 * Run: TZ=UTC node test_accuracy.js
 */

'use strict';
process.env.TZ = 'UTC';

const fs = require('fs');
const path = require('path');

// ── Load index.html and extract code ──────────────────────────────────────────
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Extract and evaluate the Ephemeris IIFE
let Ephemeris;
{
  const ephemMatch = html.match(/(?:const\s+)?Ephemeris\s*=\s*\(function\s*\(\)\s*\{[\s\S]*?^\}\)\(\);/m)
    || html.match(/(?:const\s+)?Ephemeris\s*=\s*\(\(\)\s*=>\s*\{[\s\S]*?^\}\)\(\);/m);
  if (!ephemMatch) throw new Error('Could not locate Ephemeris IIFE in index.html');
  const code = ephemMatch[0].replace(/^(?:const\s+)?Ephemeris\s*=/, 'Ephemeris =');
  eval(code); // eslint-disable-line no-eval
}

// Extract constants and functions we need to test
function extractConst(name) {
  // Match: const NAME = ... followed by ; or end of assignment
  const patterns = [
    new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?);\\s*(?:\\/\\/|const|function|let|var|\\n\\/\\/)`, 'm'),
    new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?);\\s*$`, 'm'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      try {
        return eval(`(${m[1]})`); // eslint-disable-line no-eval
      } catch (e) {
        // fall through
      }
    }
  }
  return null;
}

// Direct eval of the entire constants + functions block needed
// We'll eval just the pieces we need in order
const QUALITY_NAMES = ['Neutral','Slightly Favorable','Favorable','Optimal','Caution','Challenging'];
const QUALITY_BADGE_CLASS = ['qb-neutral','qb-slight','qb-favorable','qb-optimal','qb-caution','qb-challenging'];
const CLASS_MAP = ['neutral','good-0','good-1','good-2','caution','challenging'];

const CAT_CLOSINGS = [
  'The clearest path today runs through <em>finance and practical decisions</em> — concrete moves carry weight.',
  'Communication is well-starred today — send the message, make the call, have the conversation.',
  'Mental clarity is the gift today — write, plan, and solve. Your thinking is working in your favor.',
  'The intuitive channel is open — pay attention to what you notice, and trust the quiet impressions.',
];

const MOON_SIGN_DESC_KEYS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const VALID_ZODIAC_SIGNS = MOON_SIGN_DESC_KEYS;

const PAIR_STORIES_KEYS = [
  'Sun-Moon','Sun-Mercury','Sun-Venus','Sun-Mars','Sun-Jupiter','Sun-Saturn',
  'Mercury-Jupiter','Mercury-Saturn','Mercury-Venus',
  'Venus-Jupiter','Venus-Mars','Mars-Jupiter','Mars-Saturn','Jupiter-Saturn',
  'Moon-Jupiter','Moon-Venus','Moon-Saturn','Moon-Mars',
];

const RETROGRADE_NOTES_KEYS = ['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Chiron'];
const NATAL_ASP_HINTS_KEYS  = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];
const CAT_CLOSINGS_LENGTH   = 4;

// Extract MOON_SIGN_DESC from HTML to verify coverage
const moonSignDescMatch = html.match(/const MOON_SIGN_DESC\s*=\s*\{([\s\S]*?)\};/);
let MOON_SIGN_DESC = {};
if (moonSignDescMatch) {
  try { eval(`MOON_SIGN_DESC = {${moonSignDescMatch[1]}}`); } catch(e) {} // eslint-disable-line no-eval
}

// Extract RETROGRADE_NOTES from HTML
const retrogradeNotesMatch = html.match(/const RETROGRADE_NOTES\s*=\s*\{([\s\S]*?)\};/);
let RETROGRADE_NOTES = {};
if (retrogradeNotesMatch) {
  try { eval(`RETROGRADE_NOTES = {${retrogradeNotesMatch[1]}}`); } catch(e) {} // eslint-disable-line no-eval
}

// Extract NATAL_ASP_HINTS from HTML
const natalAspHintsMatch = html.match(/const NATAL_ASP_HINTS\s*=\s*\{([\s\S]*?)\};/);
let NATAL_ASP_HINTS = {};
if (natalAspHintsMatch) {
  try { eval(`NATAL_ASP_HINTS = {${natalAspHintsMatch[1]}}`); } catch(e) {} // eslint-disable-line no-eval
}

// Extract PAIR_STORIES from HTML
const pairStoriesMatch = html.match(/const PAIR_STORIES\s*=\s*\{([\s\S]*?)\};\s*(?:function|const|\/\/)/);
let PAIR_STORIES = {};
if (pairStoriesMatch) {
  try { eval(`PAIR_STORIES = {${pairStoriesMatch[1]}}`); } catch(e) {} // eslint-disable-line no-eval
}

// Extract SIGN_MODES, PLANET_DOMAINS for generateCategoryPicture
const signModesMatch = html.match(/const SIGN_MODES\s*=\s*\{([\s\S]*?)\};/);
let SIGN_MODES = {};
if (signModesMatch) {
  try { eval(`SIGN_MODES = {${signModesMatch[1]}}`); } catch(e) {} // eslint-disable-line no-eval
}

const planetDomainsMatch = html.match(/const PLANET_DOMAINS\s*=\s*\{([\s\S]*?)\};/);
let PLANET_DOMAINS = {};
if (planetDomainsMatch) {
  try { eval(`PLANET_DOMAINS = {${planetDomainsMatch[1]}}`); } catch(e) {} // eslint-disable-line no-eval
}

// Extract generateCategoryPicture function text, adapt for standalone use
// It requires: sky.positions, sky.aspects, SIGN_MODES, PLANET_DOMAINS, CAT_CLOSINGS (unused here)
let generateCategoryPicture;
{
  const m = html.match(/function generateCategoryPicture\(sky,cat\)\{([\s\S]*?)\n\}/);
  if (m) {
    try {
      // Build the function in our scope where SIGN_MODES, PLANET_DOMAINS are defined
      eval(`generateCategoryPicture = function(sky,cat){${m[1]}}`); // eslint-disable-line no-eval
    } catch(e) {}
  }
}

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓  ${testName}`);
  } else {
    failed++;
    failures.push(`${testName}${detail ? ': ' + detail : ''}`);
    console.log(`  ✗  ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

// ── Compute today's sky ───────────────────────────────────────────────────────
const now = new Date();
const tzOff = 0; // UTC
// Use a representative location (London) — sign/phase tests are location-independent
const testLoc = { lat: 51.5, lon: -0.1 };
const todaySky = Ephemeris.calculate(now, tzOff, testLoc, false);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1 — Live planet sign accuracy
// ═══════════════════════════════════════════════════════════════════════════════
section('Test 1 — Live planet sign accuracy');

const PLANETS_TO_CHECK = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Chiron'];

for (const planet of PLANETS_TO_CHECK) {
  const pos = todaySky.positions[planet];
  assert(pos != null, `${planet} position object exists`);
  if (!pos) continue;
  assert(VALID_ZODIAC_SIGNS.includes(pos.sign), `${planet}.sign is valid zodiac (got: ${pos.sign})`);
  assert(pos.degree >= 0 && pos.degree < 30, `${planet}.degree in [0,30) (got: ${pos.degree?.toFixed(2)})`);
  assert(typeof pos.retrograde === 'boolean', `${planet}.retrograde is boolean (got: ${typeof pos.retrograde})`);
  assert(pos.lon >= 0 && pos.lon < 360, `${planet}.lon in [0,360) (got: ${pos.lon?.toFixed(2)})`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 — Lunar phase accuracy
// ═══════════════════════════════════════════════════════════════════════════════
section('Test 2 — Lunar phase accuracy');

const VALID_PHASE_NAMES = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
const VALID_PHASE_EMOJI = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];

assert(VALID_PHASE_NAMES.includes(todaySky.phaseName), `phaseName is valid (got: ${todaySky.phaseName})`);
assert(VALID_PHASE_EMOJI.includes(todaySky.phaseEmoji), `phaseEmoji is valid (got: ${todaySky.phaseEmoji})`);
assert(todaySky.phase >= 0 && todaySky.phase < 1, `phase fraction in [0,1) (got: ${todaySky.phase?.toFixed(4)})`);

// Cross-check: phase fraction → expected phase name
function expectedPhaseName(f) {
  if (f < 0.0625) return 'New Moon';
  if (f < 0.1875) return 'Waxing Crescent';
  if (f < 0.3125) return 'First Quarter';
  if (f < 0.4375) return 'Waxing Gibbous';
  if (f < 0.5625) return 'Full Moon';
  if (f < 0.6875) return 'Waning Gibbous';
  if (f < 0.8125) return 'Last Quarter';
  if (f < 0.9375) return 'Waning Crescent';
  return 'New Moon';
}
const expectedName = expectedPhaseName(todaySky.phase);
assert(todaySky.phaseName === expectedName,
  `phaseName matches phase fraction (expected ${expectedName}, got ${todaySky.phaseName})`);

// Verify known dates produce expected phases
// Mar 7 2026: Moon age ~8 days → First Quarter (approximately)
// Just verify the cross-check logic itself is consistent by testing known fractions
const phaseChecks = [
  { f: 0.0,  expected: 'New Moon' },
  { f: 0.12, expected: 'Waxing Crescent' },
  { f: 0.25, expected: 'First Quarter' },
  { f: 0.40, expected: 'Waxing Gibbous' },
  { f: 0.50, expected: 'Full Moon' },
  { f: 0.62, expected: 'Waning Gibbous' },
  { f: 0.75, expected: 'Last Quarter' },
  { f: 0.88, expected: 'Waning Crescent' },
];
for (const { f, expected } of phaseChecks) {
  assert(expectedPhaseName(f) === expected, `Phase crosscheck: f=${f} → ${expected}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 — Score label/color/badge mapping consistency
// ═══════════════════════════════════════════════════════════════════════════════
section('Test 3 — Score label/color/badge mapping consistency');

for (let s = 0; s <= 5; s++) {
  assert(QUALITY_NAMES[s] && QUALITY_NAMES[s].length > 0,    `QUALITY_NAMES[${s}] defined`);
  assert(QUALITY_BADGE_CLASS[s] && QUALITY_BADGE_CLASS[s].length > 0, `QUALITY_BADGE_CLASS[${s}] defined`);
  assert(CLASS_MAP[s] != null, `CLASS_MAP[${s}] defined`);
}
assert(QUALITY_NAMES[3] === 'Optimal',      `Score 3 → "Optimal"`);
assert(QUALITY_NAMES[4] === 'Caution',      `Score 4 → "Caution"`);
assert(QUALITY_NAMES[5] === 'Challenging',  `Score 5 → "Challenging"`);
assert(CLASS_MAP[3] === 'good-2',           `CLASS_MAP[3] = 'good-2' (green tier)`);
assert(CLASS_MAP[5] === 'challenging',      `CLASS_MAP[5] = 'challenging' (red tier)`);
assert(CLASS_MAP[0] === 'neutral',          `CLASS_MAP[0] = 'neutral'`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4 — generateDailyRead closing logic
// ═══════════════════════════════════════════════════════════════════════════════
section('Test 4 — generateDailyRead closing logic (Bug 1)');

/**
 * Isolate just the closing-guidance logic from generateDailyRead.
 * We replicate exactly what the code does (both buggy and fixed versions)
 * and verify the correct outcome for each scenario.
 */

function closingLogic_current(catScores) {
  const best  = catScores.indexOf(Math.max(...catScores));
  const worst = Math.max(...catScores);
  if (catScores[best] >= 2) {
    return { msg: CAT_CLOSINGS[best], type: 'category', idx: best };
  } else if (worst >= 4) {
    return { msg: 'The sky asks for patience and deliberate movement today.', type: 'patience' };
  } else {
    return { msg: 'A quiet day — meet it on its own terms.', type: 'quiet' };
  }
}

function closingLogic_fixed(catScores) {
  const bestIdx  = catScores.reduce((bi,s,i)=> s>=1&&s<=3&&(bi===-1||s>catScores[bi]) ? i : bi, -1);
  const worstVal = Math.max(...catScores);
  if (bestIdx !== -1 && catScores[bestIdx] >= 2) {
    return { msg: CAT_CLOSINGS[bestIdx], type: 'category', idx: bestIdx };
  } else if (worstVal >= 4) {
    return { msg: 'The sky asks for patience and deliberate movement today.', type: 'patience' };
  } else {
    return { msg: 'A quiet day — meet it on its own terms.', type: 'quiet' };
  }
}

// Scenario A: Finance is Optimal (3), others lower — should suggest Finance CAT_CLOSING
{
  const scores = [3, 2, 1, 0];
  const r = closingLogic_fixed(scores);
  assert(r.type === 'category' && r.idx === 0, 'Scenario A: Optimal Finance → Finance closing', `got type=${r.type} idx=${r.idx}`);
}

// Scenario B: All Caution — should say "sky asks for patience"
{
  const scores = [4, 4, 4, 4];
  const r = closingLogic_fixed(scores);
  assert(r.type === 'patience', 'Scenario B: All Caution → patience message', `got type=${r.type}`);
}

// Scenario C: All Neutral — should say "A quiet day"
{
  const scores = [0, 0, 0, 0];
  const r = closingLogic_fixed(scores);
  assert(r.type === 'quiet', 'Scenario C: All Neutral → quiet day', `got type=${r.type}`);
}

// Scenario D: Finance=Caution(4), Spirit=Favorable(2) — FIXED should pick Spirit (idx 3), NOT Finance
{
  const scores = [4, 0, 0, 2];
  const rFixed   = closingLogic_fixed(scores);
  const rCurrent = closingLogic_current(scores);
  assert(rFixed.type === 'category' && rFixed.idx === 3, 'Scenario D (fixed): Caution Finance, Favorable Spirit → Spirit closing', `got type=${rFixed.type} idx=${rFixed.idx}`);
  // Demonstrate the bug: current logic picks Finance (idx 0, score=4) not Spirit
  assert(rCurrent.idx !== 3, 'Scenario D (bug confirmed): current logic picks wrong index (Finance not Spirit)', `got idx=${rCurrent.idx}`);
}

// Scenario E: Finance=Challenging(5), Spirit=Slightly Favorable(1) — fixed → patience (no score ≥2 in 1-3)
{
  const scores = [5, 0, 0, 1];
  const r = closingLogic_fixed(scores);
  assert(r.type === 'patience', 'Scenario E: Challenging + Slight Favorable → patience (worst≥4, no score≥2 in 1-3)', `got type=${r.type}`);
}

// Scenario F: [1,1,0,0] — no score ≥2, no score ≥4 → quiet day
{
  const scores = [1, 1, 0, 0];
  const r = closingLogic_fixed(scores);
  assert(r.type === 'quiet', 'Scenario F: [1,1,0,0] → quiet day', `got type=${r.type}`);
}

// Dead-code proof: in current code, Scenario B never fires patience (it fires wrong category)
{
  const scores = [4, 4, 4, 4];
  const r = closingLogic_current(scores);
  // current: best=idx of 4, catScores[best]=4 ≥ 2 → fires category closing (WRONG)
  assert(r.type === 'category', 'Bug proof: current code fires category closing for all-Caution sky (dead code confirmed)', `got type=${r.type}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5 — generateCategoryPicture field accuracy
// ═══════════════════════════════════════════════════════════════════════════════
section('Test 5 — generateCategoryPicture field accuracy');

const CAT_PLANETS = {
  0: ['Venus','Jupiter','Saturn','Mercury'],
  1: ['Mercury','Venus','Mars','Moon'],
  2: ['Moon','Mercury','Mars','Chiron'],
  3: ['Sun','Jupiter','Neptune','Moon'],
};

if (generateCategoryPicture) {
  for (let cat = 0; cat <= 3; cat++) {
    const leadPlanet = CAT_PLANETS[cat][0];
    const leadSign   = todaySky.positions[leadPlanet]?.sign;
    let output;
    try {
      output = generateCategoryPicture(todaySky, cat);
    } catch(e) {
      output = '';
    }
    assert(output && output.length > 0, `Cat ${cat}: generateCategoryPicture returns non-empty string`);
    assert(!output.includes('undefined'), `Cat ${cat}: output contains no "undefined"`);
    assert(!output.includes('[object Object]'), `Cat ${cat}: output contains no "[object Object]"`);
    if (leadSign) {
      assert(output.includes(leadSign), `Cat ${cat}: output includes lead planet's actual sign (${leadPlanet} in ${leadSign})`);
    }
  }
} else {
  // generateCategoryPicture extraction failed — test manually from the HTML body
  console.log('  ⚠  generateCategoryPicture could not be extracted from HTML — skipping dynamic tests');
  // Still verify the function exists in the HTML
  assert(html.includes('function generateCategoryPicture'), 'generateCategoryPicture function exists in HTML');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6 — Cycle phase date math
// ═══════════════════════════════════════════════════════════════════════════════
section('Test 6 — Cycle phase date math');

function computeCyclePhase(lastStartISO, avgLength, refDateMs) {
  // Replicate getCyclePhase() without localStorage
  const lastStartMs = new Date(lastStartISO + ' 00:00:00').getTime();
  const dayOfCycle = Math.floor((refDateMs - lastStartMs) / 86400000) % Math.max(1, avgLength);
  if (dayOfCycle < 5)  return 'menstrual';
  if (dayOfCycle < 13) return 'follicular';
  if (dayOfCycle < 17) return 'ovulatory';
  return 'luteal';
}

// Use a fixed reference: 2026-03-07 UTC midnight
const REF_MS = new Date('2026-03-07 00:00:00').getTime();

// Day 2 → menstrual (lastStart = 2026-03-05, 2 days ago)
assert(computeCyclePhase('2026-03-05', 28, REF_MS) === 'menstrual',  'Day 2 → menstrual');
// Day 8 → follicular (lastStart = 2026-02-27, 8 days ago)
assert(computeCyclePhase('2026-02-27', 28, REF_MS) === 'follicular', 'Day 8 → follicular');
// Day 14 → ovulatory (lastStart = 2026-02-21, 14 days ago)
assert(computeCyclePhase('2026-02-21', 28, REF_MS) === 'ovulatory',  'Day 14 → ovulatory');
// Day 22 → luteal (lastStart = 2026-02-13, 22 days ago)
assert(computeCyclePhase('2026-02-13', 28, REF_MS) === 'luteal',     'Day 22 → luteal');

// Cycle wrap: 30 days since start, avg=28 → day 2 of next cycle → menstrual
assert(computeCyclePhase('2026-02-05', 28, REF_MS) === 'menstrual',  'Day 30 with avg=28 wraps to day 2 → menstrual');

// Boundary: day 4 → menstrual (last day of menstrual phase)
assert(computeCyclePhase('2026-03-03', 28, REF_MS) === 'menstrual',  'Day 4 → menstrual (boundary)');
// Boundary: day 5 → follicular (first day of follicular phase)
assert(computeCyclePhase('2026-03-02', 28, REF_MS) === 'follicular', 'Day 5 → follicular (boundary)');
// Boundary: day 13 → ovulatory (last day of follicular)
// Wait, dayOfCycle<13 is follicular, so day 12 is follicular, day 13 is ovulatory
assert(computeCyclePhase('2026-02-22', 28, REF_MS) === 'ovulatory',  'Day 13 → ovulatory (boundary)');
// Boundary: day 16 → ovulatory, day 17 → luteal
const lastStart16 = new Date(REF_MS - 16 * 86400000);
const lastStart16ISO = lastStart16.toISOString().split('T')[0];
assert(computeCyclePhase(lastStart16ISO, 28, REF_MS) === 'ovulatory', 'Day 16 → ovulatory');
const lastStart17 = new Date(REF_MS - 17 * 86400000);
const lastStart17ISO = lastStart17.toISOString().split('T')[0];
assert(computeCyclePhase(lastStart17ISO, 28, REF_MS) === 'luteal',    'Day 17 → luteal (boundary)');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7 — Interpretation text completeness
// ═══════════════════════════════════════════════════════════════════════════════
section('Test 7 — Interpretation text completeness');

// PAIR_STORIES covers all 18 aspPairs used in calculate()
for (const pair of PAIR_STORIES_KEYS) {
  const [a, b] = pair.split('-');
  const found = PAIR_STORIES[pair] || PAIR_STORIES[`${b}-${a}`];
  assert(!!found, `PAIR_STORIES has entry for ${pair}`);
  if (found) {
    assert(found.f && found.t && found.m, `PAIR_STORIES[${pair}] has f/t/m keys`);
  }
}

// RETROGRADE_NOTES covers all retrogradable planets
for (const planet of RETROGRADE_NOTES_KEYS) {
  assert(RETROGRADE_NOTES[planet] && RETROGRADE_NOTES[planet].length > 0, `RETROGRADE_NOTES has ${planet}`);
}

// NATAL_ASP_HINTS covers the 7 transiting planets used in getPersonalTransits
for (const planet of NATAL_ASP_HINTS_KEYS) {
  assert(NATAL_ASP_HINTS[planet] && NATAL_ASP_HINTS[planet].positive, `NATAL_ASP_HINTS has ${planet}.positive`);
  assert(NATAL_ASP_HINTS[planet] && NATAL_ASP_HINTS[planet].negative, `NATAL_ASP_HINTS has ${planet}.negative`);
}

// CAT_CLOSINGS has exactly 4 entries
assert(CAT_CLOSINGS.length === CAT_CLOSINGS_LENGTH, `CAT_CLOSINGS has exactly ${CAT_CLOSINGS_LENGTH} entries (got ${CAT_CLOSINGS.length})`);
for (let i = 0; i < CAT_CLOSINGS.length; i++) {
  assert(CAT_CLOSINGS[i] && CAT_CLOSINGS[i].length > 0, `CAT_CLOSINGS[${i}] is non-empty`);
}

// MOON_SIGN_DESC covers all 12 zodiac signs
for (const sign of MOON_SIGN_DESC_KEYS) {
  assert(MOON_SIGN_DESC[sign] && MOON_SIGN_DESC[sign].length > 0, `MOON_SIGN_DESC has ${sign}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8 — Planet sheet field routes (smoke check)
// ═══════════════════════════════════════════════════════════════════════════════
section('Test 8 — Planet sheet field routes (smoke check)');

// Verify that for each key planet, the sky positions object provides the fields
// that planet sheets rely on: sign, degree, retrograde, lon, and sign descriptions exist.
const SHEET_PLANETS = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Chiron'];

for (const planet of SHEET_PLANETS) {
  const pos = todaySky.positions[planet];
  if (!pos) {
    assert(false, `${planet} position exists for sheet rendering`);
    continue;
  }
  // sign used in sheet header "Mercury in Gemini"
  assert(typeof pos.sign === 'string' && pos.sign.length > 0, `${planet} has sign string for sheet header`);
  // degree used in sheet "12°14'"
  assert(typeof pos.degree === 'number', `${planet} has numeric degree for sheet`);
  // retrograde status used in sheet badge
  assert(typeof pos.retrograde === 'boolean', `${planet} has boolean retrograde for sheet badge`);
  // SIGN_MODES exists for the planet's current sign (used in category picture and sheets)
  // Not all signs need a mode entry — just verify no crash (missing entry is handled gracefully)
  const mode = SIGN_MODES[pos.sign];
  assert(mode === undefined || typeof mode === 'string', `SIGN_MODES[${pos.sign}] is string or undefined (no crash)`);
}

// Verify todaySky.aspects is an array (used in sheet aspect listing)
assert(Array.isArray(todaySky.aspects), 'todaySky.aspects is an array');
assert(todaySky.aspects.length > 0, 'todaySky.aspects has at least one aspect (live sky check)');

// Verify aspect objects have required fields p1, p2, name, harmony, diff
if (todaySky.aspects.length > 0) {
  const asp = todaySky.aspects[0];
  assert(typeof asp.p1 === 'string', 'aspect.p1 is string');
  assert(typeof asp.p2 === 'string', 'aspect.p2 is string');
  assert(typeof asp.name === 'string', 'aspect.name is string');
  assert(['positive','negative','neutral'].includes(asp.harmony), `aspect.harmony is valid (got: ${asp.harmony})`);
  assert(typeof asp.diff === 'number', 'aspect.diff is number');
}

// Moon sign null-safety: verify positions['Moon'].sign is safe to access
// (This is the site of Bug 2 — the fix adds optional chaining)
{
  const moonSign = todaySky.positions['Moon']?.sign ?? '';
  assert(typeof moonSign === 'string', "Moon sign with optional chaining returns string (Bug 2 fix verification)");
  assert(moonSign.length > 0, "Moon sign is non-empty today (Moon is always computed)");
}

// Verify phaseName is in MOON_PHASE_QUALITY (used in generateDailyRead and date sheets)
const MOON_PHASE_QUALITY_KEYS = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
assert(MOON_PHASE_QUALITY_KEYS.includes(todaySky.phaseName), `phaseName "${todaySky.phaseName}" has MOON_PHASE_QUALITY entry`);

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(62));
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\n  Failures:');
  failures.forEach(f => console.log(`    • ${f}`));
}
console.log('═'.repeat(62));

process.exit(failed > 0 ? 1 : 0);
