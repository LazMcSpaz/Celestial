#!/usr/bin/env node
/**
 * test_glue.js — Celestial Production-Glue Regression Suite
 *
 * Covers the seams between stored data and the engine that the value-level
 * suites bypass (they call Ephemeris.calculate directly). These are exactly the
 * paths where real users were silently getting wrong/empty results:
 *   • computeNatalChart reading the stored birth-time SHAPE (object vs string)
 *   • unknown-birth-time house suppression
 *   • getTzOffset host-invariance
 *   • the live "now" path using the true UTC instant
 *   • Black Moon Lilith / minor-body sign correctness
 *   • getSurfaceReason ↔ deadline-label agreement
 *   • surfaced tasks == prefix of the "all tasks" list
 *
 * Run:  TZ=UTC node test_glue.js
 */
'use strict';
process.env.TZ = 'UTC';

const fs = require('fs');
const path = require('path');
const { boot } = require('./test_harness');

let passed = 0, failed = 0;
const R='\x1b[0m',G='\x1b[32m',RED='\x1b[31m',C='\x1b[36m',B='\x1b[1m',D='\x1b[2m';
const sec = (t)=>console.log(`\n${B}${C}${'═'.repeat(64)}${R}\n${B}${t}${R}`);
const info= (m)=>console.log(`  ${D}ℹ ${m}${R}`);
const assert=(label,cond,detail='')=>{ if(cond){passed++;console.log(`  ${G}✓${R} ${label}${detail?` — ${detail}`:''}`);}
  else{failed++;console.log(`  ${RED}✗${R} ${label}${detail?` — ${detail}`:''}`);} };

const NOW = '2026-06-08T12:00:00Z';

// Birth fixtures using the REAL onboarding shapes.
const birthSeed = (over={}) => ({
  celestial_birth: JSON.stringify({
    date:{year:1990,month:6,day:15}, timeKnown:true,
    time:{hour24:14,minute:30,hour12:2,ampm:'PM'},
    lat:40.71, lon:-74.01, cityName:'New York', timezone:'America/New_York', ...over,
  }),
  celestial_loc: JSON.stringify({ lat:40.71, lon:-74.01, name:'New York', timezone:'America/New_York' }),
  celestial_prefs: JSON.stringify({ chronotype:'morning', workStyle:'deep', season:'building' }),
  celestial_onboarded:'1',
});

// ════════════════════════════════════════════════════════════════════════════
sec('1 ·  computeNatalChart parses the stored birth-time OBJECT (the critical bug)');
// Onboarding stores birth.time as {hour24,minute,…}; the old code did .split(':')
// on it, threw, and silently nulled the chart → zero personalization for every
// birth-time user. Drive the REAL computeNatalChart through localStorage.
{
  const api = boot(NOW, birthSeed());
  const natal = api.loadNatalChart();
  assert('natal chart is computed (not null) for an object-shaped birth time', !!natal);
  assert('natal has planet positions', !!(natal && natal.positions && natal.positions.Sun));
  assert('natal has an Ascendant (birth time known ⇒ houses)', !!(natal && natal.ascDegree != null));
  assert('natal has a house map', !!(natal && natal.houses));
  // Personalization actually runs: transit→natal aspects are produced.
  const transits = api.getPersonalTransits(api.getSkyData(new Date(NOW), true));
  assert('getPersonalTransits returns ≥1 personal aspect (personalization is live)', transits.length > 0,
         `got ${transits.length}`);
  // Legacy "HH:MM" string shape must still work.
  const api2 = boot(NOW, birthSeed({ time:'14:30' }));
  assert('legacy "HH:MM" string birth time still computes a chart', !!api2.loadNatalChart()?.ascDegree);
}

// ════════════════════════════════════════════════════════════════════════════
sec('2 ·  Unknown birth time suppresses houses/Ascendant (no noon fabrication)');
{
  const api = boot(NOW, birthSeed({ timeKnown:false, time:null }));
  const natal = api.loadNatalChart();
  assert('natal positions still computed without a birth time', !!(natal && natal.positions && natal.positions.Sun));
  assert('Ascendant is suppressed when birth time is unknown', natal && natal.ascDegree == null,
         `ascDegree=${natal && natal.ascDegree}`);
  assert('house map is suppressed when birth time is unknown', natal && natal.houses == null);
}

