# CT62.A2 Security - context for the next session

## A2 (2026-11-13)

User asked for a front page with their copyright ("© 2026 Michael Wahrman. All rights reserved.", same form as other
CT projects) saying: untested prototype; hoped to lead to a synagogue security system but isn't one yet; needs cameras,
image material and other test items that the user does not have and cannot afford; contributions welcome, but no
demands or trouble. Built as a full-screen `#front` overlay inside `index.html` (so all A1 scripts, paths and the
self-test stay unchanged), plus an About button to reopen it. Skipped when the URL has a query string.
No contact address is on the page yet - ask the user whether to add one.
Verified: front page shows, closes, app runs behind it; `?selftest=1` run in Claude's browser pane: pass = true.
Note: `scripts/run_selftest.py` (headless Edge) returned an empty page in the A2 session for both A1 and A2, so
docs/TEST_REPORT.md was not regenerated and is still the A1 report.

Everything below is the A1 context and still applies.


Read this file (and README.md) to pick up CT62 where A1 left off. Also read and follow
`C:\Users\micha\Downloads\claude\claude_harness_7.md` (project rules), and pass it to any subtask.

## The brief (from the user, 2026-11-13, condensed)

An open-ended security framework for synagogues that have been threatened. Elements will be added and removed as it
evolves. Pieces asked for:

- browser apps (WebGL / three.js), possibly with Python back-end tools
- databases that are easy to back up: members (photos, contacts), duty officers (on duty / on call), and contacts plus
  actions for each kind of alert
- building geometry, entrances and exits, nearby streets, and cameras with position, view direction and field of view
- an operator tool to add and delete pictures: **two per person (front and side)**, with a history as people age.
  Categories: trusted members, people in roles of responsibility (rabbi, chief security officer), and possibly
  threats or people no longer trusted (may be empty)
- cameras: all-weather, low light, WiFi, roughly 1-2 fps JPEG stills at 2K or better (maybe encrypted), some
  wide-angle, overlapping fields of view
- a central server with enough compute (GPUs if worthwhile)
- zones: 0 outside / street, 1 entryway, 2 interior
- operation: everyone entering is face-recognised. Recognised people are tracked but not of concern. Unrecognised
  people are checked against the threat list, wrong time, wrong place, or carrying objects of concern. Alerts range
  from notifying the duty officer, to calling in outside security, to evacuation or shelter in place.
- for now, fake this with visual displays

## Decisions made with the user for A1

- **Type:** prototype now, strict later. A1 uses fake data and a simulated recogniser, with assumptions written down
  (README > Assumptions). The strict science-project rules (checked research, QA, verification report) apply once
  real cameras or real recognition are added.
- **A1 scope:** venue + cameras + simulation, plus the databases and editors.
- **Layout:** one `index.html` with tabs (Operations, Venue & cameras, People, Duty & alerts) sharing the same data.

## What A1 contains

Read README.md for the details. In short:

- data lives in five JSON files under `data/`; `scripts/bundle_data.py` checks cross-references and writes
  `data/bundle.js` so the page works from file://
- edits made in the browser go to localStorage (key `ct62a1.db`) and come back out through Data > Export
- camera model: `CT.camModel` / `CT.camSees` in `js/scene.js` (a three.js PerspectiveCamera; walls block line of
  sight in 2-D; face pixels and body pixels are worked out from distance, FOV and resolution)
- simulation: `CT.makeSim` in `js/sim.js` (seeded RNG; scripted agents follow waypoints; per-camera frame clock; fake
  recogniser; tracks with perfect hand-off; 9 rules; levels 0-4; simulated notifications)
- self-test: `js/selftest.js` + `scripts/run_selftest.py` (headless Edge/Chromium) -> `docs/TEST_REPORT.md`.
  Last result: PASS (11/11 checks, 35/35 runs)
- images: `scripts/capture_images.py` -> `images/*.png`
- a `.claude/launch.json` (local static server on port 8762) is included for previewing in Claude's browser pane

## Findings worth carrying forward

- The sample camera layout (10 cameras, 2560x1440) only gets usable faces along the entry path. Seats, grounds and
  the classroom are blind spots for faces, and nothing has 3+ camera coverage. The real "overlapping view" goal needs
  more cameras or narrower lenses at choke points.
- With these thresholds, street cameras at 20 m cannot identify faces, so loitering detection has to rely on time,
  not identity.
- People who were already inside when a scenario starts are marked `preTracked` (assumed identified on arrival).

## Ideas for A2 and later (not promised; ask the user)

- check the face-size and angle thresholds against published data for a chosen recognition model (strict mode)
- a real recognition back end in Python (WSL), e.g. an open-source face-embedding model on a GPU server: enrol the
  front and side photos, match incoming JPEG frames, and send results to this console over WebSocket
- lens distortion for wide cameras; brightness and IR effects on match quality
- an escalation timer (level 1 not acknowledged in N seconds -> level 2), shift schedules driving on-duty status, and
  an audit log export
- a 2-D floor-plan editor for walls and zones instead of JSON
- a camera layout optimiser that suggests where to put cameras to cover chosen spots with 2+ frontal views
- research and document the privacy, consent and retention rules for biometric data in the target jurisdiction
