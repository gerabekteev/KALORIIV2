"""
Generate 3 distinct design concepts for KaloriiAI in Google Stitch:
1. Nordic Light Wellness (Скандинавский светлый велнес / Editorial Light)
2. Neo-Brutalist Pop (Яркий нео-брутализм с жесткими тенями и сочными цветами)
3. Cyber Bio-HUD (Ультра-технологичный биохакинг / Неоновый HUD)
"""

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

# Add project root to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.stitch_tool import call_mcp_tool

CONCEPTS = [
    {
        "id": "1_nordic_light",
        "name": "Nordic Light Wellness",
        "project_id": "17204641045655770014",
        "prompt": """A premium mobile nutrition and calorie tracker in Nordic Light Wellness aesthetic (inspired by Apple Health, Kinfolk, and Oura), mobile viewport (390px width), pure LIGHT MODE (#FBFBF9 warm off-white paper canvas, crisp white #FFFFFF cards with subtle diffuse shadows).

Key Visual & Functional Requirements:
1. Editorial Top Header:
   - Soft elegant avatar, refined greeting 'Добрый день, Александр', minimalist streak badge '7 дней баланса'.
   - Clean horizontal 7-day calendar strip (Mon to Sun) with soft natural sage green indicator for today.

2. Daily Calorie Budget Hero Card (White card, soft border #E7E5E4, rounded-3xl p-6 shadow-sm):
   - Headline: 'Баланс дня'.
   - Elegant horizontal segmented pill progress bar and modern dual-arc visual showing Consumed (1,450 kcal) vs Remaining (650 kcal) of 2,100 kcal target.
   - 3 refined macro chips with muted organic colors:
     * Белки: 110г / 140г (Soft Lavender #818CF8)
     * Жиры: 45г / 65г (Warm Sand / Ochre #D97706)
     * Углеводы: 165г / 220г (Sage Green #059669)

3. Wellness Water & Activity Section:
   - Soft pastel card: Water 1.8L / 2.5L with delicate droplet icon.
   - Daily Movement: 420 ккал сожжено, 8,450 шагов.

4. Chronological Food Journal (Minimalist clean cards):
   - 'Завтрак' (540 ккал): 'Овсянка на кокосовом молоке с ягодами', 'Матча латте'.
   - 'Обед' (720 ккал): 'Запеченный лосось с диким рисом', 'Свежий салат с зеленью'.
   - 'Ужин' (Планируется): Minimalist dotted card with '+ Добавить ужин'.
   - 'Перекус' (190 ккал): 'Греческий йогурт с семенами чиа'.

5. Floating Glass Dock:
   - Translucent white frosted pill dock (backdrop-blur-xl bg-white/80 border border-stone-200/60 shadow-lg) with elegant thin line icons: Сегодня, Аналитика, Central round Sage Green '+' button with camera glyph for AI food photo scan, Меню, Профиль.

Typography: Plus Jakarta Sans with serif accents, warm natural tones, Russian text labels, completely clean light theme, zero dark mode elements."""
    },
    {
        "id": "2_neo_brutalism",
        "name": "Neo-Brutalist Pop",
        "project_id": "1277369673546296672",
        "prompt": """A vibrant, energetic Neo-Brutalist Pop mobile calorie and fitness tracker, mobile viewport (390px width), high-contrast bold aesthetic (Warm cream canvas #FFFDF5, thick solid black borders border-[2.5px] border-black, hard-edged black drop shadows shadow-[4px_4px_0px_#000000]).

Key Visual & Functional Requirements:
1. Loud Punchy Header:
   - Fun avatar with black border, greeting 'ХЕЙ, АЛЕКСАНДР! ⚡', and a bright yellow comic sticker badge '🔥 7 ДНЕЙ В УДАРЕ!' with hard black shadow.
   - Chunky 7-day week selector with bold black borders; today is filled with Electric Acid Lime (#A3E635).

2. Energy Battery & Calorie Hero Card (Bright Electric Yellow #FDE047 background, 3px black border, shadow-[5px_5px_0px_#000], rounded-2xl p-5):
   - Huge bold comic typography: 'ОСТАЛОСЬ 650 ККАЛ' (из 2 100).
   - Thick cartoonish energy progress bar with comic diagonal stripes.
   - 3 high-contrast macro blocks with thick borders:
     * [ БЕЛКИ: 110г / 140г ] in Bubblegum Coral (#FB7185)
     * [ ЖИРЫ: 45г / 65г ] in Electric Orange (#FB923C)
     * [ УГЛЕВОДЫ: 165г / 220г ] in Sky Blue (#38BDF8)

3. Tactile Water & Steps Cards:
   - Water block in Cyan with '+250 МЛ' chunky pushable button.
   - Activity block in Acid Lime with sneaker icon: 8,450 шагов.

4. Chunky Food Feed:
   - '🍳 ЗАВТРАК 540 ккал' (White card, yellow tag, black border, shadow-[3px_3px_0px_#000]): 'Овсяная каша с черникой', 'Кофе с молоком'.
   - '🥗 ОБЕД 720 ккал' (White card, lime tag): 'Стейк индейки гриль', 'Гречневая каша'.
   - '+ ЗАПИСАТЬ УЖИН' (Dotted black border card).

5. Retro-Pop Action Dock:
   - Chunky white bottom bar with 2.5px black border and shadow-[4px_4px_0px_#000].
   - Central giant circular Yellow button with thick black border: '📷 AI СКАНЕР' (hard shadow, looks like an arcade button).

Typography: Bold heavyweight sans (Archivo / Space Grotesk), uppercase labels, playful sticker badges, tactile 3D retro feel, Russian text."""
    },
    {
        "id": "3_cyber_hud",
        "name": "Cyber Bio-HUD",
        "project_id": "12681834509373312105",
        "prompt": """A futuristic Sci-Fi Bio-Hacking HUD mobile nutrition and metabolic telemetry tracker, mobile viewport (390px width), pure OLED Jet Black (#04070D), neon glowing accents (Hyper Neon Lime #00FF87, Electric Cyber Cyan #00F0FF, Ultraviolet #8B5CF6, Hot Crimson #FF3366).

Key Visual & Functional Requirements:
1. Biometric Telemetry Header:
   - Technical status: 'OPERATOR: ALEXANDER' | 'METABOLIC STATUS: OPTIMAL' with pulsing neon green dot.
   - Streak HUD pill: '[ STREAK: 07_DAYS // 100% ]'.
   - Compact horizontal day telemetry line (D1-D7) with glowing cyber-cyan node for active day.

2. Central Biometric Nutrition Radar & Energy Matrix (Dark glass container #0A0F1A with holographic cyan border and corner brackets):
   - Circular telemetry gauge / radial multi-sensor dial with glowing neon rings.
   - Digital readout in center: '650' with sublabel 'KCAL_REMAINING // TARGET: 2100'.
   - Neon digital telemetry bars for macros:
     * [PRT] PROTEIN: 110g / 140g (Glowing Violet #8B5CF6) [78%]
     * [LPD] LIPIDS: 45g / 65g (Glowing Amber #F59E0B) [69%]
     * [CRB] CARBS: 165g / 220g (Glowing Cyan #00F0FF) [75%]

3. Metabolic Vitality Widgets:
   - HYDRATION_LEVEL: 1.8L / 2.5L (Digital neon gauge with quick pulse +250ml).
   - CALORIC_BURN: 420 KCAL // 8,450 STEPS (Mini sparkline curve).

4. Intake Sequence (Categorized meal telemetry cards with glowing left accent lines):
   - '[01] BREAKFAST // 540 KCAL' (Oatmeal 250g, Espresso).
   - '[02] LUNCH // 720 KCAL' (Grilled Salmon 180g, Quinoa 150g).
   - '[03] DINNER // PENDING' (Bracketed outline with '[ + INITIALIZE_MEAL ]').

5. Holographic Flight-Stick Bottom Dock:
   - Sleek carbon-mesh floating dock with glowing neon edge.
   - Central prominent glowing Neon Lime AI Vision HUD button with crosshair icon '[ AI_SCAN ]'.

Typography: Technical monospace and modern geometric sans (JetBrains Mono / Plus Jakarta Sans), Russian/English telemetry labels, sci-fi borders, cybernetic high-tech health telemetry aesthetic."""
    }
]


