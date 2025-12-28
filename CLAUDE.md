# PeakInfer VS Code Extension - Project Overview

This is the **peakinfer-vscode** (VS Code Extension) repository.

## Key Information

- **Type:** VS Code Extension
- **Mode:** BYOK (Bring Your Own Key)
- **Analysis:** Local using Claude Agent SDK

---

## Architecture

### What This Extension Does

1. User triggers analysis (command or on-save)
2. Reads API key from settings or `ANTHROPIC_API_KEY` env var
3. Calls Claude Agent SDK with unified-analyzer prompt
4. Displays results as VS Code diagnostics
5. Shows results in webview panel

### Key Features

- **Inline Diagnostics:** Squiggly lines in editor
- **Results Panel:** Comprehensive analysis view
- **Configurable Model:** Default `claude-sonnet-4-latest`
- **Error/Loading States:** Spinner, retry button, help text

---

## Key Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Activation, command registration |
| `src/analysis.ts` | AnalysisRunner with Claude Agent SDK |
| `src/diagnostics.ts` | VS Code diagnostics integration |
| `src/views/resultsPanel.ts` | Webview panel with states |
| `package.json` | Commands, settings, keybindings |

---

## Configuration Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `peakinfer.anthropicApiKey` | `""` | Anthropic API key |
| `peakinfer.model` | `claude-sonnet-4-latest` | Claude model |
| `peakinfer.analyzeOnSave` | `false` | Auto-analyze on save |
| `peakinfer.showInlineHints` | `true` | Show inline hints |
| `peakinfer.severityThreshold` | `warning` | Minimum severity |
| `peakinfer.includeBenchmarks` | `true` | Include benchmarks |

---

## Commands

| Command | Description |
|---------|-------------|
| `peakinfer.analyzeFile` | Analyze current file |
| `peakinfer.analyzeWorkspace` | Analyze entire workspace |
| `peakinfer.showResults` | Show results panel |
| `peakinfer.clearDiagnostics` | Clear diagnostics |
| `peakinfer.setApiKey` | Set Anthropic API key |

---

## Session Memory (Last Updated: December 28, 2025)

### Current State

**v1.9.5 Status:** ✅ 100% Complete - Ready for Release

### Work Completed This Session

**Files Modified:**
- `package.json` - Added `peakinfer.model` configuration setting
- `src/analysis.ts` - Made model configurable (was hardcoded)
- `src/views/resultsPanel.ts` - Added error/loading states

**Key Changes:**
- Model now configurable via settings (default: `claude-sonnet-4-latest`)
- Results panel shows loading spinner during analysis
- Results panel shows error state with retry button and help text

### Cross-Repo Context

| Repository | Role | Status |
|------------|------|--------|
| `peakinfer/` (CLI) | Public, BYOK | ✅ Complete |
| `peakinfer-mcp/` | MCP Server (separate) | ✅ Complete |
| `peakinfer-action/` | Public, API client | ✅ Complete |
| `peakinfer-site/` | Private, API + Website | ✅ Complete |
| `peakinfer-vscode/` (this repo) | VS Code Extension | ✅ Complete |
| `peakinfer_templates/` | Community templates | ✅ Complete |

### Important Context

1. **True BYOK** - analysis runs locally with user's API key
2. **Supports both** settings AND env var for API key
3. **Model configurable** - `peakinfer.model` setting
4. **Error states** - showLoading(), showError(), retry button

### Reference Documents

| Document | Location |
|----------|----------|
| Implementation Guide | `peakinfer/design/PeakInfer Implementation v1.9.5.md` |
| Main CLAUDE.md | `peakinfer/CLAUDE.md` |
| VS Code README | `README.md` |
