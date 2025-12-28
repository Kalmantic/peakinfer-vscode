# PeakInfer for VS Code

Analyze LLM inference points in your code for cost, latency, throughput, and reliability issues - directly in VS Code.

## Features

- **Inline Diagnostics**: See issues highlighted in your code
- **Results Panel**: Comprehensive analysis view
- **Benchmark Comparison**: Compare to InferenceMAX benchmarks
- **Multiple Languages**: TypeScript, JavaScript, Python, Go, Rust

## Installation

1. Install from VS Code Marketplace: Search "PeakInfer"
2. Or install from VSIX:
   ```bash
   code --install-extension peakinfer-1.0.0.vsix
   ```

## Setup

PeakInfer uses Claude for semantic analysis. Configure your Anthropic API key:

### Option 1: VS Code Settings (Recommended)

1. Open Settings (Cmd+, / Ctrl+,)
2. Search "PeakInfer"
3. Enter your API key in "Anthropic Api Key"

### Option 2: Environment Variable

Set `ANTHROPIC_API_KEY` in your shell:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Get your API key at [console.anthropic.com](https://console.anthropic.com/).

## Usage

### Analyze Current File

- Command Palette: `PeakInfer: Analyze Current File`
- Keyboard: Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows/Linux)
- Right-click in editor: "PeakInfer: Analyze Current File"

### Analyze Workspace

- Command Palette: `PeakInfer: Analyze Workspace`
- Right-click folder in Explorer: "PeakInfer: Analyze Workspace"

### View Results

- Command Palette: `PeakInfer: Show Results Panel`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `peakinfer.anthropicApiKey` | `""` | Anthropic API key (or use env var) |
| `peakinfer.analyzeOnSave` | `false` | Auto-analyze on file save |
| `peakinfer.showInlineHints` | `true` | Show inline hints for issues |
| `peakinfer.severityThreshold` | `warning` | Minimum severity to show |
| `peakinfer.model` | `claude-sonnet-4-latest` | Claude model for analysis |
| `peakinfer.includeBenchmarks` | `true` | Include benchmark comparisons |
| `peakinfer.excludePatterns` | `["**/node_modules/**", ...]` | Patterns to exclude |

## Commands

| Command | Description |
|---------|-------------|
| `PeakInfer: Analyze Current File` | Analyze the active file |
| `PeakInfer: Analyze Workspace` | Analyze entire workspace |
| `PeakInfer: Show Results Panel` | Open results panel |
| `PeakInfer: Clear Diagnostics` | Clear all diagnostics |
| `PeakInfer: Set Anthropic API Key` | Configure API key |

## What It Finds

PeakInfer analyzes every LLM inference point across 4 dimensions:

| Dimension | Examples |
|-----------|----------|
| **Cost** | GPT-4 used for tasks GPT-3.5 could handle |
| **Latency** | Missing streaming, blocking calls |
| **Throughput** | Sequential loops that could be parallel |
| **Reliability** | No retry, no timeout, no fallback |

## Supported Providers

- OpenAI (GPT-4, GPT-3.5, etc.)
- Anthropic (Claude)
- Azure OpenAI
- AWS Bedrock
- Google Vertex AI
- vLLM, TensorRT-LLM (HTTP detection)
- LangChain, LlamaIndex (framework detection)

## Privacy

All analysis runs locally using your Anthropic API key. No code is sent to PeakInfer servers.

## Troubleshooting

### No diagnostics appearing

1. Check API key is configured (Settings or env var)
2. Ensure file contains LLM API calls
3. Check Output panel for errors (View > Output > PeakInfer)

### Analysis taking too long

Large files may take 10-30 seconds. Check Output panel for progress.

### Rate limits

If you see rate limit errors, wait a moment and try again.

## Links

- [GitHub](https://github.com/Kalmantic/peakinfer)
- [Documentation](https://github.com/Kalmantic/peakinfer#readme)
- [Report Issues](https://github.com/Kalmantic/peakinfer/issues)

## License

Apache-2.0 - See [LICENSE](https://github.com/Kalmantic/peakinfer/blob/main/LICENSE)
