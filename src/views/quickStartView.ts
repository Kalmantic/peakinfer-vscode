/**
 * Quick Start Sidebar View
 *
 * AI-native quick start guide with context-aware guidance,
 * workspace overview, and quick insights from last analysis.
 */

import * as vscode from 'vscode';
import { DiagnosticsManager } from '../diagnostics';
import { ImpactCalculator, ImpactSummary } from '../utils/impactCalculator';
import { AnalysisResult } from '../analysis';

interface WorkspaceStats {
  llmFilesCount: number;
  estimatedInferencePoints: number;
  lastAnalyzed: Date | null;
  lastResults: AnalysisResult[] | null;
}

interface CurrentFileInfo {
  fileName: string;
  filePath: string;
  hasLLMCode: boolean;
  inferencePointsEstimate: number;
}

export class QuickStartViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'peakinfer.quickStart';
  private _view?: vscode.WebviewView;
  private diagnosticsManager?: DiagnosticsManager;
  private workspaceStats: WorkspaceStats = {
    llmFilesCount: 0,
    estimatedInferencePoints: 0,
    lastAnalyzed: null,
    lastResults: null,
  };
  private currentFileInfo: CurrentFileInfo | null = null;
  private lastImpactSummary: ImpactSummary | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    diagnosticsManager?: DiagnosticsManager
  ) {
    this.diagnosticsManager = diagnosticsManager;

    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.updateCurrentFileInfo(editor.document);
        this.refreshView();
      }
    });

    // Update on diagnostics change
    if (diagnosticsManager) {
      diagnosticsManager.onDiagnosticsChanged(() => {
        this.refreshView();
      });
    }
  }

  /**
   * Set the diagnostics manager (for late binding)
   */
  setDiagnosticsManager(manager: DiagnosticsManager): void {
    this.diagnosticsManager = manager;
    manager.onDiagnosticsChanged(() => {
      this.refreshView();
    });
  }

  /**
   * Update with last analysis results
   */
  updateWithResults(results: AnalysisResult[]): void {
    this.workspaceStats.lastResults = results;
    this.workspaceStats.lastAnalyzed = new Date();
    if (results.length > 0) {
      this.lastImpactSummary = ImpactCalculator.calculateImpactSummary(results);
    }
    this.refreshView();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    // Initial file info
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateCurrentFileInfo(editor.document);
    }

    // Scan workspace for LLM files
    this.scanWorkspace();

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'analyzeFile':
          vscode.commands.executeCommand('peakinfer.analyzeFile');
          break;
        case 'analyzeWorkspace':
          vscode.commands.executeCommand('peakinfer.analyzeWorkspace');
          break;
        case 'setToken':
          vscode.commands.executeCommand('peakinfer.setToken');
          break;
        case 'openWalkthrough':
          vscode.commands.executeCommand('peakinfer.openWalkthrough');
          break;
        case 'showResults':
          vscode.commands.executeCommand('peakinfer.showResults');
          break;
      }
    });
  }

  private refreshView(): void {
    if (this._view) {
      this._view.webview.html = this.getHtmlContent(this._view.webview);
    }
  }

  private updateCurrentFileInfo(document: vscode.TextDocument): void {
    const fileName = document.fileName.split('/').pop() || document.fileName;
    const content = document.getText();

    // Check for LLM patterns
    const llmPatterns = [
      /openai\.(ChatCompletion|Completion|chat\.completions)/i,
      /anthropic\.(messages|completions)/i,
      /client\.(chat|completions|messages)/i,
      /model\s*[:=]\s*["'](gpt-|claude-|gemini-|llama)/i,
      /\.create\s*\(\s*\{[^}]*model\s*:/i,
      /from\s+(openai|anthropic|google\.generativeai)/i,
      /import\s+.*\b(OpenAI|Anthropic|ChatOpenAI)\b/i,
    ];

    const hasLLMCode = llmPatterns.some((pattern) => pattern.test(content));

    // Estimate inference points based on patterns
    let inferencePointsEstimate = 0;
    if (hasLLMCode) {
      const createCalls = (content.match(/\.create\s*\(/g) || []).length;
      const generateCalls = (content.match(/\.generate\s*\(/g) || []).length;
      const chatCalls = (content.match(/chat\.completions/g) || []).length;
      const messageCalls = (content.match(/messages\.create/g) || []).length;
      inferencePointsEstimate = Math.max(1, createCalls + generateCalls + chatCalls + messageCalls);
    }

    this.currentFileInfo = {
      fileName,
      filePath: document.fileName,
      hasLLMCode,
      inferencePointsEstimate,
    };
  }

  private async scanWorkspace(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,py,go,rs}',
      '**/node_modules/**',
      100
    );

    let llmFilesCount = 0;
    let estimatedInferencePoints = 0;

    const llmKeywords = [
      'openai',
      'anthropic',
      'chat.completions',
      'messages.create',
      'gpt-4',
      'gpt-3.5',
      'claude-',
      'gemini',
    ];

    for (const file of files.slice(0, 50)) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const content = doc.getText().toLowerCase();

        if (llmKeywords.some((kw) => content.includes(kw))) {
          llmFilesCount++;
          // Estimate ~3 inference points per LLM file on average
          estimatedInferencePoints += 3;
        }
      } catch {
        // Skip unreadable files
      }
    }

    this.workspaceStats.llmFilesCount = llmFilesCount;
    this.workspaceStats.estimatedInferencePoints = estimatedInferencePoints;
    this.refreshView();
  }

  private getHtmlContent(_webview: vscode.Webview): string {
    const fileInfo = this.currentFileInfo;
    const stats = this.workspaceStats;
    const impact = this.lastImpactSummary;

    // Determine ready state
    const isReady = fileInfo?.hasLLMCode;
    const hasWorkspaceData = stats.llmFilesCount > 0;
    const hasLastResults = stats.lastResults && stats.lastResults.length > 0;

    // Get diagnostic counts
    let criticalCount = 0;
    let warningCount = 0;
    let totalIssues = 0;

    if (this.diagnosticsManager) {
      const allDiagnostics = this.diagnosticsManager.getAllDiagnostics();
      allDiagnostics.forEach(([_uri, diagnostics]) => {
        diagnostics.forEach((d) => {
          totalIssues++;
          if (d.severity === vscode.DiagnosticSeverity.Error) {
            criticalCount++;
          } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
            warningCount++;
          }
        });
      });
    }

    // Format last analyzed time
    let lastAnalyzedText = '';
    if (stats.lastAnalyzed) {
      const now = new Date();
      const diff = now.getTime() - stats.lastAnalyzed.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);

      if (minutes < 1) {
        lastAnalyzedText = 'Just now';
      } else if (minutes < 60) {
        lastAnalyzedText = `${minutes} min ago`;
      } else if (hours < 24) {
        lastAnalyzedText = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        lastAnalyzedText = stats.lastAnalyzed.toLocaleDateString();
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer Quick Start</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 12px;
      margin: 0;
      font-size: 12px;
    }

    .ready-banner {
      padding: 14px;
      background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .ready-banner.detected {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%);
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .ready-banner.not-detected {
      background: var(--vscode-editor-inactiveSelectionBackground);
    }

    .ready-icon {
      font-size: 16px;
      margin-right: 8px;
    }

    .ready-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .ready-subtitle {
      font-size: 11px;
      opacity: 0.9;
    }

    .primary-action {
      margin-top: 12px;
    }

    .primary-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 10px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }

    .primary-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .primary-btn .icon {
      font-size: 14px;
    }

    .primary-btn .shortcut {
      font-size: 10px;
      padding: 2px 6px;
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
      margin-left: auto;
    }

    .section {
      margin-bottom: 16px;
    }

    .section-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 10px;
      letter-spacing: 0.5px;
    }

    .workspace-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
    }

    .workspace-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .stat-item {
      text-align: center;
      padding: 8px;
      background: var(--vscode-sideBar-background);
      border-radius: 4px;
    }

    .stat-value {
      font-size: 16px;
      font-weight: 600;
    }

    .stat-label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    .last-analyzed {
      text-align: center;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 8px;
    }

    .workspace-actions {
      display: flex;
      gap: 6px;
      margin-top: 10px;
    }

    .workspace-btn {
      flex: 1;
      padding: 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }

    .workspace-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .insights-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 6px;
      padding: 12px;
    }

    .insight-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 11px;
    }

    .insight-row:not(:last-child) {
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .insight-icon {
      width: 20px;
      text-align: center;
    }

    .insight-text {
      flex: 1;
    }

    .insight-value {
      font-weight: 600;
    }

    .insight-value.critical {
      color: var(--vscode-errorForeground);
    }

    .insight-value.savings {
      color: var(--vscode-testing-iconPassed);
    }

    .no-insights {
      text-align: center;
      padding: 16px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      margin-bottom: 6px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      text-align: left;
    }

    .action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .action-btn .icon {
      font-size: 14px;
      width: 20px;
      text-align: center;
    }

    .action-btn .text {
      flex: 1;
    }

    .features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .feature {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 10px 8px;
      border-radius: 4px;
      text-align: center;
    }

    .feature .icon {
      font-size: 18px;
      margin-bottom: 4px;
    }

    .feature .label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .tip {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding: 10px 12px;
      border-radius: 0 4px 4px 0;
      font-size: 11px;
      line-height: 1.5;
      margin-top: 12px;
    }

    .tip strong {
      color: var(--vscode-textLink-foreground);
    }

    .empty-state {
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state .icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  ${
    isReady
      ? `
  <div class="ready-banner detected">
    <div class="ready-title"><span class="ready-icon">&#9889;</span>Ready to Analyze</div>
    <div class="ready-subtitle">LLM code detected in ${fileInfo?.fileName}</div>
    ${
      fileInfo?.inferencePointsEstimate
        ? `<div class="ready-subtitle">${fileInfo.inferencePointsEstimate} potential inference point${fileInfo.inferencePointsEstimate !== 1 ? 's' : ''}</div>`
        : ''
    }
    <div class="primary-action">
      <button class="primary-btn" onclick="analyzeFile()">
        <span class="icon">&#128269;</span>
        <span>Analyze This File</span>
        <span class="shortcut">Cmd+Alt+P</span>
      </button>
    </div>
  </div>
  `
      : `
  <div class="ready-banner not-detected">
    <div class="ready-title"><span class="ready-icon">&#128203;</span>PeakInfer</div>
    <div class="ready-subtitle">${fileInfo ? `${fileInfo.fileName} - No LLM code detected` : 'Open a file with LLM code to analyze'}</div>
    <div class="primary-action">
      <button class="primary-btn" onclick="analyzeWorkspace()">
        <span class="icon">&#128194;</span>
        <span>Analyze Workspace</span>
      </button>
    </div>
  </div>
  `
  }

  ${
    hasWorkspaceData
      ? `
  <div class="section">
    <div class="section-title">&#128200; Workspace Overview</div>
    <div class="workspace-card">
      <div class="workspace-stats">
        <div class="stat-item">
          <div class="stat-value">${stats.llmFilesCount}</div>
          <div class="stat-label">Files with LLM code</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">~${stats.estimatedInferencePoints}</div>
          <div class="stat-label">Est. Inference Points</div>
        </div>
      </div>
      ${lastAnalyzedText ? `<div class="last-analyzed">Last analyzed: ${lastAnalyzedText}</div>` : ''}
      <div class="workspace-actions">
        <button class="workspace-btn" onclick="analyzeWorkspace()">Analyze All</button>
        ${hasLastResults ? `<button class="workspace-btn" onclick="showResults()">View Results</button>` : ''}
      </div>
    </div>
  </div>
  `
      : ''
  }

  ${
    totalIssues > 0 || impact
      ? `
  <div class="section">
    <div class="section-title">&#128161; Quick Insights</div>
    <div class="insights-card">
      ${
        totalIssues > 0
          ? `
      <div class="insight-row">
        <span class="insight-icon">&#128680;</span>
        <span class="insight-text">Issues found</span>
        <span class="insight-value ${criticalCount > 0 ? 'critical' : ''}">${criticalCount > 0 ? `${criticalCount} critical, ${warningCount} warnings` : `${totalIssues} total`}</span>
      </div>
      `
          : ''
      }
      ${
        impact && impact.estimatedMonthlyWaste > 0
          ? `
      <div class="insight-row">
        <span class="insight-icon">&#128176;</span>
        <span class="insight-text">Est. monthly waste</span>
        <span class="insight-value savings">${ImpactCalculator.formatCurrency(impact.estimatedMonthlyWaste)}</span>
      </div>
      `
          : ''
      }
      ${
        impact && impact.topIssuesBySavings.length > 0
          ? `
      <div class="insight-row">
        <span class="insight-icon">&#127919;</span>
        <span class="insight-text">Top issue</span>
        <span class="insight-value">${impact.topIssuesBySavings[0].issue.title.substring(0, 25)}${impact.topIssuesBySavings[0].issue.title.length > 25 ? '...' : ''}</span>
      </div>
      `
          : ''
      }
    </div>
  </div>
  `
      : hasLastResults
        ? ''
        : `
  <div class="section">
    <div class="section-title">&#128161; Quick Insights</div>
    <div class="insights-card">
      <div class="no-insights">
        Run an analysis to see insights
      </div>
    </div>
  </div>
  `
  }

  <div class="section">
    <div class="section-title">Setup</div>
    <button class="action-btn" onclick="setToken()">
      <span class="icon">&#128273;</span>
      <span class="text">Set Token</span>
    </button>
    <button class="action-btn" onclick="openWalkthrough()">
      <span class="icon">&#128218;</span>
      <span class="text">Getting Started Guide</span>
    </button>
  </div>

  <div class="section">
    <div class="section-title">What We Detect</div>
    <div class="features">
      <div class="feature">
        <div class="icon">&#128176;</div>
        <div class="label">Cost Waste</div>
      </div>
      <div class="feature">
        <div class="icon">&#9889;</div>
        <div class="label">Latency</div>
      </div>
      <div class="feature">
        <div class="icon">&#128200;</div>
        <div class="label">Throughput</div>
      </div>
      <div class="feature">
        <div class="icon">&#128737;</div>
        <div class="label">Reliability</div>
      </div>
    </div>
  </div>

  <div class="tip">
    <strong>Tip:</strong> ${isReady ? 'Press <strong>Cmd+Alt+P</strong> to analyze instantly!' : 'Open a file with LLM code (OpenAI, Anthropic, etc.) to get started.'}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function analyzeFile() {
      vscode.postMessage({ command: 'analyzeFile' });
    }

    function analyzeWorkspace() {
      vscode.postMessage({ command: 'analyzeWorkspace' });
    }

    function setToken() {
      vscode.postMessage({ command: 'setToken' });
    }

    function openWalkthrough() {
      vscode.postMessage({ command: 'openWalkthrough' });
    }

    function showResults() {
      vscode.postMessage({ command: 'showResults' });
    }
  </script>
</body>
</html>`;
  }
}
