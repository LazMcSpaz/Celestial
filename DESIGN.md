# Celestial — Design Document
*Living document. Last updated: 2026-03-06*

---

## 1. Vision & Positioning

Celestial is a **luxury utility app** at the intersection of astrology, personal rhythm, and intentional productivity. The core premise is that timing matters — not just cosmically but personally — and that the best version of any day is one where what you're doing is aligned with your energy, your cycles, and the planetary climate.

It is not an astrology app that also has tasks. It is not a task manager that uses astrology as decoration. It is a **timing engine** — one that surfaces the right action at the right moment based on a layered model of who the user is, where they are in their cycles, and what the sky is doing. The astrology runs underneath everything as the intelligence layer, informing what surfaces and when rather than being the main thing users interact with daily.

The mythology layer gives the app its distinct voice and identity. Planets are treated as living archetypes — Hermes, Aphrodite, Ares, Kronos — and their influences are communicated through that lens. The language is vivid and relational, not jargon-heavy. The tone is closer to a beautifully made book than a productivity dashboard.

**Competitive positioning:** No current app combines real birth chart personalization, task management, cycle awareness, and a mythological voice at this level of craft. The closest competitors (Co-Star, The Pattern, Reclaim.ai) each own one dimension. Celestial is the first serious attempt to own all of them simultaneously.

---

## 2. Business Model

### Subscription
- **Free trial:** 1 month, full access, no limitations
- **Standard monthly:** $7.77 / month
- **Founding member rate:** $4.44 / month, locked for life (offered during launch window)
- No free tier. The entire value proposition is personalization — without commitment, the product is incomplete.

### Platform & Payments
- **Phase 1:** Progressive Web App (PWA) with Stripe for subscription management. Avoids App Store / Play Store revenue cuts (30% Apple, 15–30% Google).
- **Phase 2:** Native wrapper via Capacitor or a dedicated native build for App Store distribution. At that point, in-app purchases would handle subscriptions on iOS/Android.
- The PWA approach enables web push notifications, home screen installation, and offline capability without the complexity of a full native build in early development.

---

## 3. Data Philosophy & Privacy

Celestial holds some of the most personal data a user can share — birth time, birth location, menstrual cycle, current location, and daily energy patterns. The handling of this data is a trust proposition, not just a technical decision, and it should be communicated clearly and consistently throughout the app.

### What lives locally (on-device only)
- Birth date, time, and location
- Current location
- Menstrual cycle data (length, last start date, phase log)
- Natal chart cache (computed from birth data)

### What lives in the cloud (backend, tied to account)
- Tasks and task metadata
- Subscription status and account identity
- Preferences and settings
- Onboarding responses that don't include biometric data (chronotype, work style, cultivated intention)

### Communication to the user
At each relevant point in onboarding, a brief plain-language note appears: *"This stays on your device. We never see it."* For cloud-synced data, it's equally clear: *"This syncs to your account so you can access it across devices."*

The multi-device limitation for local data is disclosed upfront — not buried. If a user opens the app on a new device, a friendly prompt explains that certain personal data will need to be re-entered, framing it as a feature of their privacy model rather than a failure of the app.

---

## 4. Timing Engine

### Layer 1: Transit-to-Natal Aspects
The foundation. Today's planetary positions are compared against the user's natal chart, identifying active aspects (conjunction, sextile, square, trine, opposition, quincunx) between transiting planets and natal positions. Orb sensitivity, applying vs. separating, and the nature of the natal planet's role in the chart all affect weight.

This is where the timing intelligence lives. A transiting Venus conjunct the user's natal Mercury is a very different day than transiting Saturn squaring their natal Venus — and the task surfacing engine knows this.

### Layer 2: General Sky (Transit-to-Transit)
The existing ephemeris engine — daily planetary positions, mutual aspects, lunar phase. This layer applies to everyone equally. It provides the atmospheric backdrop on which the personal layer is painted.

### Layer 3: Cycle Awareness (optional)
For users who opt in, menstrual cycle phase is layered alongside cosmic data. The four phases — menstrual, follicular, ovulatory, luteal — each carry distinct energy signatures that map intuitively onto the mythological framework (withdrawal and renewal, emergence, expression, integration). This is not framed as health tracking but as honoring a natural rhythm the same way the app honors lunar and planetary ones.

