import sys

with open('styles/Home.module.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if 'MOBILE PHONE' in line and '768px' in line and start_idx is None:
        start_idx = i
    if 'EXTRA SMALL PHONES' in line and '400px' in line and start_idx is not None:
        end_idx = i
        break

if start_idx is None or end_idx is None:
    print(f'ERROR: Could not find block. start={start_idx}, end={end_idx}')
    sys.exit(1)

print(f'Replacing lines {start_idx+1} to {end_idx} (Python 0-indexed {start_idx} to {end_idx-1})')

NEW_MOBILE_CSS = r"""/* ══════════════════════════════════════════════════════════════════
   MOBILE PHONE LAYOUT  —  max-width: 768px
   Design Language: TikTok / FaceTime Immersive
   ══════════════════════════════════════════════════════════════════ */
@media (max-width: 768px) {

  /* HEADER: Slim frosted bar */
  .header {
    padding: 0 12px;
    height: 48px;
    z-index: 1000;
    background: rgba(8,8,14,0.88);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .tagline { display: none; }
  .logoText { font-size: 16px; letter-spacing: -0.01em; }

  /* MAIN WRAPPER */
  .main {
    flex-direction: column;
    height: calc(100svh - 48px);
    height: calc(100dvh - 48px);
    position: relative;
    overflow: hidden;
    background: #000;
  }

  /* VIDEO AREA: Full-screen canvas */
  .videoArea {
    position: absolute;
    inset: 0;
    z-index: 0;
    background: #000;
    flex-direction: column;
  }

  /* REMOTE VIDEO: fills 100% of screen */
  .videoSlotRemote {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    flex: none;
    z-index: 1;
  }
  .videoRemote {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Deep vignette for control legibility */
  .videoVignette {
    background:
      linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 32%, transparent 58%),
      linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 22%);
  }

  /* LOCAL VIDEO: Rounded PIP — top-right corner */
  .videoSlotLocal {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 90px;
    height: 128px;
    border-radius: 20px;
    border: 2.5px solid rgba(255,255,255,0.45);
    overflow: hidden;
    z-index: 600;
    box-shadow:
      0 6px 28px rgba(0,0,0,0.72),
      0 0 0 1px rgba(255,255,255,0.07),
      inset 0 0 0 1px rgba(255,255,255,0.05);
    background: #111;
    flex: none;
    transition: transform 0.22s ease, border-color 0.18s;
  }
  .videoSlotLocal:active { transform: scale(0.94); }
  .videoLocal {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
  }
  .videoSlotLocal .videoLabel { display: none; }
  .videoSlotLocal .videoVignette { display: none; }
  .videoSlotLocal .glassVisualizer { display: none; }

  /* Connection badge: below the PIP, top-left */
  .connectionStatus {
    top: 10px;
    left: 12px;
    z-index: 700;
  }

  /* CONTROLS BAR: Floating pill at bottom center */
  .controlsBar {
    bottom: 18px;
    bottom: calc(18px + env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 14px;
    gap: 8px;
    z-index: 700;
    background: rgba(10,10,16,0.78);
    border: 1px solid rgba(255,255,255,0.11);
    backdrop-filter: blur(28px) saturate(220%);
    -webkit-backdrop-filter: blur(28px) saturate(220%);
    box-shadow:
      0 8px 36px rgba(0,0,0,0.65),
      inset 0 1px 0 rgba(255,255,255,0.07);
    border-radius: 100px;
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none;
    max-width: calc(100vw - 24px);
    flex-wrap: nowrap;
  }
  .controlsBar::-webkit-scrollbar { display: none; }

  /* Touch targets — min 44px (Apple HIG guideline) */
  .btnStop {
    font-size: 12px;
    padding: 8px 15px;
    min-height: 42px;
    min-width: 68px;
    flex-shrink: 0;
    border-radius: 100px;
  }
  .btnSkip {
    font-size: 12px;
    padding: 8px 15px;
    min-height: 42px;
    flex-shrink: 0;
    border-radius: 100px;
  }
  .btnStart {
    font-size: 15px;
    padding: 15px 0;
    min-height: 52px;
    border-radius: 16px;
    width: 100%;
    justify-content: center;
  }
  .btnIcon {
    width: 42px;
    height: 42px;
    font-size: 17px;
    flex-shrink: 0;
    border-radius: 50%;
  }
  .divider { height: 20px; }

  /* CHAT PANEL: Overlay above controls */
  .rightPanel {
    position: absolute;
    bottom: 70px;
    bottom: calc(70px + env(safe-area-inset-bottom));
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    max-height: 42%;
    background: transparent;
    border-left: none;
    z-index: 500;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .chatHeader { display: none; }

  .chatArea {
    background: transparent;
    pointer-events: all;
    border-top: none;
  }

  .chatMessages {
    padding: 8px 12px;
    mask-image: linear-gradient(to top, black 72%, transparent 100%);
    -webkit-mask-image: linear-gradient(to top, black 72%, transparent 100%);
  }

  .message {
    background: rgba(14,14,24,0.58);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,0.09);
    max-width: 76%;
    margin-bottom: 5px;
    padding: 7px 12px;
    line-height: 1.4;
    font-size: 12.5px;
    color: rgba(255,255,255,0.93);
    border-radius: 14px;
  }
  :global([data-theme="light"]) .message {
    background: rgba(0,0,0,0.45);
    color: #fff;
  }
  .me {
    background: rgba(124,106,255,0.52) !important;
    border-color: rgba(124,106,255,0.3) !important;
  }
  .system {
    background: transparent !important;
    border: none !important;
    font-size: 10px;
    opacity: 0.58;
    text-align: center;
    max-width: 100%;
    padding: 2px 0;
    margin-bottom: 2px;
  }

  /* Chat input */
  .chatInputArea {
    background: transparent;
    border-top: none;
    padding: 5px 12px;
    pointer-events: all;
  }
  .msgInput {
    background: rgba(255,255,255,0.14);
    border: 1.5px solid rgba(255,255,255,0.22);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-radius: 100px;
    padding: 10px 18px;
    color: #fff;
    font-size: 13.5px;
  }
  .msgInput::placeholder { color: rgba(255,255,255,0.45); }
  .btnSend { border-radius: 100px; height: 38px; padding: 0 12px; font-size: 11px; }

  /* Misc */
  .footer { display: none; }

  .reactionBar {
    bottom: 148px;
    bottom: calc(145px + env(safe-area-inset-bottom));
    left: 12px;
    right: auto;
    gap: 4px;
  }
  .reactionBtn { width: 32px; height: 32px; font-size: 15px; }

  .chatEmpty {
    background: rgba(0,0,0,0.38);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 12px 18px;
    margin: 12px auto;
    width: fit-content;
    pointer-events: none;
  }
  .chatEmptyIcon { font-size: 20px; margin-bottom: 3px; }
  .chatEmptyText { font-size: 10px; color: rgba(255,255,255,0.58); }

  .emojiBar {
    bottom: 74px;
    bottom: calc(70px + env(safe-area-inset-bottom));
    left: 10px;
    right: 10px;
    width: auto;
    background: rgba(10,10,18,0.68);
    border: 1px solid rgba(255,255,255,0.11);
    backdrop-filter: blur(18px);
    padding: 6px 8px;
    justify-content: center;
    border-radius: 100px;
    z-index: 700;
  }
  .emojiBtnChat { font-size: 16px; padding: 3px 4px; }

  .filterCarousel {
    bottom: 74px;
    bottom: calc(70px + env(safe-area-inset-bottom));
    padding: 10px 6px;
  }
  .filterPreview { width: 40px; height: 40px; }
  .filterItem { width: 50px; gap: 5px; }
  .filterItem span { font-size: 8px; }

  /* IDLE / LANDING SCREEN */
  .idleView {
    padding: 28px 18px 36px;
    justify-content: flex-start;
    gap: 14px;
    background:
      radial-gradient(ellipse at 70% -10%, rgba(124,106,255,0.18) 0%, transparent 55%),
      radial-gradient(ellipse at 20% 90%, rgba(74,255,212,0.08) 0%, transparent 50%),
      #07070f;
  }

  .searchCard {
    width: 100%;
    padding: 16px 14px;
    border-radius: 18px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow: none;
  }

  .heroTitle { font-size: clamp(22px, 6.5vw, 28px) !important; letter-spacing: -0.5px; line-height: 1.15; }
  .heroSubtitle { font-size: 12px !important; line-height: 1.45; opacity: 0.65; max-width: 100%; }
  .featuresGrid { display: none; }
  .interestTitle { font-size: 14px !important; margin-bottom: 2px; }
  .interestSubtitle { display: none; }
  .interestTags { gap: 5px; flex-wrap: wrap; }
  .tagChip { padding: 4px 10px; font-size: 10px; }
  .interestInput { padding: 8px 10px; font-size: 12px; height: 36px; margin-top: 6px !important; }
  .btnStart { width: 100%; justify-content: center; padding: 15px; font-size: 15px; font-weight: 700; min-height: 52px; margin-top: 10px; }
}
"""

before = lines[:start_idx]
after = lines[end_idx:]
new_content = ''.join(before) + NEW_MOBILE_CSS + '\n' + ''.join(after)

with open('styles/Home.module.css', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('SUCCESS: Mobile CSS block replaced.')
