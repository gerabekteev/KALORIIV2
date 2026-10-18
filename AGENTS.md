# KaloriiAI - Agent Guidelines & Integrations

## 🎨 Google Stitch MCP Integration (UI/UX Design & Prototyping)

This project is integrated with **Google Stitch MCP** (`stitch`) for UI design analysis, screen generation, prototyping, and design system synchronization.

### Configuration Files
- **Antigravity Workspace Config**: `.agents/mcp_config.json`
- **Antigravity Plugin**: `.agents/plugins/stitch/mcp_config.json`
- **Antigravity IDE / VS Code**: `.vscode/mcp.json`
- **Settings Fallbacks**: `.antigravity/settings.json`, `.gemini/settings.json`

> **Security Note:** All configuration files containing API keys are excluded in `.gitignore` to prevent leaking credentials to Git remotes.

### Available Stitch Design Concepts
1. **Concept 1: Nordic Light Wellness** (Светлая скандинавская эстетика)
   - **Project ID**: `projects/17204641045655770014`
   - **Local Folder**: `docs/stitch_screens/concepts/1_nordic_light/`
2. **Concept 2: Neo-Brutalist Pop** (Яркий нео-брутализм с черными контурами и жесткими тенями)
   - **Project ID**: `projects/1277369673546296672`
   - **Local Folder**: `docs/stitch_screens/concepts/2_neo_brutalism/`
3. **Concept 3: Cyber Bio-HUD** (Ультра-технологичный биохакинг, неоновый OLED-интерфейс)
   - **Project ID**: `projects/12681834509373312105`
   - **Local Folder**: `docs/stitch_screens/concepts/3_cyber_hud/`
4. **Baseline Modern Clean Health**:
   - **Project ID**: `projects/9045932829388391320`
   - **Local Folder**: `docs/stitch_screens/`

### Stitch Helper CLI (`scripts/stitch_tool.py`)
You can use the helper script for direct operations:
```bash
# List all Stitch projects
python scripts/stitch_tool.py projects

# List screens in the NutriVision project
python scripts/stitch_tool.py screens

# Download all screen HTML code and screenshots locally into docs/stitch_screens/
python scripts/stitch_tool.py pull

# Inspect a specific screen
python scripts/stitch_tool.py get-screen <screen_resource_name>
```

### Workflow for UI/UX Rework & Development
1. **Pull & Inspect Design**: Inspect screens from `docs/stitch_screens/` or use `scripts/stitch_tool.py pull`.
2. **Design Tokens & System**: Inspect the design system, colors, typography, and styling tokens.
3. **Frontend Adaptation**: Map Stitch HTML/Tailwind classes into the React components under `frontend/src/` (e.g. `components/`, `pages/`, `layouts/`).
4. **Generate Variants**: Use Stitch MCP tools (`generate_screen_from_text`, `edit_screens`, `generate_variants`) to iterate on screens when redesigning features.