### Layer 4: Behavioral Pattern (emergent)
Over time, the app builds a picture of when the user actually completes tasks vs. defers them, which energy types hold vs. which fall flat, and how their self-reported daily energy aligns with the astrological prediction. This layer feeds back into the surfacing algorithm, making it more accurate the longer they use the app. This is a later-phase feature — in v1 it begins collecting the data silently.

### Progressions (v2)
Secondary progressions evolve the natal chart slowly over time (roughly one day of planetary movement per year of life). A user's progressed Moon, for example, changes sign approximately every 2.5 years, representing a shift in emotional climate at a personal level. This adds a medium-term predictive layer that makes the app increasingly valuable over years rather than just days.

---

## 5. Onboarding Flow

Target: **5–10 minutes**, completing before the user sees the main app. Certain sections (cycle data, work style) can be deferred at the user's choice, with the app prompting once at a natural later moment. If a user declines cycle data, they are **never prompted again**.

### Screen Sequence

**1. Welcome**
Full-screen atmospheric — title, tagline, brief philosophy in 2–3 sentences. Single CTA: *"Begin."*

**2. Birth Date**
Date picker. Required. No skip.

**3. Birth Time**
Time picker with a secondary option: *"I don't know my exact birth time."*
- If they select this: advance normally. Next screen shows a brief acknowledgment.

**4. Birth Time Accuracy Note** *(only shown if birth time unknown)*
A short, honest explanation: without a birth time, house placements can't be calculated and certain transit timing will be approximate. The app is still highly useful — just not fully calibrated. Framed warmly, not as a penalty.

**5. Birth Location**
City autocomplete (Nominatim). Required. This establishes the natal chart's geographic anchor.

**6. Current Location**
Separate screen. City autocomplete. Explanation: *"Where you are now determines your current sky and house positions."* Can be the same as birth location — a checkbox for that case.

**7. Chronotype**
*"When does your day naturally feel most alive?"*
Options: Early Morning (before 9am) / Morning–Midday / Afternoon / Evening / Late Night.
Single select.

**8. Work Style**
*"How would you describe how you work best?"*
Options: Deep uninterrupted focus / Short bursts with breaks / Collaborative and social / Varies day to day.
Single select.

**9. Your Current Season**
*"What's the dominant theme of this chapter of your life?"*
A small selection of preset options (e.g., Building something new / Healing or recovering / Navigating change / Seeking clarity / Deepening relationships / Creating and expressing) plus a free-text "Something else" field. Used to contextualize which transits and tasks get surfaced most prominently.

**10. What You're Cultivating**
*"In a few words, what are you working toward right now?"*
Free-text. This is the one place where a lightweight API call (Claude Haiku) extracts 2–3 thematic tags from the user's response — e.g., "courage," "creative discipline," "financial freedom." These themes become a quiet undercurrent in the daily read and influence which task types surface.

**11. Cycle Awareness** *(Opt-in)*
Introduced with a brief framing paragraph connecting biological rhythms to the app's core philosophy. Not clinical. Two fields: average cycle length, date of last period start.
- *"Skip for now"* available — **never prompted again if declined.**
- If accepted: data is stored locally only. A one-line note confirms this.

**12. Notification Preferences**
Morning brief time, task reminders on/off, planetary event alerts on/off.

**13. Start Trial**
Paywall — 1 month free, then $7.77/month. Brief benefit recap. CTA: *"Start My Free Month."*

---

## 6. Daily Dashboard (Home Screen)

The home screen is a **living daily read** — atmospheric, personal, and actionable. It replaces the chart-viewer orientation of the current prototype.

### Structure (top to bottom)

**Date & Greeting**
Minimal header. Date in the current style. A single-line personalized greeting that shifts based on planetary conditions — not "Good morning" but something like *"Hermes is quiet today. A good day to listen."*

**Daily Energy Read**
2–4 sentences in the app's mythological voice. Synthesized from:
- The most significant active transit-to-natal aspects
- General sky conditions (major aspects, lunar phase)
- Cycle phase if opted in

This is plain language. No degree symbols, no house notation. A user shouldn't need to know any astrology to understand it. Example:
> *Aphrodite moves through the house of your voice today, and the Moon is waxing toward fullness. There's a warmth available in how you speak — especially to people you've been circling around. Kronos watches steadily from a favorable angle. What you begin now has the patience of structure behind it.*

**Energy Indicators** *(compact, visual)*
3–4 small indicators showing the day's overall rating for the four life areas (Finance, Communication, Mind & Body, Spirit) — small colored glyphs, no verbose labels. Tappable to expand.

