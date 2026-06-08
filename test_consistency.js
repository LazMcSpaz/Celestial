#!/usr/bin/env node
/**
 * test_consistency.js — Celestial Cross-Spot Rendering Consistency Suite
 *
 * Answers: "When the same underlying data is shown in more than one place,
 *           do all those places agree?"
 *
 * Unlike the other suites (which test the math/values), this one boots the
 * REAL app code under a lightweight DOM shim, runs the actual render
 * functions, and compares what each *spot* of the UI ends up displaying:
 *
 *   • Today screen   — greeting, daily read, energy tiles, lunar snapshot,
 *                      retrograde list, key-aspect card
 *   • Sky screen     — per-planet position + retrograde rows
 *
 * The point is to catch divergence: the Moon shown as Leo in one card and
 * Virgo in another, a planet called "retrograde" in prose but "Direct" in the
 * sky list, an `undefined` leaking from a missing lookup entry, or the two
 * screens disagreeing because they recompute the sky independently.
 *
 * Approach: extract the two inline <script> blocks from index.html, eval them
 * inside a captured-DOM sandbox with a frozen Date and seeded localStorage,
 * then read the rendered output back out of the stub elements.
 *
 * Run:  TZ=UTC node test_consistency.js
 */

'use strict';
process.env.TZ = 'UTC';

const fs = require('fs');
const path = require('path');

// ─── Harness ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const R='\x1b[0m',G='\x1b[32m',RED='\x1b[31m',Y='\x1b[33m',C='\x1b[36m',B='\x1b[1m',D='\x1b[2m';
const ok   = (m) => { passed++; console.log(`  ${G}✓${R} ${m}`); };
const fail = (m) => { failed++; console.log(`  ${RED}✗${R} ${m}`); };
const info = (m) => console.log(`  ${D}ℹ ${m}${R}`);
const sec  = (t) => console.log(`\n${B}${C}${'═'.repeat(64)}${R}\n${B}${t}${R}`);
const assert = (label, cond, detail='') => cond ? ok(`${label}${detail?` — ${detail}`:''}`)
                                                 : fail(`${label}${detail?` — ${detail}`:''}`);

// ─── Minimal capturing DOM / browser shim ───────────────────────────────────
// FakeEl records innerHTML / textContent so we can read back what was rendered.
class FakeEl {
  constructor(id) {
    this.id = id || '';
    this._html = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.className = '';
    this.style = new Proxy({}, { get: (t,k)=>t[k]??'', set:(t,k,v)=>{t[k]=v;return true;} });
    this.dataset = {};
    this.children = [];
    this.classList = {
      _s: new Set(),
      add:(...c)=>c.forEach(x=>this.classList._s.add(x)),
      remove:(...c)=>c.forEach(x=>this.classList._s.delete(x)),
      toggle:(c)=>{ this.classList._s.has(c)?this.classList._s.delete(c):this.classList._s.add(c); },
      contains:(c)=>this.classList._s.has(c),
    };
  }
  set innerHTML(v){ this._html = v == null ? '' : String(v); }
  get innerHTML(){ return this._html; }
  appendChild(c){ this.children.push(c); return c; }
  removeChild(c){ this.children = this.children.filter(x=>x!==c); return c; }
  append(...c){ c.forEach(x=>this.children.push(x)); }
  insertBefore(c){ this.children.push(c); return c; }
  remove(){}
  setAttribute(k,v){ this[k]=v; }
  getAttribute(k){ return this[k]; }
  removeAttribute(k){ delete this[k]; }
  addEventListener(){}
  removeEventListener(){}
  click(){}
  focus(){}
  blur(){}
  scrollIntoView(){}
  cloneNode(){ return new FakeEl(this.id); }
  contains(){ return false; }
  matches(){ return false; }
  closest(){ return null; }
  querySelector(){ return new FakeEl(); }
  querySelectorAll(){ return []; }
  getBoundingClientRect(){ return {top:0,left:0,right:0,bottom:0,width:0,height:0}; }
  set onclick(_v){ this._onclick = _v; }
  get onclick(){ return this._onclick; }
}