def generate_and_poll(c):
    print(f"\n=======================================================", flush=True)
    print(f"[*] Starting Concept: {c['name']} (Project: {c['project_id']})", flush=True)
    print(f"=======================================================", flush=True)

    try:
        call_mcp_tool("generate_screen_from_text", {
            "projectId": c["project_id"],
            "prompt": c["prompt"],
            "deviceType": "MOBILE",
            "modelId": "GEMINI_3_8_FLASH"
        })
        print(f"[+] Call returned for {c['name']}", flush=True)
    except Exception as e:
        print(f"[*] Call info for {c['name']}: {e}", flush=True)

    # Poll screens up to 8 times (every 15s)
    for attempt in range(1, 9):
        time.sleep(15)
        try:
            screens_data = call_mcp_tool("list_screens", {"projectId": f"projects/{c['project_id']}"})
            screens = screens_data.get("screens", [])
            valid_screens = [s for s in screens if s.get("name")]
            if valid_screens:
                print(f"[+] Found {len(valid_screens)} screen(s) in {c['name']} (Attempt {attempt}):", flush=True)
                for s in valid_screens:
                    print(f"    - {s.get('title')} ({s.get('name')})", flush=True)
                return valid_screens[0]
            print(f"[*] Waiting for screen generation in {c['name']} (Attempt {attempt}/8)...", flush=True)
        except Exception as e:
            print(f"[!] Polling check error: {e}", flush=True)

    return None