**Surfaced Tasks**
1–2 tasks the engine has selected as best matched to today's energy. Each shows:
- Task name
- A one-line reason it's surfaced today (in the app's voice)
- Completion checkbox

Below: a link — *"See all tasks for today"* — opens a fuller view of every task that scores well against today's conditions.

The number of surfaced tasks is adjustable in settings (1–5).

**Quick Add**
A persistent subtle button to add a task without leaving the dashboard.

---

## 7. Task Management

### Philosophy
Tasks are not just to-dos. They carry metadata that lets the timing engine place them intelligently. The system never reads the content of a task — it works from the metadata alone, preserving privacy.

### Task Metadata Fields

| Field | Options |
|---|---|
| **Energy required** | Low / Focused / Deep Work |
| **Task type** | Creative / Analytical / Communicative / Administrative / Physical / Reflective |
| **Emotional weight** | Light / Moderate / Heavy |
| **Deadline** | Optional date |
| **Repeating** | None / Daily / Weekly / Biweekly / Monthly / Custom |

### Task Creation Flow

The creation flow is **a sequence of simple screens**, not a single long form. Each screen asks one thing. The goal is to feel effortless rather than bureaucratic.

1. **Task name** — free text input, large and clean
2. **Deadline?** — simple date picker, easy to skip
3. **Does this repeat?** — yes / no; if yes, frequency options
4. **Review auto-tags** — the app runs a local keyword heuristic against the title (and deadline/recurrence context) to pre-fill the three metadata fields. This screen shows the suggestions and lets the user confirm, adjust, or add tags manually. Language: *"Here's how I read this task — does this feel right?"*
5. **Save**

The heuristic runs locally — no API call. Keywords in the title ("write," "draft," "design" → Creative; "call," "message," "meet" → Communicative; "review," "audit," "plan" → Analytical; etc.) map to task types. Emotional weight is inferred from words like "difficult," "important," "overdue," or deadline proximity.

### Surfacing Algorithm

The engine scores each task against the day's conditions, weighting:
- Task type vs. day's strongest planetary archetype (Mercury days favor Communicative/Analytical; Venus days favor Creative/Relational)
- Energy required vs. overall day energy level
- Emotional weight vs. Moon phase and cycle phase
- Deadline proximity (approaching deadlines weight upward)
- User's chronotype vs. time of day *(later feature)*

**Deadline conflict detection:** If a task has a deadline that falls on a day scoring Caution or Challenging, the app flags it at creation — *"This deadline falls on a difficult day. You may want to aim to finish a day earlier."* It does not block the user, just informs.

---

## 8. Mythology Layer

### Voice
The app speaks in a mythological register — planets are characters with will, desire, and history. The tone is warm, poetic, and accessible. Not academic. Not New Age. Closer to a skilled storyteller explaining the sky.

Planetary names follow the Greek tradition in copy and description (Hermes, Aphrodite, Ares, Kronos, Zeus, Selene, Helios) while keeping standard astrological names in any technical or reference context (Mercury, Venus, Mars, Saturn, Jupiter, Moon, Sun).

**Examples of voice shift:**
- Instead of: *"Mercury square Saturn creates communication barriers"*
- Celestial says: *"Hermes and Kronos are at odds — words come slowly today, or land harder than intended. This isn't the moment to rush an important conversation."*

- Instead of: *"Venus trine Jupiter is favorable for financial decisions"*
- Celestial says: *"Aphrodite and Zeus are in easy conversation. There's an expansiveness today — in what you value, in what feels possible. Trust the generous impulse."*

### Visual Identity
Classical art depicting planetary archetypes will be integrated at key moments — onboarding screens, daily dashboard, the deeper planet detail views. Images are sourced and prepared by the founder. The design system should be built to accommodate full-bleed imagery behind the dark overlay, with cream/gold text sitting above it. This is a later integration point — the app is built first, then images are placed.

The existing design language (black, cream, gold, Cormorant Garamond, Jost) remains the foundation. The mythological layer enriches rather than replaces it.

---

## 9. Notifications

### Strategy
Push notifications are a significant part of the value delivery — a morning brief, deadline nudges, and planetary event alerts are all meaningfully useful. The middle road between full native and pure web:

**Phase 1:** Web Push via Service Worker. Works natively on Android and on iOS 16.4+ when the PWA is added to the home screen. The onboarding flow will include a natural moment to prompt home screen installation on iOS.

**Phase 2:** If a native wrapper (Capacitor) is adopted for app store distribution, native push (APNs/FCM) replaces web push transparently.

