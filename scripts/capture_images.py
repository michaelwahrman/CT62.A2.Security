"""Regenerate images/*.png (for the README / GitHub) from index.html with a headless browser.
Usage:  python3 scripts/capture_images.py"""
from headless import ROOT, run

SHOTS = [
    ("ops_arrivals.png", "scenario=arrivals&t=118&play=0&panels=1&sel=T09&view=62,0.45,0.85,0,-4"),
    ("ops_threat_gate.png", "scenario=threat&t=40&play=0&panels=1&view=34,0.25,0.95,0,-17"),
    ("ops_object_lobby_cam.png", "scenario=object&t=36&play=0&panels=1&look=C05"),
    ("ops_afterhours_night.png", "scenario=afterhours&t=33&play=0&panels=1&view=40,0.3,0.9,0,-14"),
    ("venue_coverage.png", "tab=venue&panels=1&cov=1&fov=sel&cam=C03&view=88,0.0,0.55,0,-6"),
    ("venue_fov_cones.png", "tab=venue&fov=all&view=95,0.6,0.85,0,-6"),
    ("people.png", "tab=people"),
    ("duty_alerts.png", "tab=duty"),
]

(ROOT / "images").mkdir(exist_ok=True)
for name, q in SHOTS:
    out = ROOT / "images" / name
    run([f"--screenshot={out}"], q)
    print(f"{name}: {out.stat().st_size if out.exists() else 'FAILED'} bytes")
