# Changelog

All notable changes to the PeakInfer VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-04

### Added

- **Analyze Current File** - Run LLM inference analysis on the active file
- **Analyze Workspace** - Analyze all supported files in the workspace
- **Inline Diagnostics** - Issues appear as squiggly lines in the editor
- **Results Panel** - Comprehensive view of all analysis findings
- **PeakInfer Token Auth** - Use credits from peakinfer.com (50 free)
- **Severity Filtering** - Show only errors, warnings, or all issues
- **Context Menu** - Right-click to analyze files and folders

### Supported Languages

- TypeScript / JavaScript
- Python
- Go
- Rust

### Analysis Dimensions

- **Cost** - Token usage, model selection, caching opportunities
- **Latency** - Streaming, timeouts, async patterns
- **Throughput** - Batching, concurrency, rate limiting
- **Reliability** - Error handling, retries, fallbacks

## [Unreleased]

### Planned

- Auto-analyze on save option
- Custom severity thresholds
- InferenceMAX benchmark comparisons
