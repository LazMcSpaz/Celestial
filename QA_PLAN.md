# Celestial — QA / QC Plan (Accuracy)

*Living document. Created 2026-06-08. Owner: founder + Claude.*

> **Premise:** The app is pointless if it isn't accurate. "Accurate" here means two
> distinct things that must both hold:
> 1. **The astronomy is correct** — planetary positions, natal charts, and
>    transit-to-natal aspects match real-world ephemeris ground truth for *any*
>    birth date and *any* viewing date.
> 2. **The words faithfully reflect the math** — the advice a user reads is a
>    truthful, grammatical, contradiction-free rendering of the astrology that was
>    actually computed for them, today.
>
> Existing tests are strong on (1) and weak on (2). This plan closes (2) and
> hardens (1).

---

## 0. How advice is actually produced (read this first)

A common mental model is that Celestial stores "pre-prepared text for every possible
arrangement" and looks up the right paragraph. **That is not how it works**, and the
QA strategy depends on understanding the real pipeline:

```
birth data ──► computeNatalChart ──► natal positions + houses
viewing date ─► Ephemeris (positions) ─► transit positions
                          │
                          ├─► getPersonalTransits()  → active transit-to-natal aspects
                          ├─► getSkyData()           → general sky (mutual aspects, Moon phase, retrogrades)
                          └─► scoreDay(cat)          → per-category score 0–5
                                      │
       small reusable fragments      ▼
   (MYTH, MOON_SIGN_DESC,    ──►  generateDailyRead()      → the atmospheric paragraph
    MOON_PHASE_QUALITY,           generateGreeting()       → one-line greeting
    ZODIAC_DESCS, ASPECTS,        generateHeadline()       → headline
    catIntro, …)                  buildAspectDescription() → per-aspect sentence
                                  getSurfaceReason()       → why a task surfaced
```

The user-facing copy is **composed at runtime** by stitching computed values into
template fragments. The combinatorial space is enormous (every planet × every aspect ×
every natal placement × every Moon phase × cycle phase × category), so it cannot be
enumerated and proofread by hand. **The accuracy risk is therefore in the *seams*:** a
missing fragment renders as `undefined`, two fragments contradict each other, a myth
name mismatches its planet, or grammar breaks ("Mercury are retrograde").

This is the layer current tests barely touch. It is the centre of this plan (Layer 4).

---

## 1. Current coverage (baseline — all passing today)

| Suite | Checks | What it proves | Layer |
|---|---:|---|---|
| `verify_positions.js` | 32 | Planet/Moon longitudes match equinoxes, J2000, 2024-01-01, lunar phases, JDN formula | L0 astronomy |
| `test_birth_charts.js` | 59 | Natal charts for Diana / Obama / Einstein within Swiss-Ephemeris tolerance; sign matches exact | L1 natal |
| `test_personalization.js` | 29 | Same date→two users differ; same user→two dates differ; orb filtering; score modifiers | L2 personalization |
| `test_accuracy.js` | 245 | Field population, display logic, score-system correctness, phase-quality table completeness | L3 logic |
| `test_consistency.js` | 105 | Cross-spot/cross-screen rendering agreement — boots real app under a DOM shim and compares what each UI spot displays | L5 consistency |
| `test_glue.js` | 43 | Production glue the value-suites bypass — `computeNatalChart` birth-time parsing, unknown-time house suppression, `getTzOffset` host-invariance, live-UTC instant, Lilith/Chiron/True-Node signs, surface-reason↔deadline agreement, surfaced=prefix, greeting↔tiles reconciliation, repeating cadence | glue/regression |
| **Total** | **513** | | |

> Run everything under three host timezones to guard against TZ leakage:
> `for Z in UTC America/New_York Asia/Kolkata; do TZ=$Z node verify_positions.js && TZ=$Z node test_birth_charts.js && TZ=$Z node test_personalization.js && TZ=$Z node test_accuracy.js && TZ=$Z node test_consistency.js && TZ=$Z node test_glue.js; done`
>
> **Accuracy fixes shipped** (see git history): natal birth-time parsing (was nulling every birth-time chart), host-invariant `getTzOffset`, live-sky true-UTC instant, unknown-time house suppression, Black Moon Lilith rate, Chiron Keplerian model, **VSOP87D outer planets (Saturn/Uranus/Neptune <0.01°)**, True North Node, plus surfacing/recurrence/greeting fixes. The `test_harness.js` shared boot harness drives the real app under a DOM shim.

