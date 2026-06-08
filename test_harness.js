/**
 * test_harness.js — shared boot harness for Celestial test suites.
 *
 * Loads the real app code from index.html and runs it under a lightweight
 * capturing-DOM shim (no jsdom — keeps the zero-dependency pattern), with a
 * frozen clock and seeded localStorage. `boot(fixedISO, seed)` returns an `api`
 * exposing the rendered element map plus the app's real functions/constants so
 * tests can drive and inspect the actual production code paths.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ─── Minimal capturing DOM / browser shim ───────────────────────────────────
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

// ─── Load the real app's inline script blocks ───────────────────────────────
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
// Inline blocks only (the CDN <script src=…> tag has attributes, so it's skipped)
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (blocks.length < 2) { throw new Error('expected ≥2 inline script blocks, got ' + blocks.length); }

// Everything the suites need, exported from the app's top-level scope.
const EXPORT_EPILOGUE = `
;return {
  els: document.__els,
  renderTodayScreen, renderSkyScreen, getSkyData, scoreDay, getPersonalTransits,
  generateGreeting, generateDailyRead,
  computeNatalChart, loadNatalChart, fmtBirthTime, getTzOffset,
  surfaceTasks, showAllTasks, getSurfaceReason, fmtDeadline,
  toggleTaskComplete, loadTasks, rollDueRepeats,
  get natalChart(){ return natalChart; },
  QUALITY_NAMES, SCORE_LABEL_D, SCORE_CLASS_D, CLASS_MAP,
  MOON_SIGN_DESC, MOON_PHASE_QUALITY, RETROGRADE_NOTES, NATAL_ASP_HINTS, MYTH, PLANETS,
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
  return fn(
    sb.doc, sb.win, sb.localStorage, sb.navigator, sb.fetchStub, sb.location,
    sb.noopTimer, sb.noopTimer, sb.noopTimer, sb.noopTimer,
    sb.noopTimer, sb.Notification, sb.FrozenDate
  );
}

// ─── Shared fixtures (CORRECT internal field shapes) ─────────────────────────
// Tasks use the app's internal camelCase fields (taskType/energyRequired/…),
// not the snake_case DB-row shape. Birth time is the object onboarding stores.
const TASKS = JSON.stringify([
  { id:'t1', title:'Draft the proposal',  taskType:'creative',      energyRequired:'focused', emotionalWeight:'moderate', repeating:'none' },
  { id:'t2', title:'Call the accountant',  taskType:'communicative', energyRequired:'low',     emotionalWeight:'light',    repeating:'none' },
  { id:'t3', title:'Review the numbers',   taskType:'analytical',    energyRequired:'deep',    emotionalWeight:'heavy',    repeating:'none' },
]);

const USERS = {
  north: {
    label: 'Northern, time known (NYC 1990)',
    seed: {
      celestial_birth: JSON.stringify({ date:{year:1990,month:6,day:15}, timeKnown:true, time:{hour24:14,minute:30,hour12:2,ampm:'PM'}, lat:40.71, lon:-74.01, cityName:'New York', timezone:'America/New_York' }),
      celestial_loc:   JSON.stringify({ lat:40.71, lon:-74.01, name:'New York', timezone:'America/New_York' }),
      celestial_prefs: JSON.stringify({ chronotype:'morning', workStyle:'deep', season:'building', cultivating:'focus' }),
      celestial_onboarded:'1', celestial_tasks: TASKS,
    },
  },
  south: {
    label: 'Southern hemisphere (Sydney 1985)',
    seed: {
      celestial_birth: JSON.stringify({ date:{year:1985,month:11,day:3}, timeKnown:true, time:{hour24:9,minute:5,hour12:9,ampm:'AM'}, lat:-33.87, lon:151.21, cityName:'Sydney', timezone:'Australia/Sydney' }),
      celestial_loc:   JSON.stringify({ lat:-33.87, lon:151.21, name:'Sydney', timezone:'Australia/Sydney' }),
      celestial_prefs: JSON.stringify({ chronotype:'evening', workStyle:'bursts', season:'change', cultivating:'courage' }),
      celestial_onboarded:'1', celestial_tasks: TASKS,
    },
  },
};

module.exports = { boot, makeSandbox, USERS, TASKS };
