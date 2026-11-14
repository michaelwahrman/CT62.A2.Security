// CT62.A1 - self-test, run with index.html?selftest=1 (scripts/run_selftest.py does this headless).
// 1) geometry checks of the camera model; 2) every scenario x several seeds must reach its expected level
// and fire exactly its expected rules. Result is written into <pre id="selftest"> as JSON.
(function (CT) {
  'use strict';
  CT.selftest = () => {
    const db = CT.store.db, checks = [];
    const ok = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail) });
    // --- camera model sanity
    const cam = { id: 'X', pos: [0, 1.6, 0], yaw: 0, pitch: 0, hfov: 90, res: [2560, 1440], range: 50, fps: 1 };
    const m = CT.camModel(cam), v = { walls: [], recognition: db.venue.recognition };
    const s10 = CT.camSees(m, v, 0, 1.6, -10);
    ok('point 10 m straight ahead (north) is visible', s10);
    ok('face width at 10 m, 90 deg, 2560 px = 20.5 px', s10 && Math.abs(s10.facePx - 20.48) < 0.1, s10 && s10.facePx.toFixed(2));
    ok('point behind the camera is not visible', !CT.camSees(m, v, 0, 1.6, 10));
    ok('point at 50 deg off-axis (outside 45 deg half-FOV) is not visible', !CT.camSees(m, v, 10 * Math.tan(50 * CT.D2R), 1.6, -10));
    ok('point at 40 deg off-axis is visible', CT.camSees(m, v, 10 * Math.tan(40 * CT.D2R), 1.6, -10));
    ok('wall between camera and point blocks the view', !CT.camSees(m, { ...v, walls: [{ a: [-5, -5], b: [5, -5] }] }, 0, 1.6, -10));
    ok('beyond camera range is not visible', !CT.camSees(m, v, 0, 1.6, -60));
    const east = CT.camModel({ ...cam, yaw: 90 });
    ok('yaw 90 looks east (+x)', CT.camSees(east, v, 10, 1.6, 0) && !CT.camSees(east, v, 0, 1.6, -10));
    ok('zone lookup: main lobby point is zone 1', CT.zoneAt(db.venue, 0, -5.5).level === 1);
    ok('zone lookup: office point is restricted', CT.zoneAt(db.venue, 8.5, -6.5).restricted === 'staff');
    ok('schedule: Fri 18:20 is open, Tue 02:40 closed', CT.isOpen(db.venue, CT.clockAt({ day: 5, time: '18:20' }, 0)) && !CT.isOpen(db.venue, CT.clockAt({ day: 2, time: '02:40' }, 0)));
    // --- scenarios x seeds
    const runs = [];
    for (const sc of db.scenarios.scenarios) for (const seed of [1, 2, 3, 4, 5]) {
      const e = sc.expect || {}, sim = CT.makeSim(db, sc, seed); sim.runTo(e.runSec || 240);
      const fired = [...new Set(sim.alerts.map((a) => a.rule))].sort(), want = (e.rules || []).slice().sort();
      const unrec = sim.tracks.filter((t) => t.agent.person && !t.person).map((t) => t.agent.person.name);
      const pass = sim.level === e.maxLevel && JSON.stringify(fired) === JSON.stringify(want) && (!e.allEnrolledRecognized || !unrec.length);
      runs.push({ scenario: sc.id, seed, pass, level: sim.level, expectLevel: e.maxLevel, fired: fired.join(' '), expected: want.join(' '), unrecognisedEnrolled: unrec.join(', '),
        firstAlertAt: sim.alerts.length ? +sim.alerts[0].t.toFixed(1) : null, frames: sim.counts.frames, matches: sim.counts.matches });
    }
    const res = { when: new Date().toISOString(), checks, runs, pass: checks.every((c) => c.pass) && runs.every((r) => r.pass) };
    let pre = document.getElementById('selftest');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'selftest'; pre.style.cssText = 'position:fixed;inset:40px 10px 10px;overflow:auto;background:#111;color:#cfc;z-index:99;padding:10px;font-size:11px'; document.body.append(pre); }
    pre.textContent = JSON.stringify(res, null, 1);
    return res;
  };
})(window.CT);