function makeSandbox(fixedISO, seed) {
  const els = {};
  const doc = {
    __els: els,
    getElementById(id){ return els[id] || (els[id] = new FakeEl(id)); },
    createElement(){ return new FakeEl(); },
    createElementNS(){ return new FakeEl(); },
    createTextNode(t){ return { textContent: t }; },
    querySelector(){ return new FakeEl(); },
    querySelectorAll(){ return []; },
    getElementsByClassName(){ return []; },
    addEventListener(){}, removeEventListener(){},
    body: new FakeEl('body'),
    head: new FakeEl('head'),
    documentElement: new FakeEl('html'),
    hidden: false,
    cookie: '',
  };
  const localStorage = (() => {
    const m = new Map(Object.entries(seed || {}));
    return {
      getItem:(k)=> m.has(k) ? m.get(k) : null,
      setItem:(k,v)=> m.set(k, String(v)),
      removeItem:(k)=> m.delete(k),
      clear:()=> m.clear(),
    };
  })();
  const navigator = {
    userAgent:'node', language:'en-US',
    serviceWorker:{ register:()=>Promise.resolve({}) },
    permissions:{ query:()=>Promise.resolve({state:'denied'}) },
  };
  const fetchStub = ()=>Promise.resolve({ ok:true, json:()=>Promise.resolve([]), text:()=>Promise.resolve('') });
  const location = { href:'http://localhost/', reload(){}, assign(){} };
  const Notification = function(){}; Notification.permission='denied';
  Notification.requestPermission=()=>Promise.resolve('denied');
  const noopTimer = ()=>0;
  // Frozen clock: new Date() → fixedISO; new Date(args) → real
  class FrozenDate extends Date {
    constructor(...a){ if(a.length===0) super(fixedISO); else super(...a); }
    static now(){ return new Date(fixedISO).getTime(); }
  }
  const win = {
    innerWidth:390, innerHeight:844, devicePixelRatio:2,
    addEventListener(){}, removeEventListener(){},
    matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){}}),
    getComputedStyle:()=>({getPropertyValue:()=>''}),
    requestAnimationFrame:noopTimer, cancelAnimationFrame:noopTimer,
    scrollTo(){}, location, navigator, localStorage,
    setTimeout:noopTimer, clearTimeout:noopTimer, setInterval:noopTimer, clearInterval:noopTimer,
    Notification, fetch:fetchStub,
  };
  return { els, doc, localStorage, navigator, fetchStub, location, Notification, noopTimer, FrozenDate, win };
}

// ─── Load + boot the real app ───────────────────────────────────────────────
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
// Inline blocks only (the CDN <script src=…> tag has attributes, so it's skipped)
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (blocks.length < 2) { console.error('FATAL: expected 2 inline script blocks, got '+blocks.length); process.exit(1); }

const EXPORT_EPILOGUE = `
;return {
  els: document.__els,
  renderTodayScreen, renderSkyScreen, getSkyData, scoreDay, getPersonalTransits,
  generateGreeting, generateDailyRead,
  QUALITY_NAMES, SCORE_LABEL_D, SCORE_CLASS_D, CLASS_MAP,
  MOON_SIGN_DESC, MOON_PHASE_QUALITY, RETROGRADE_NOTES, MYTH, PLANETS,
  Ephemeris,
};`;

function boot(fixedISO, seed) {
  const sb = makeSandbox(fixedISO, seed);
  const body = blocks.join('\n') + EXPORT_EPILOGUE;
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'document','window','localStorage','navigator','fetch','location',
    'setTimeout','clearTimeout','setInterval','clearInterval',
    'requestAnimationFrame','Notification','Date',
    body
  );
  const api = fn(
    sb.doc, sb.win, sb.localStorage, sb.navigator, sb.fetchStub, sb.location,
    sb.noopTimer, sb.noopTimer, sb.noopTimer, sb.noopTimer,
    sb.noopTimer, sb.Notification, sb.FrozenDate
  );
  return api;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
const TASKS = JSON.stringify([
  { id:'t1', title:'Draft the proposal', task_type:'creative',  energy_required:'focused', emotional_weight:'moderate', repeating:'none' },
  { id:'t2', title:'Call the accountant', task_type:'communicative', energy_required:'low', emotional_weight:'light', repeating:'none' },
  { id:'t3', title:'Review the numbers', task_type:'analytical', energy_required:'deep', emotional_weight:'heavy', repeating:'none' },
]);