### Notification Types

| Type | Description | Default |
|---|---|---|
| **Morning Brief** | A 2-sentence energy read for the day, personalized. Sent at user's chosen time. | On, 8:00am |
| **Task Reminder** | Fires the evening before a deadline and the morning of. | On |
| **Deadline Conflict Alert** | If a task deadline is approaching and the day is difficult. | On |
| **Planetary Event** | Notable transits, Moon phase changes, Mercury retrograde start/end. | On |
| **Cycle Phase Shift** | When the app estimates a phase transition (if cycle opted in). | On |

All notification types are individually togglable. Quiet hours are respected.

---

## 10. Technical Architecture

### Frontend
- Continues as a single-file HTML app in the near term, progressively refactored
- Service Worker added for PWA capability, offline support, and web push
- No framework required at current scale; can revisit if component complexity grows

### Backend (to be built)
- **Auth:** Email + password, or passwordless magic link (simpler UX)
- **Database:** Tasks, preferences, subscription status, account identity
- **Payments:** Stripe (subscriptions, trial management, founding member cohort)
- **AI endpoint:** A lightweight serverless function wrapping Claude Haiku for the "what you're cultivating" extraction — called once at onboarding, not on task creation
- **Stack:** To be decided collaboratively. Node/Express + PostgreSQL is a solid default; Supabase is worth considering for faster auth + database setup

### Local Storage Schema (on-device)
```
celestial_birth       { date, time, timeKnown, lat, lon, cityName }
celestial_loc         { lat, lon, name, timezone }
celestial_cycle       { avgLength, lastStart }
celestial_natal       { [cached chart computation] }
celestial_prefs       { chronotype, workStyle, season, cultivationTags[] }
celestial_onboarded   '1'
celestial_tour_seen   '1'
```

### Privacy Architecture Notes
- Sensitive local data (birth, cycle) should be flagged clearly in the UI as device-only
- If a user logs into a new device, a friendly re-entry flow for local data is required — framed as a feature of the privacy model
- No analytics or tracking without explicit opt-in

---

## 11. Full Feature Scope

*Phasing to be determined. This section captures the complete vision.*

### Core (must exist at launch)
- [ ] Birth data collection and natal chart computation
- [ ] Transit-to-natal aspect engine
- [ ] Daily dashboard with atmospheric energy read
- [ ] Task creation with metadata and local keyword tagging
- [ ] Task surfacing algorithm (score tasks against day conditions)
- [ ] Deadline conflict detection
- [ ] Repeating tasks
- [ ] Mythology voice throughout
- [ ] Onboarding flow (all screens)
- [ ] Cycle awareness (opt-in)
- [ ] Subscription and trial (Stripe)
- [ ] Web push notifications
- [ ] PWA / home screen install

### Near-term additions
- [ ] Behavioral feedback loop (track completion vs. deferral, refine surfacing)
- [ ] Cultivated intention extraction (Claude Haiku, one-time onboarding call)
- [ ] Classical art integration on key screens
- [ ] Settings: notification fine-tuning, surfaced task count, cycle edit
- [ ] "All tasks for today" expanded view
- [ ] Full task list / management view
- [ ] Backend and account system

### Later features
- [ ] Secondary progressions layer
- [ ] Multi-device sync (for non-sensitive data)
- [ ] Native app wrapper (Capacitor) for App Store / Play Store
- [ ] Native push notifications
- [ ] Annual subscription option
- [ ] Partner/relationship chart overlays
- [ ] Export / data portability

---

## 12. Design Language

Carried forward from the existing prototype, with the following additions and shifts:

- **Color:** Black (#0a0a0a base), cream (#f0e8d8), gold (#c9a84c). No change.
- **Typography:** Cormorant Garamond (display, italic for voice copy), Jost (UI, labels). No change.
- **Motion:** Slow, deliberate transitions. Nothing snappy or gamified.
- **Imagery:** Full-bleed classical art behind a dark scrim, gold/cream text above. Integrated on home screen, onboarding, and planet detail views in a later phase.
- **Interactions:** Bottom sheets, tap to expand, swipe to dismiss — established patterns maintained.
- **Tone of empty states:** Never "No tasks found." Always in the mythological voice. *"The sky is clear. Rest is also a strategy."*
- **Onboarding aesthetic:** More atmospheric than the current version — each screen should feel like turning a page, not filling a form.

---

*This document will be updated as decisions are made and features are built. Treat it as the ground truth for intent, not a rigid spec.*