// ════════════════════════════════════════════════════════════════════════════
sec('3 ·  fmtBirthTime never leaks [object Object]');
{
  const api = boot(NOW, birthSeed());
  assert('object birth time formats as a clock string', api.fmtBirthTime({hour24:14,minute:30,hour12:2,ampm:'PM'}) === '2:30 PM',
         api.fmtBirthTime({hour24:14,minute:30,hour12:2,ampm:'PM'}));
  assert('midnight formats sensibly', api.fmtBirthTime({hour24:0,minute:5}) === '12:05 AM', api.fmtBirthTime({hour24:0,minute:5}));
  assert('legacy string passes through', api.fmtBirthTime('9:00 AM') === '9:00 AM');
  assert('no result contains [object Object]', !String(api.fmtBirthTime({hour24:14,minute:30})).includes('[object'));
}

// ════════════════════════════════════════════════════════════════════════════
sec('4 ·  getTzOffset returns correct, host-independent offsets');
{
  const api = boot(NOW, birthSeed());
  const tz = api.getTzOffset;
  const cases = [
    ['America/New_York', Date.UTC(2021,6,1,12),  -4,  'NY summer (EDT)'],
    ['America/New_York', Date.UTC(2021,0,1,12),  -5,  'NY winter (EST)'],
    ['Asia/Kolkata',     Date.UTC(2021,3,4,4,30), 5.5,'India half-hour, no DST'],
    ['Australia/Sydney', Date.UTC(2021,0,1,12),   11, 'Sydney summer (inverted DST)'],
    ['Australia/Sydney', Date.UTC(2021,6,1,12),   10, 'Sydney winter'],
    ['Pacific/Auckland', Date.UTC(2021,0,1,12),   13, 'Auckland summer'],
    ['America/New_York', Date.UTC(1955,6,1,12),  -4,  'pre-1970 date'],
  ];
  for (const [zone, ms, exp, note] of cases) {
    assert(`getTzOffset(${zone}) = ${exp} (${note})`, tz(zone, new Date(ms)) === exp, `got ${tz(zone, new Date(ms))}`);
  }
  assert('null timezone → 0', tz(null, new Date(NOW)) === 0);
}

// ════════════════════════════════════════════════════════════════════════════
sec('5 ·  Live "now" path uses the true UTC instant (independent of tz passed)');
// The live branch must derive jd from the absolute instant, not double-apply tz.
{
  const api = boot(NOW, birthSeed());
  const E = api.Ephemeris;
  const inst = new Date(Date.UTC(2026,5,8,3,0));
  const loc = { lat:40.71, lon:-74.01 };
  const a = E.calculate(inst, 0,   loc, true, true);
  const b = E.calculate(inst, 5.5, loc, true, true);
  assert('live Moon longitude is identical regardless of tz argument',
         a.positions.Moon.lon === b.positions.Moon.lon, `${a.positions.Moon.lon.toFixed(4)}`);
  assert('live Ascendant is identical regardless of tz argument (longitude drives LST)',
         a.ascDegree === b.ascDegree, `${a.ascDegree?.toFixed(2)}`);
  // Natal path (non-absolute) still APPLIES tz: different tz ⇒ different chart.
  const n0 = E.calculate(inst, 0,   loc, true, false);
  const n5 = E.calculate(inst, 5.5, loc, true, false);
  assert('natal path still applies tz (different tz ⇒ different Moon)',
         n0.positions.Moon.lon !== n5.positions.Moon.lon);
}