def run():
    print("[+] Starting pipeline for 3 distinct design concepts...", flush=True)
    out_base = ROOT_DIR / "docs" / "stitch_screens" / "concepts"
    out_base.mkdir(parents=True, exist_ok=True)

    manifest = []

    for c in CONCEPTS:
        screen = generate_and_poll(c)
        if not screen:
            print(f"[!] Failed to obtain screen for {c['name']}", flush=True)
            continue

        screen_name = screen.get("name")
        concept_dir = out_base / c["id"]
        concept_dir.mkdir(parents=True, exist_ok=True)

        print(f"[*] Downloading {c['name']} assets from {screen_name}...", flush=True)
        try:
            details = call_mcp_tool("get_screen", {"name": screen_name})
            title = screen.get("title") or c["name"]
            clean_title = title.replace("/", "-").replace("\\", "-").replace(":", "-").replace(" ", "_").strip()
            screen_id = screen_name.split("/")[-1]

            html_url = details.get("htmlCode", {}).get("downloadUrl")
            html_file = f"{clean_title}_{screen_id}.html"
            if html_url:
                with urllib.request.urlopen(html_url, timeout=60) as r:
                    html_text = r.read().decode("utf-8", errors="replace")
                    with open(concept_dir / html_file, "w", encoding="utf-8") as f:
                        f.write(html_text)
                print(f"    - Saved HTML: {html_file}", flush=True)

            ss_url = details.get("screenshot", {}).get("downloadUrl")
            ss_file = f"{clean_title}_{screen_id}.png"
            if ss_url:
                with urllib.request.urlopen(ss_url, timeout=60) as r:
                    ss_data = r.read()
                    with open(concept_dir / ss_file, "wb") as f:
                        f.write(ss_data)
                print(f"    - Saved Screenshot: {ss_file}", flush=True)

            manifest.append({
                "conceptId": c["id"],
                "conceptName": c["name"],
                "screenName": screen_name,
                "title": title,
                "htmlFile": str(Path("concepts") / c["id"] / html_file) if html_url else None,
                "screenshotFile": str(Path("concepts") / c["id"] / ss_file) if ss_url else None
            })
        except Exception as e:
            print(f"[!] Error downloading {c['name']}: {e}", flush=True)

    with open(out_base / "concepts_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print("\n[OK] Pipeline completed! Manifest saved to concepts_manifest.json", flush=True)


if __name__ == "__main__":
    run()