const USERS = {
  north: {
    label: 'Northern, time known (NYC 1990)',
    seed: {
      celestial_birth: JSON.stringify({ date:{year:1990,month:6,day:15}, timeKnown:true, time:{hour:14,minute:30}, lat:40.71, lon:-74.01, cityName:'New York', timezone:'America/New_York' }),
      celestial_loc:   JSON.stringify({ lat:40.71, lon:-74.01, name:'New York', timezone:'America/New_York' }),
      celestial_prefs: JSON.stringify({ chronotype:'morning', workStyle:'deep', season:'building', cultivating:'focus' }),
      celestial_onboarded:'1', celestial_tasks: TASKS,
    },
  },
  south: {
    label: 'Southern hemisphere (Sydney 1985)',
    seed: {
      celestial_birth: JSON.stringify({ date:{year:1985,month:11,day:3}, timeKnown:true, time:{hour:9,minute:5}, lat:-33.87, lon:151.21, cityName:'Sydney', timezone:'Australia/Sydney' }),
      celestial_loc:   JSON.stringify({ lat:-33.87, lon:151.21, name:'Sydney', timezone:'Australia/Sydney' }),
      celestial_prefs: JSON.stringify({ chronotype:'evening', workStyle:'bursts', season:'change', cultivating:'courage' }),
      celestial_onboarded:'1', celestial_tasks: TASKS,
    },
  },
};

// Viewing dates chosen to exercise varied sky conditions across the year
const DATES = [
  '2026-03-20T12:00:00Z', // equinox
  '2026-06-21T12:00:00Z', // solstice
  '2026-01-11T12:00:00Z', // mid-winter
  '2026-09-07T12:00:00Z', // early autumn
  '2026-12-31T18:00:00Z', // year boundary
  '2027-04-15T08:00:00Z', // future date
];

// ─── Helpers to parse rendered output ────────────────────────────────────────
const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
// Tokens that must never reach the user as *visible* text. (We strip tags first,
// so JS args inside attributes like onclick="…,null,…" don't count.)
const BAD_TOKENS = ['undefined','NaN','[object Object]'];

function htmlOf(els, id){ return (els[id] && els[id].innerHTML) || ''; }
function textOf(els, id){ return (els[id] && (els[id].textContent || els[id].innerHTML)) || ''; }
// Visible text: drop all tags (and their attributes), collapse whitespace.
function visibleText(html){ return String(html).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }

