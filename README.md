# PeakInfer for VS Code

**Achieve peak inference performance—directly in your editor.**

PeakInfer analyzes every LLM inference point in your code to find what's holding back your latency, throughput, and reliability.

## The Problem

Your code says `streaming: true`. Runtime shows 0% actual streams. That's drift—and you can't see it until production.

**Peak Inference Performance means:** Improving latency, throughput, reliability, and cost *without changing evaluated behavior*.

## Features

- **Inline Diagnostics**: See performance issues highlighted in your code
- **Drift Detection**: Find mismatches between code declarations and runtime behavior
- **Results Panel**: Comprehensive analysis view with actionable recommendations
- **Benchmark Comparison**: Compare to InferenceMAX benchmarks (15+ models)
- **Multiple Languages**: TypeScript, JavaScript, Python, Go, Rust

## Installation

1. Install from VS Code Marketplace: Search "PeakInfer" or [install directly](https://marketplace.visualstudio.com/items?itemName=kalmantic.peakinfer)
2. Or via command line:
   ```bash
   code --install-extension kalmantic.peakinfer
   ```

## Setup

Get your PeakInfer token at [peakinfer.com/dashboard](https://peakinfer.com/dashboard) — sign in with GitHub, generate token.

*50 free credits included. No credit card.*

### Configure Your Token

**Option 1: VS Code Settings (Recommended)**

1. Open Settings (Cmd+, / Ctrl+,)
2. Search "PeakInfer"
3. Enter your token in "PeakInfer Token"

**Option 2: Environment Variable**

Set `PEAKINFER_TOKEN` in your shell:

```bash
export PEAKINFER_TOKEN=pk_your-token-here
```

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

## The Four Dimensions

PeakInfer analyzes every inference point across 4 dimensions:

| Dimension | What We Find |
|-----------|--------------|
| **Latency** | Missing streaming, blocking calls, p95 vs benchmark gaps |
| **Throughput** | Sequential bottlenecks, batch opportunities |
| **Reliability** | Missing retries, timeouts, fallbacks |
| **Cost** | Right-sized model selection, token optimization |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `peakinfer.token` | `""` | PeakInfer token (or use env var) |
| `peakinfer.analyzeOnSave` | `false` | Auto-analyze on file save |
| `peakinfer.showInlineHints` | `true` | Show inline hints for issues |
| `peakinfer.severityThreshold` | `warning` | Minimum severity to show |
| `peakinfer.includeBenchmarks` | `true` | Include benchmark comparisons |
| `peakinfer.excludePatterns` | `["**/node_modules/**", ...]` | Patterns to exclude |

## Commands

| Command | Description |
|---------|-------------|
| `PeakInfer: Analyze Current File` | Analyze the active file |
| `PeakInfer: Analyze Workspace` | Analyze entire workspace |
| `PeakInfer: Show Results Panel` | Open results panel |
| `PeakInfer: Clear Diagnostics` | Clear all diagnostics |
| `PeakInfer: Set Token` | Configure PeakInfer token |

## Supported Providers

- OpenAI (GPT-4o, GPT-4, GPT-3.5, etc.)
- Anthropic (Claude)
- Azure OpenAI
- AWS Bedrock
- Google Vertex AI
- vLLM, TensorRT-LLM (HTTP detection)
- LangChain, LlamaIndex (framework detection)

## Pricing

Same as GitHub Action:
- **Free**: 50 credits one-time (6-month expiry)
- **Starter**: $19 for 200 credits
- **Growth**: $49 for 600 credits
- **Scale**: $149 for 2,000 credits

Credits are shared across VS Code and GitHub Action.

[View pricing →](https://peakinfer.com/pricing)

## Troubleshooting

### No diagnostics appearing

1. Check token is configured (Settings or env var)
2. Ensure file contains LLM API calls
3. Check Output panel for errors (View > Output > PeakInfer)

### Analysis taking too long

Large files may take 10-30 seconds. Check Output panel for progress.

### Insufficient credits

Check balance at [peakinfer.com/dashboard](https://peakinfer.com/dashboard)

## Links

- [PeakInfer CLI](https://github.com/Kalmantic/peakinfer)
- [PeakInfer MCP Server](https://github.com/Kalmantic/peakinfer-mcp)
- [GitHub Action](https://github.com/Kalmantic/peakinfer-action)
- [Get Token](https://peakinfer.com/dashboard)
- [Report Issues](https://github.com/Kalmantic/peakinfer-vscode/issues)

## License

Apache-2.0