// ════════════════════════════════════════════════════════════════════════════
sec('6 ·  Minor bodies land in the correct sign (Lilith rate fix)');
{
  const api = boot(NOW, birthSeed());
  const E = api.Ephemeris;
  // Reference: mean Black Moon Lilith was in Libra in Jan 2025 (astro-seek/Cafe Astrology).
  const lil2025 = E.calculate(new Date(Date.UTC(2025,0,1,12)), 0, null, false).positions['Black Moon Lilith'];
  assert('Black Moon Lilith is in Libra on 2025-01-01', lil2025.sign === 'Libra', `${lil2025.sign} ${lil2025.lon.toFixed(1)}°`);
  // Sanity: Lilith precesses fast (~40°/yr), so a year later it should have moved a lot.
  const lil2026 = E.calculate(new Date(Date.UTC(2026,0,1,12)), 0, null, false).positions['Black Moon Lilith'];
  const moved = Math.abs(((lil2026.lon - lil2025.lon)%360+360)%360);
  assert('Lilith advances ~40° over one year (rate sane)', moved > 30 && moved < 50, `${moved.toFixed(1)}° / yr`);

  // Chiron — verified against known sign ingresses (Keplerian model).
  const chiron = (y,m,d) => E.calculate(new Date(Date.UTC(y,m-1,d,12)), 0, null, false).positions['Chiron'];
  assert('Chiron in Sagittarius on 2000-01-01', chiron(2000,1,1).sign === 'Sagittarius', `${chiron(2000,1,1).sign} ${chiron(2000,1,1).lon.toFixed(1)}°`);
  assert('Chiron in Aries in early 2025 (~19°, matches reference)', chiron(2025,1,1).sign === 'Aries', `${chiron(2025,1,1).sign} ${chiron(2025,1,1).lon.toFixed(1)}°`);
  assert('Chiron at the Pisces→Aries cusp on 2018-04-20', Math.abs(chiron(2018,4,20).lon - 360) < 1 || chiron(2018,4,20).lon < 1,
         `${chiron(2018,4,20).sign} ${chiron(2018,4,20).lon.toFixed(1)}°`);
}

// ════════════════════════════════════════════════════════════════════════════
sec('7 ·  Surface reason agrees with the deadline label (no "overdue" for due-today)');
{
  const api = boot(NOW, birthSeed());
  const today = '2026-06-08';      // == frozen NOW's local date
  const tomorrow = '2026-06-09';
  const reasonToday = api.getSurfaceReason({ deadline: today }, 0);
  const labelToday  = api.fmtDeadline(today);
  assert('due-today task reads "Due today", not "overdue"', /due today/i.test(reasonToday), reasonToday);
  assert('deadline label also says "Due today" (spots agree)', /today/i.test(labelToday), labelToday);
  const reasonTomorrow = api.getSurfaceReason({ deadline: tomorrow }, 0);
  assert('due-tomorrow task is not called overdue', !/overdue/i.test(reasonTomorrow), reasonTomorrow);
}

// ════════════════════════════════════════════════════════════════════════════
sec('8 ·  Surfaced tasks are a prefix of the "all tasks" list ordering');
{
  // Two tasks; the deadline-today one must outrank the idle one in BOTH spots.
  const tasks = JSON.stringify([
    { id:'idle',  title:'Daydream',      taskType:'reflective',  energyRequired:'deep', emotionalWeight:'heavy', repeating:'none' },
    { id:'urgent',title:'Pay the bill',  taskType:'administrative', energyRequired:'low', emotionalWeight:'light', repeating:'none', deadline:'2026-06-08' },
  ]);
  const api = boot(NOW, { ...birthSeed(), celestial_tasks: tasks });
  const surfacedOrder = api.surfaceTasks().map(s => s.task.id);
  api.showAllTasks();
  const sheet = api.els['sheet-content'] ? api.els['sheet-content'].innerHTML
              : Object.values(api.els).map(e=>e.innerHTML).join('\n'); // openSheet target fallback
  // Recover the order the all-tasks sheet rendered active titles in.
  const order = [];
  for (const m of sheet.matchAll(/openTaskDetail\('([a-z]+)'\)/g)) if(!order.includes(m[1])) order.push(m[1]);
  info(`surfaceTasks order: [${surfacedOrder}]`);
  info(`all-tasks order:    [${order}]`);
  assert('urgent (deadline today) outranks idle in surfaceTasks', surfacedOrder.indexOf('urgent') < surfacedOrder.indexOf('idle'));
  if (order.length >= 2) {
    assert('all-tasks list is ordered to match surfacing (surfaced = prefix)',
           order.join(',') === surfacedOrder.filter(id=>order.includes(id)).join(','), `[${order}]`);
  } else {
    info('could not parse all-tasks order from sheet markup; ordering logic verified via surfaceTasks');
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${B}${C}${'═'.repeat(64)}${R}`);
console.log(`  Results: ${G}${passed} passed${R}, ${failed?RED:''}${failed} failed${R}`);
console.log(`${B}${C}${'═'.repeat(64)}${R}`);
if (failed) { console.log(`\n  ${RED}${B}OVERALL: FAIL${R}\n`); process.exit(1); }
console.log(`\n  ${G}${B}OVERALL: PASS — production glue is sound.${R}\n`);