// Moon sign from lunar snapshot: `<div class="lunar-title">${phase} in ${sign}</div>`
function lunarSign(els){
  const m = htmlOf(els,'lunar-snapshot').match(/lunar-title">[^<]*\bin\s+([A-Za-z]+)</);
  return m ? m[1] : null;
}
// Sky screen rows are appended children of #sky-planet-list
function skyRows(els){
  const list = els['sky-planet-list'];
  return list ? list.children.map(c => c.innerHTML || '') : [];
}
function skyMoonSign(els){
  const row = skyRows(els).find(h => /sky-name">Moon</.test(h));
  if(!row) return null;
  const m = row.match(/sky-pos">\s*\d+°\s+([A-Za-z]+)/);
  return m ? m[1] : null;
}
function skyRetroSet(els){
  return new Set(skyRows(els).filter(h=>/· Retrograde/.test(h))
    .map(h=>{ const m=h.match(/sky-name">([A-Za-z ]+)</); return m?m[1].trim():null; }).filter(Boolean));
}
function retroListSet(els){
  const h = htmlOf(els,'retrograde-list');
  const out = new Set();
  for(const m of h.matchAll(/rx-name">([A-Za-z ]+?)(?:<| \()/g)) out.add(m[1].trim());
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
sec('1 ·  Score → severity systems agree (the two label/class sets)');
// The dashboard tiles (SCORE_LABEL_D / SCORE_CLASS_D) abbreviate vs the detail
// sheet (QUALITY_NAMES / CLASS_MAP). Abbreviation is fine — but the *severity*
// each index maps to must never contradict, or one spot would show "Favorable"
// where another shows "Caution" for the same score.
{
  const api = boot(DATES[0], USERS.north.seed);
  const sev = (s) => {
    const x = s.toLowerCase();
    if (/neutral/.test(x)) return 'neutral';
    if (/(caution|challeng|difficult)/.test(x)) return 'negative';
    return 'positive';
  };
  const A = api.QUALITY_NAMES, Bb = api.SCORE_LABEL_D, CC = api.SCORE_CLASS_D, DD = api.CLASS_MAP;
  assert('QUALITY_NAMES and SCORE_LABEL_D are both length 6', A.length===6 && Bb.length===6, `${A.length}/${Bb.length}`);
  assert('SCORE_CLASS_D and CLASS_MAP are both length 6', CC.length===6 && DD.length===6, `${CC.length}/${DD.length}`);
  let mism = [];
  for (let i=0;i<6;i++) if (sev(A[i]) !== sev(Bb[i])) mism.push(`idx${i}: "${A[i]}" vs "${Bb[i]}"`);
  assert('Detail-sheet and dashboard labels share the same severity at every score', mism.length===0, mism.join('; ') || 'all 6 consistent');
  // Class severity (good-* / caution / challenging vs ei-* equivalents)
  const csev = (c) => /caution|challeng/.test(c) ? 'negative' : /neutral/.test(c) ? 'neutral' : 'positive';
  let cmism = [];
  for (let i=0;i<6;i++) if (csev(CC[i]) !== csev(DD[i])) cmism.push(`idx${i}: "${CC[i]}" vs "${DD[i]}"`);
  assert('SCORE_CLASS_D and CLASS_MAP share the same severity at every score', cmism.length===0, cmism.join('; ') || 'all 6 consistent');
}

// ════════════════════════════════════════════════════════════════════════════
sec('2 ·  Lookup tables are complete (no spot can silently fall back differently)');
{
  const api = boot(DATES[0], USERS.north.seed);
  const missSign = SIGNS.filter(s => !api.MOON_SIGN_DESC[s]);
  assert('MOON_SIGN_DESC covers all 12 zodiac signs', missSign.length===0, missSign.join(', ')||'complete');
  // Every phase name the engine can emit must have a MOON_PHASE_QUALITY entry
  const phases = new Set();
  for (let d=0; d<30; d++) {
    const sky = api.getSkyData(new Date(Date.UTC(2026,0,1+d,12,0,0)), false);
    if (sky && sky.phaseName) phases.add(sky.phaseName);
  }
  const missPhase = [...phases].filter(p => !api.MOON_PHASE_QUALITY[p]);
  assert('MOON_PHASE_QUALITY covers every phase name the engine emits', missPhase.length===0, [...phases].join(', '));
  // Myth name for every rendered planet
  const missMyth = api.PLANETS.map(p=>p.key).filter(k => !api.MYTH[k]);
  // (Some outer bodies legitimately have no myth alias; we only require the ones used in prose.)
  info(`PLANETS without a MYTH alias (rendered as plain name): ${missMyth.join(', ')||'none'}`);
  assert('MYTH aliases, where present, are non-empty strings', Object.values(api.MYTH).every(v=>typeof v==='string'&&v.length>0));
}

// ════════════════════════════════════════════════════════════════════════════
sec('3 ·  Cross-spot agreement on the rendered screen (swept over users × dates)');
let sweepCells = 0;
for (const ukey of Object.keys(USERS)) {
  const user = USERS[ukey];
  for (const date of DATES) {
    sweepCells++;
    let api;
    try { api = boot(date, user.seed); }
    catch (e) { fail(`[${ukey} @ ${date.slice(0,10)}] boot threw: ${e.message}`); continue; }
    const els = api.els;
    const tag = `${ukey} @ ${date.slice(0,10)}`;

    // also render the Sky screen so we can compare the two screens
    try { api.renderSkyScreen(); } catch (e) { fail(`[${tag}] renderSkyScreen threw: ${e.message}`); }

    // 3a — no broken/leaked tokens anywhere a user reads
    const spots = ['today-greeting','daily-read-text','energy-indicators','lunar-snapshot','retrograde-list','key-aspect-card'];
    let dirty = [];
    for (const id of spots) {
      const raw = htmlOf(els,id);
      const vis = visibleText(raw) + ' ' + (els[id]?.textContent || '');
      for (const bad of BAD_TOKENS) if (vis.includes(bad)) dirty.push(`${id}:"${bad}"`);
      if (/<em>\s*<\/em>/.test(raw)) dirty.push(`${id}:empty <em>`); // empty emphasis = missing fragment
    }
    assert(`[${tag}] no undefined/NaN/object/empty-fragment leaks in any spot`, dirty.length===0, dirty.join(', '));

    // 3b — Moon sign agrees: lunar snapshot ↔ daily read ↔ sky screen
    const lSign = lunarSign(els);
    const sSign = skyMoonSign(els);
    if (lSign && sSign) {
      assert(`[${tag}] Today lunar card & Sky screen show the same Moon sign`, lSign===sSign, `${lSign} vs ${sSign}`);
    } else {
      info(`[${tag}] could not parse Moon sign (lunar=${lSign}, sky=${sSign})`);
    }
    if (lSign) {
      const desc = api.MOON_SIGN_DESC[lSign];
      const read = htmlOf(els,'daily-read-text');
      // Daily read mentions the Moon via its sign-description; it must match the card's sign.
      assert(`[${tag}] daily read's Moon description matches the lunar card's sign`, read.includes(desc), `expected "${desc}"`);
    }

    // 3c — Retrograde agreement: prose ⊆ retrograde list, and list == sky screen
    const listSet = retroListSet(els);
    const skySet  = api ? skyRetroSet(els) : new Set();
    // sky screen and the dashboard retrograde card must name the same planets
    const onlyList = [...listSet].filter(p=>!skySet.has(p));
    const onlySky  = [...skySet ].filter(p=>!listSet.has(p));
    assert(`[${tag}] retrograde set matches between dashboard card and Sky screen`, onlyList.length===0 && onlySky.length===0,
           (onlyList.length?`card-only: ${onlyList}`:'') + (onlySky.length?` sky-only: ${onlySky}`:'') || `{${[...listSet].join(',')}}`);
    // Any planet the prose calls retrograde must actually be flagged retrograde
    const prose = (textOf(els,'today-greeting')+' '+htmlOf(els,'daily-read-text'));
    let hallucinated = [];
    for (const p of Object.keys(api.RETROGRADE_NOTES)) {
      const note = api.RETROGRADE_NOTES[p];
      const head = note.split(' — ')[0];
      const cited = prose.includes(note) || prose.includes(head);
      if (cited && !listSet.has(p) && !skySet.has(p)) hallucinated.push(p);
    }
    assert(`[${tag}] prose never calls a planet retrograde that the engine didn't flag`, hallucinated.length===0, hallucinated.join(', '));

    // 3d — energy tiles: exactly 4, labels/classes from the canonical sets
    const ei = htmlOf(els,'energy-indicators');
    const labels = [...ei.matchAll(/ei-label">([^<]+)</g)].map(m=>m[1]);
    const classes = [...ei.matchAll(/ei-tile (ei-[a-z]+)/g)].map(m=>m[1]);
    assert(`[${tag}] energy indicators render exactly 4 tiles`, labels.length===4, `got ${labels.length}`);
    const badLabel = labels.filter(l=>!api.SCORE_LABEL_D.includes(l));
    assert(`[${tag}] every energy tile label is from SCORE_LABEL_D`, badLabel.length===0, badLabel.join(', '));
    const badClass = classes.filter(c=>!api.SCORE_CLASS_D.includes(c));
    assert(`[${tag}] every energy tile class is from SCORE_CLASS_D`, badClass.length===0, badClass.join(', '));
  }
}
info(`swept ${sweepCells} (user × date) cells`);

// ════════════════════════════════════════════════════════════════════════════
sec('4 ·  Determinism — independent recomputes (Today vs Sky) never diverge');
// renderTodayScreen computes one sky snapshot; the Sky screen and surfaced-task
// renderers each call getSkyData() again. They must produce byte-identical
// output for the same instant, or two spots could disagree by a race.
{
  const a = boot(DATES[1], USERS.north.seed);
  const b = boot(DATES[1], USERS.north.seed);
  const ids = ['today-greeting','daily-read-text','energy-indicators','lunar-snapshot','retrograde-list','key-aspect-card'];
  let diverged = [];
  for (const id of ids) if (htmlOf(a.els,id) !== htmlOf(b.els,id) && textOf(a.els,id)!==textOf(b.els,id)) diverged.push(id);
  assert('Two independent boots of the same instant render identical spots', diverged.length===0, diverged.join(', '));
  // getSkyData called twice for the same instant returns the same scores
  const now = new Date(DATES[1]);
  const s1 = [0,1,2,3].map(c=>a.scoreDay(a.getSkyData(now,true),c));
  const s2 = [0,1,2,3].map(c=>a.scoreDay(a.getSkyData(now,true),c));
  assert('scoreDay is stable across repeated getSkyData calls for one instant', JSON.stringify(s1)===JSON.stringify(s2), `[${s1}]`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${B}${C}${'═'.repeat(64)}${R}`);
console.log(`  Results: ${G}${passed} passed${R}, ${failed?RED:''}${failed} failed${R}`);
console.log(`${B}${C}${'═'.repeat(64)}${R}`);
if (failed) { console.log(`\n  ${RED}${B}OVERALL: FAIL${R}\n`); process.exit(1); }
console.log(`\n  ${G}${B}OVERALL: PASS — all spots agree.${R}\n`);
