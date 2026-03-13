#!/usr/bin/env python3
"""
Take Playwright screenshots of the Product Scout UI at multiple states and
viewports. Saves PNGs into ../../screenshots/ (repo root / screenshots/).

Usage:
    python scripts/screenshot.py [--url URL] [--out DIR]

Defaults:
    --url  http://localhost:8000
    --out  ../../screenshots
"""

import argparse
import sys
from pathlib import Path

# Resolve default output dir relative to this script's location
SCRIPT_DIR = Path(__file__).parent
DEFAULT_OUT = (SCRIPT_DIR / "../../screenshots").resolve()

CHROMIUM_CANDIDATES = [
    "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
]


def find_chromium() -> str | None:
    for path in CHROMIUM_CANDIDATES:
        if Path(path).exists():
            return path
    return None


def new_page(browser, width: int, height: int):
    ctx = browser.new_context(viewport={"width": width, "height": height})
    page = ctx.new_page()
    # Stub browser dialogs so the page loads without blocking
    page.add_init_script(
        "window.prompt = () => 'DEMO_KEY'; window.confirm = () => false;"
    )
    return page


def inject_conversation(page) -> None:
    """Inject a realistic two-turn conversation into the chat UI."""
    page.evaluate(
        """() => {
        const msgs = document.getElementById('chat-messages');

        const u1 = document.createElement('div');
        u1.className = 'message user-message';
        u1.innerHTML = '<div class="bubble">Do you have any noise-cancelling headphones?</div>';
        msgs.appendChild(u1);

        const b1 = document.createElement('div');
        b1.className = 'message bot-message';
        b1.innerHTML = `<div>
          <div class="bubble">Yes! We carry the AirComfort Pro Headphones at $249.99. ` +
          `They feature adaptive noise cancellation, a 40-hour battery, and multipoint ` +
          `Bluetooth — great for travel or the office.</div>
          <div class="source-badge">📦 AirComfort Pro Headphones</div>
        </div>`;
        msgs.appendChild(b1);

        const u2 = document.createElement('div');
        u2.className = 'message user-message';
        u2.innerHTML = '<div class="bubble">What about something cheaper for the gym?</div>';
        msgs.appendChild(u2);

        const b2 = document.createElement('div');
        b2.className = 'message bot-message';
        b2.innerHTML = `<div>
          <div class="bubble">The NanoBlast Earbuds at $129.99 are a great gym pick — ` +
          `IPX5 waterproof, touch controls, 8h playback plus 24h from the charging case.</div>
          <div class="source-badge">📦 NanoBlast Earbuds</div>
        </div>`;
        msgs.appendChild(b2);

        msgs.scrollTop = msgs.scrollHeight;
    }"""
    )


def take_screenshots(url: str, out: Path) -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright not installed. Run: pip install playwright", file=sys.stderr)
        sys.exit(1)

    chromium = find_chromium()
    if chromium is None:
        print(
            "ERROR: No Chromium binary found. Run: python -m playwright install chromium",
            file=sys.stderr,
        )
        sys.exit(1)

    out.mkdir(parents=True, exist_ok=True)

    shots: list[tuple[str, str]] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chromium, headless=True)

        # ── Mobile (390 × 844) ──────────────────────────────────────────
        page = new_page(browser, 390, 844)
        page.goto(url)
        page.wait_for_load_state("networkidle")

        page.screenshot(path=str(out / "01-mobile-chat-empty.png"))
        shots.append(("01-mobile-chat-empty.png", "Mobile · empty chat"))

        # Recording state
        page.evaluate(
            """() => {
            document.getElementById('mic-btn').classList.add('recording');
            document.getElementById('mic-icon').textContent = '⏹';
            document.getElementById('recording-hint').textContent = 'Tap to stop & send';
            const tp = document.getElementById('transcript-preview');
            tp.textContent = 'Do you have any noise-cancelling headphones?';
            tp.classList.remove('hidden');
        }"""
        )
        page.screenshot(path=str(out / "02-mobile-chat-recording.png"))
        shots.append(("02-mobile-chat-recording.png", "Mobile · recording in progress"))

        # Conversation
        page.evaluate(
            """() => {
            document.getElementById('mic-btn').classList.remove('recording');
            document.getElementById('mic-icon').textContent = '🎤';
            document.getElementById('recording-hint').textContent = 'Tap to speak';
            const tp = document.getElementById('transcript-preview');
            tp.textContent = '';
            tp.classList.add('hidden');
        }"""
        )
        inject_conversation(page)
        page.wait_for_timeout(200)
        page.screenshot(path=str(out / "03-mobile-chat-conversation.png"))
        shots.append(("03-mobile-chat-conversation.png", "Mobile · conversation with source badges"))

        # Products tab
        page.click("text=Products")
        page.wait_for_timeout(300)
        page.screenshot(path=str(out / "04-mobile-products.png"))
        shots.append(("04-mobile-products.png", "Mobile · products tab"))

        page.context.close()

        # ── Desktop (1280 × 800) ────────────────────────────────────────
        page = new_page(browser, 1280, 800)
        page.goto(url)
        page.wait_for_load_state("networkidle")

        page.screenshot(path=str(out / "05-desktop-chat-empty.png"))
        shots.append(("05-desktop-chat-empty.png", "Desktop · empty chat"))

        inject_conversation(page)
        page.wait_for_timeout(200)
        page.screenshot(path=str(out / "06-desktop-chat-conversation.png"))
        shots.append(("06-desktop-chat-conversation.png", "Desktop · conversation"))

        page.click("text=Products")
        page.wait_for_timeout(300)
        page.screenshot(path=str(out / "07-desktop-products.png"))
        shots.append(("07-desktop-products.png", "Desktop · products tab"))

        page.context.close()

        # ── Tablet (768 × 1024) ─────────────────────────────────────────
        page = new_page(browser, 768, 1024)
        page.goto(url)
        page.wait_for_load_state("networkidle")
        inject_conversation(page)
        page.wait_for_timeout(200)
        page.screenshot(path=str(out / "08-tablet-chat-conversation.png"))
        shots.append(("08-tablet-chat-conversation.png", "Tablet · conversation"))

        page.context.close()
        browser.close()

    print(f"Saved {len(shots)} screenshots to {out}/")
    for filename, label in shots:
        print(f"  {filename}  —  {label}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of the running app")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output directory for PNGs")
    args = parser.parse_args()
    take_screenshots(args.url, Path(args.out))


if __name__ == "__main__":
    main()