**Run all:** `TZ=UTC node verify_positions.js && TZ=UTC node test_birth_charts.js && TZ=UTC node test_personalization.js && TZ=UTC node test_accuracy.js`

**Honest gaps in the baseline:**
- Only **3 birth charts**, all 19th–20th century, northern hemisphere, 3 of them with known times. No southern hemisphere, no unknown-birth-time path, no edge dates (leap day, year boundaries, pre-1900 / far-future).
- Only a **handful of viewing dates**. No systematic sweep across a year, no retrograde-station days, no eclipse/ingress days.
- **Timezone is forced to UTC** in every suite (`process.env.TZ='UTC'`). Real users span every zone — DST transitions, half-hour zones (India), and the date-line are completely untested. This is the single most likely place for a silent off-by-a-day error.
- **The generated text is never asserted on.** Tests check the numbers and that fields are *populated*; nothing checks that the sentence a user reads is correct, consistent, or free of `undefined`/grammar breaks.

---

## 2. The accuracy layers & test strategy

### Layer 0 — Astronomical ground truth (positions)
*Goal: for any date, every body's longitude is right.*

- **Keep** `verify_positions.js` as the anchor.
- **Expand the date matrix** (new: `test_ephemeris_sweep.js`):
  - One position snapshot per month for ±5 years around today, each cross-checked against an external authority (NASA Horizons / Swiss Ephemeris reference values committed as fixtures).
  - **Retrograde stations** for Mercury, Venus, Mars, Jupiter, Saturn across the next 2 years — assert `isRetrograde()` flips on the correct calendar day (±1 day).
  - **Ingress days** — assert each planet's sign changes on the documented date.
  - Tolerances already established: fast bodies ≤1.5°, Moon ≤2.5°, slow bodies tighter.
- **Boundary dates:** Feb 29 (leap), Dec 31→Jan 1, year 1899/1900 (Julian/Gregorian-adjacent sanity), year 2100.

### Layer 1 — Natal chart accuracy (birth data → chart)
*Goal: any birth date/time/place yields the correct chart.*

- **Expand the reference set** in `test_birth_charts.js` from 3 → ~10 subjects, deliberately covering:
  - **Southern hemisphere** (e.g. a Sydney or Buenos Aires birth) — houses/ascendant are most error-prone here.
  - **Unknown birth time** — assert houses are *suppressed* (not silently wrong) and the app's "approximate" framing path is exercised.
  - **Half-hour timezone** (India +5:30) and a **DST-born** subject.
  - **Equatorial / high-latitude** births (house systems degrade near the poles — assert graceful behaviour, not crash).
  - **Date-line-adjacent** birth (Fiji / Samoa).
- Assert: sign placements exact; degrees within tolerance; ascendant within ~2°; house cusps present only when time known.

### Layer 2 — Transit-to-natal personalization
*Goal: the advice genuinely depends on the user's chart AND the date.*

- **Keep & broaden** `test_personalization.js`. Add a **differential matrix**: N reference users × M dates → assert the set of active aspects is distinct per cell and matches independently computed expectations.
- Assert **directionality**: a benefic applying trine raises the relevant category score; a malefic applying square lowers it (already partially tested — extend to all aspect/planet pairs).
- Assert **orb correctness**: an aspect just inside orb is active, just outside is not (boundary test on each orb threshold).

### Layer 3 — Scoring & surfacing logic
*Goal: scores and the tasks that surface are a correct function of the day.*

- **Keep** `test_accuracy.js`. Add:
  - **Surfacing determinism & relevance:** seed a fixed task set, assert the surfaced 1–2 tasks are the highest-scoring against the day, and the surface *reason* names a planet/aspect that is actually active today (cross-check against `getPersonalTransits`).
  - **Deadline-conflict detection:** task with deadline on a Caution/Challenging day → flag fires; on a good day → no flag.
  - **Score monotonicity:** no category ever scores outside 0–5; CLASS_MAP / QUALITY_NAMES indices never out of range.

