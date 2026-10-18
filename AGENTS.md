# KaloriiAI - Agent Guidelines & Integrations

## 🎨 Google Stitch MCP Integration (UI/UX Design & Prototyping)

This project is integrated with **Google Stitch MCP** (`stitch`) for UI design analysis, screen generation, prototyping, and design system synchronization.

### Configuration Files
- **Antigravity Workspace Config**: `.agents/mcp_config.json`
- **Antigravity Plugin**: `.agents/plugins/stitch/mcp_config.json`
- **Antigravity IDE / VS Code**: `.vscode/mcp.json`
- **Settings Fallbacks**: `.antigravity/settings.json`, `.gemini/settings.json`

> **Security Note:** All configuration files containing API keys are excluded in `.gitignore` to prevent leaking credentials to Git remotes.


### Stitch Helper CLI (`scripts/stitch_tool.py`)
You can use the helper script for direct operations:
```bash
# List all Stitch projects
python scripts/stitch_tool.py projects

# List screens in a project
python scripts/stitch_tool.py screens <project_id>

# Download screen HTML code and screenshots locally into docs/stitch_screens/
python scripts/stitch_tool.py pull <project_id>

# Inspect a specific screen
python scripts/stitch_tool.py get-screen <screen_resource_name>
```

### Workflow for UI/UX Rework & Development
1. **Pull & Inspect Design**: Inspect screens from `docs/stitch_screens/` or use `scripts/stitch_tool.py pull`.
2. **Design Tokens & System**: Inspect the design system, colors, typography, and styling tokens.
3. **Frontend Adaptation**: Map Stitch HTML/Tailwind classes into the React components under `frontend/src/` (e.g. `components/`, `pages/`, `layouts/`).
4. **Generate Variants**: Use Stitch MCP tools (`generate_screen_from_text`, `edit_screens`, `generate_variants`) to iterate on screens when redesigning features.
