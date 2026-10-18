"""
Stitch MCP Helper CLI for KaloriiAI.
Provides direct access to Stitch MCP tools to list, inspect, pull, and generate UI designs.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# Force UTF-8 for console output on Windows
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / ".agents" / "mcp_config.json"
DEFAULT_PROJECT_ID = "projects/9045932829388391320"


def load_config():
    api_key = os.environ.get("STITCH_API_KEY")
    server_url = os.environ.get("STITCH_SERVER_URL", "https://stitch.googleapis.com/mcp")

    if not api_key and CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                stitch_cfg = data.get("mcpServers", {}).get("stitch", {})
                server_url = stitch_cfg.get("serverUrl") or stitch_cfg.get("url") or server_url
                headers = stitch_cfg.get("headers", {})
                api_key = headers.get("X-Goog-Api-Key")
        except Exception as e:
            print(f"[!] Warning: Could not read {CONFIG_PATH}: {e}", file=sys.stderr)

    if not api_key:
        print(
            "[!] Error: Stitch API key not found in environment or in .agents/mcp_config.json",
            file=sys.stderr,
        )
        sys.exit(1)

    return server_url, api_key


def call_mcp_tool(tool_name: str, arguments: dict = None) -> dict:
    server_url, api_key = load_config()
    headers = {
        "X-Goog-Api-Key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments or {},
        },
    }

    req = urllib.request.Request(
        server_url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "error" in data:
                raise RuntimeError(f"MCP Error: {data['error']}")

            result = data.get("result", {})
            content = result.get("content", [])
            for item in content:
                if item.get("type") == "text":
                    text = item.get("text", "")
                    try:
                        return json.loads(text)
                    except json.JSONDecodeError:
                        return {"raw_text": text}
            return result
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP Error {e.code}: {err_msg}")
    except Exception as e:
        raise RuntimeError(f"Request Error: {e}")


def cmd_projects(args):
    data = call_mcp_tool("list_projects", {})
    projects = data.get("projects", [])
    print(f"\nFound {len(projects)} Stitch project(s):\n")
    for p in projects:
        name = p.get("name", "N/A")
        title = p.get("title", "(untitled)")
        dev = p.get("deviceType", "N/A")
        upd = p.get("updateTime", "N/A")
        is_default = " [DEFAULT]" if name == DEFAULT_PROJECT_ID else ""
        print(f"  * {title}{is_default}")
        print(f"    ID:     {name}")
        print(f"    Device: {dev} | Updated: {upd}\n")


def cmd_screens(args):
    project_id = args.project_id or DEFAULT_PROJECT_ID
    data = call_mcp_tool("list_screens", {"projectId": project_id})
    screens = data.get("screens", [])
    print(f"\nScreens in {project_id} ({len(screens)} screen(s)):\n")
    for s in screens:
        name = s.get("name", "N/A")
        title = s.get("title", "(untitled)")
        dev = s.get("deviceType", "N/A")
        print(f"  * {title}")
        print(f"    Name:   {name}")
        print(f"    Device: {dev}\n")


def cmd_get_screen(args):
    data = call_mcp_tool("get_screen", {"name": args.screen_name})
    print(f"\nScreen: {data.get('title', 'N/A')}")
    print(f"  Name:       {data.get('name')}")
    print(f"  Device:     {data.get('deviceType')} ({data.get('width')}x{data.get('height')})")
    screenshot = data.get("screenshot", {})
    if screenshot.get("downloadUrl"):
        print(f"  Screenshot: {screenshot.get('downloadUrl')}")
    html_code = data.get("htmlCode", {})
    if html_code.get("downloadUrl"):
        print(f"  HTML URL:   {html_code.get('downloadUrl')}")


def cmd_pull(args):
    project_id = args.project_id or DEFAULT_PROJECT_ID
    out_dir = Path(args.out_dir or (ROOT_DIR / "docs" / "stitch_screens"))
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n[+] Fetching screens from {project_id}...")
    screens_data = call_mcp_tool("list_screens", {"projectId": project_id})
    screens = screens_data.get("screens", [])
    print(f"[+] Found {len(screens)} screens. Downloading to: {out_dir}\n")

    manifest = []
    for s in screens:
        screen_name = s.get("name")
        title = s.get("title", "screen").replace("/", "-").replace("\\", "-").replace(":", "-").strip()
        screen_id = screen_name.split("/")[-1] if screen_name else "screen"

        print(f"[*] Processing: {title} ({screen_id})...")
        screen_details = call_mcp_tool("get_screen", {"name": screen_name})

        # Download HTML
        html_obj = screen_details.get("htmlCode", {})
        html_url = html_obj.get("downloadUrl")
        html_filename = f"{title}_{screen_id}.html"
        html_path = out_dir / html_filename

        if html_url:
            try:
                with urllib.request.urlopen(html_url, timeout=60) as r:
                    html_content = r.read().decode("utf-8", errors="replace")
                    with open(html_path, "w", encoding="utf-8") as f:
                        f.write(html_content)
                print(f"    - Saved HTML: {html_filename} ({len(html_content)} chars)")
            except Exception as e:
                print(f"    [!] Failed to download HTML: {e}")

        # Download Screenshot
        ss_obj = screen_details.get("screenshot", {})
        ss_url = ss_obj.get("downloadUrl")
        ss_filename = f"{title}_{screen_id}.png"
        ss_path = out_dir / ss_filename

        if ss_url:
            try:
                with urllib.request.urlopen(ss_url, timeout=60) as r:
                    ss_data = r.read()
                    with open(ss_path, "wb") as f:
                        f.write(ss_data)
                print(f"    - Saved Screenshot: {ss_filename} ({len(ss_data)} bytes)")
            except Exception as e:
                print(f"    [!] Failed to download Screenshot: {e}")

        manifest.append({
            "title": s.get("title"),
            "name": screen_name,
            "deviceType": screen_details.get("deviceType"),
            "htmlFile": html_filename if html_url else None,
            "screenshotFile": ss_filename if ss_url else None,
        })

    # Save manifest
    with open(out_dir / "screens_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\n[OK] Pull complete! All screens saved to: {out_dir}")


def main():
    parser = argparse.ArgumentParser(description="KaloriiAI Stitch MCP Tool")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: projects
    subparsers.add_parser("projects", help="List all Stitch projects")

    # Subcommand: screens
    p_screens = subparsers.add_parser("screens", help="List screens in a project")
    p_screens.add_argument("project_id", nargs="?", default=DEFAULT_PROJECT_ID, help="Stitch project name/ID")

    # Subcommand: get-screen
    p_get = subparsers.add_parser("get-screen", help="Get screen details")
    p_get.add_argument("screen_name", help="Screen resource name (projects/.../screens/...)")

    # Subcommand: pull
    p_pull = subparsers.add_parser("pull", help="Download all screen HTMLs & screenshots locally")
    p_pull.add_argument("project_id", nargs="?", default=DEFAULT_PROJECT_ID, help="Stitch project name/ID")
    p_pull.add_argument("--out-dir", "-o", help="Target output directory")

    args = parser.parse_args()

    if args.command == "projects":
        cmd_projects(args)
    elif args.command == "screens":
        cmd_screens(args)
    elif args.command == "get-screen":
        cmd_get_screen(args)
    elif args.command == "pull":
        cmd_pull(args)


if __name__ == "__main__":
    main()