### Layer 4 — Text rendering fidelity ⭐ (the main gap)
*Goal: every sentence a user could ever read is truthful, complete, and well-formed.*

This is a new suite (`test_copy_integrity.js`) run as a **combinatorial fuzz sweep**, because the space is too large to enumerate by hand. For a large sample of (synthetic user × date) pairs spanning the matrix in §3, generate the **actual** `generateDailyRead`, `generateGreeting`, `generateHeadline`, `buildAspectDescription`, and `getSurfaceReason` output and assert:

1. **No `undefined` / `null` / `NaN` / empty fragment** ever appears in user-facing text. (Catches missing entries in MYTH, MOON_SIGN_DESC, catIntro, etc. — the #1 risk of procedural composition.)
2. **Myth/planet integrity:** wherever a myth name appears (Hermes, Aphrodite…), it maps to the correct planet per `MYTH`; no planet is described with another's archetype.
3. **Grammar/number agreement:** singular vs plural verbs ("Mercury *is* retrograde" vs "Mercury and Venus *are* retrograde") — assert via the known pluralization branches; no double spaces, no orphan punctuation, no sentence fragments.
4. **Internal consistency (no contradictions):** the Moon sign/phase named in the read matches the computed sky; a category called "favorable" in prose is not scored Caution in the indicators; the greeting's mood matches the day's dominant score; a planet called "quiet" is not also cited as forming a major aspect.
5. **Faithfulness to the math:** every astrological claim in the prose corresponds to a value `getSkyData`/`getPersonalTransits` actually returned for that input (no hallucinated aspects). Implement by tagging composition output with the source values and asserting each rendered claim traces back.
6. **Coverage of fragment tables:** assert every key in MYTH, MOON_SIGN_DESC, MOON_PHASE_QUALITY, ZODIAC_DESCS, ASPECTS, catIntro is reachable and non-empty — and that the renderers have a fallback when a value is genuinely absent (the `||` fallbacks like "The sky is broadly neutral…" should be deliberately exercised, not accidentally hit).

### Layer 5 — End-to-end dashboard consistency  ✅ *(initial suite delivered: `test_consistency.js`, 105 checks)*
*Goal: the whole screen agrees with itself for a real user on a real day.*

**Delivered:** `test_consistency.js` boots the real app code under a lightweight
capturing-DOM shim (no jsdom dependency — keeps the zero-dep pattern), with a
frozen clock and seeded birth/location, then reads back what each spot actually
rendered and asserts agreement across a (2 users × 6 dates) sweep:
- Today lunar card ↔ Sky screen show the **same Moon sign**.
- Daily-read Moon description matches the lunar card's sign.
- Retrograde set is **identical** between the dashboard card and the Sky screen.
- Prose never calls a planet retrograde that the engine didn't flag.
- Energy tiles: exactly 4, labels/classes drawn only from the canonical sets.
- The two score→label and score→class systems share the **same severity** at every score.
- Lookup tables (MOON_SIGN_DESC, MOON_PHASE_QUALITY) are complete so no spot falls back differently.
- No `undefined`/`NaN`/`[object Object]`/empty-fragment leaks in any visible spot.
- Determinism: two independent boots of the same instant render byte-identical spots.

**Still open (follow-on):**
- Energy-indicator color ↔ numeric score (assert tile class index == score, not just membership).
- Surfaced tasks ↔ "all tasks for today" ordering (surfaced = score-sorted prefix).
- A real browser pass (Playwright) for layout/visual regressions the shim can't see.
- Earlier idea retained: a headless render test that boots the app with a seeded user + frozen date and asserts the **rendered DOM**:
  - greeting, daily read, the 4 energy indicators, surfaced tasks, "coming up" all derive from the *same* `skyData` snapshot;
  - energy-indicator colors match the numeric category scores;
  - "See all tasks for today" list is ordered by score;
  - empty states use the mythological voice, never "No tasks found."
- This is also where **timezone correctness** gets verified end-to-end (see §4).

---

## 3. The test matrix (birthdates × dates)

The user asked specifically to "test different birthdates" and "test different dates."
Both axes are parameterized and shared across Layers 1, 2, 4, 5.

**Birth-data axis (≈12 fixtures):**
| # | Why it's in the set |
|---|---|
| Diana / Obama / Einstein | existing Swiss-Ephemeris anchors (regression) |
| Sydney birth | southern hemisphere houses/ascendant |
| India birth | +5:30 half-hour zone |
| US birth during DST | DST offset correctness |
| Unknown birth time | house-suppression path |
| Fiji / Samoa birth | date-line edge |
| Reykjavík / Tromsø birth | high-latitude house degradation |
| Leap-day birth (Feb 29) | calendar edge |
| Pre-1900 + post-2050 birth | far-date ephemeris stability |

**Viewing-date axis (≈15 dates):**
- Today; the 4 solstice/equinox days; a New Moon and a Full Moon; a Mercury-retrograde-station day; a major-ingress day; an eclipse day; Feb 29; Dec 31 / Jan 1; one date 5 years out.

Every Layer-4/5 assertion runs over the **cross product** (≈12 × 15 = 180 cells), sampled or exhaustive depending on cost.

---

## 4. Timezone & DST — dedicated focus (highest silent-risk area)

Because all current suites force `TZ=UTC`, this gets its own track (`test_timezone.js`):
- Same birth moment entered from 6 zones (UTC, NY-EST, NY-EDT, India +5:30, Tokyo, Auckland incl. NZ DST, and a date-line pair) must yield the **same natal chart**.
- "Today's" sky for a user at 23:30 local vs 00:30 local must roll the date correctly — no off-by-one day in the daily read.
- Morning-brief scheduling fires at the user's *local* chosen time, not UTC.
- Run the **whole suite under 3 different host TZ env values** in CI to catch host-timezone leakage.

---

## 5. Regression / golden-master

- For a frozen matrix of (user × date), snapshot the full generated output (scores + every sentence) into committed `__golden__/*.json` fixtures.
- CI diffs current output against golden; any change to copy or scoring must be an intentional, reviewed fixture update. This is what stops a future edit from silently corrupting advice for some unseen combination.

---

## 6. Manual / human QA (what automation can't judge)

Automation proves *correct and consistent*; a human proves *good*. A short scripted
manual pass per release:
- Read 10 daily reads across varied users/dates aloud — does each sound like the brand voice, and is the advice *plausible* for the cited astrology?
- Spot-check 3 charts against astro.com by hand.
- Walk onboarding on a real phone (iOS Safari + Android Chrome) including the unknown-birth-time and skip-cycle paths.
- Verify nothing reads as clinical, jargon-y, or like a horoscope cliché.

---

## 7. Tooling, CI, and sequencing

**Harness:** keep the existing zero-dependency Node pattern (extract IIFE from
`index.html`, `eval`, assert). Add jsdom only for Layer 5 DOM tests. Consider extracting
the engine into a module later to avoid `eval`, but not required to start.

**CI:** GitHub Actions on the working branch — run all suites under `TZ=UTC`,
`TZ=America/New_York`, and `TZ=Asia/Kolkata`; fail the build on any failure or golden
diff. Wire as a SessionStart hook so web sessions can run it too.

**Suggested build order (highest accuracy-risk-per-effort first):**
1. **Layer 4 copy-integrity sweep** — biggest gap, catches `undefined`/contradiction bugs users would actually see. *(new: `test_copy_integrity.js`)*
2. **Timezone/DST track** — highest silent-risk. *(new: `test_timezone.js`)*
3. **Expand birthdate & date matrices** into existing L1/L2 suites.
4. **Ephemeris sweep + retrograde/ingress stations.** *(new: `test_ephemeris_sweep.js`)*
5. **Golden-master snapshots + CI.**
6. **Layer 5 DOM consistency** *(jsdom/Playwright)*.
7. **Manual QA checklist** formalized into a release template.

**Definition of done (accuracy):** a release ships only when all suites pass under all
three host timezones, golden master is clean or intentionally updated, and the manual
pass is signed off.
