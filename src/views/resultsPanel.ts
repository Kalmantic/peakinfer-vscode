/**
 * Results Panel
 *
 * Webview panel for displaying PeakInfer analysis results
 */

import * as vscode from 'vscode';
import { AnalysisResult, Issue, InferencePoint } from '../analysis';

export class ResultsPanel {
  private static currentPanel: ResultsPanel | undefined;
  private static extensionUri: vscode.Uri;
  private static results: AnalysisResult[] = [];
  private static errorMessage: string | null = null;
  private static isLoading: boolean = false;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  /**
   * Register the results panel
   */
  static register(context: vscode.ExtensionContext): void {
    ResultsPanel.extensionUri = context.extensionUri;
  }

  /**
   * Show the results panel
   */
  static show(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'peakinferResults',
      'PeakInfer Results',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    ResultsPanel.currentPanel = new ResultsPanel(panel, extensionUri);
  }

  /**
   * Update results in the panel
   */
  static updateResults(results: AnalysisResult[]): void {
    ResultsPanel.results = results;
    ResultsPanel.errorMessage = null;
    ResultsPanel.isLoading = false;
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.updateContent();
    }
  }

  /**
   * Show error state in the panel
   */
  static showError(message: string): void {
    ResultsPanel.errorMessage = message;
    ResultsPanel.isLoading = false;
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.updateContent();
    }
  }

  /**
   * Show loading state in the panel
   */
  static showLoading(): void {
    ResultsPanel.isLoading = true;
    ResultsPanel.errorMessage = null;
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.updateContent();
    }
  }

  /**
   * Clear all results from the panel
   */
  static clearResults(): void {
    ResultsPanel.results = [];
    ResultsPanel.errorMessage = null;
    ResultsPanel.isLoading = false;
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.updateContent();
    }
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;

    // Set initial content
    this.updateContent();

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'openFile':
            this.openFile(message.file, message.line);
            break;
          case 'refresh':
            vscode.commands.executeCommand('peakinfer.analyzeWorkspace');
            break;
        }
      },
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(
      () => {
        ResultsPanel.currentPanel = undefined;
        this.dispose();
      },
      null,
      this.disposables
    );
  }

  private dispose(): void {
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private openFile(file: string, line: number): void {
    const uri = vscode.Uri.file(file);
    vscode.window.showTextDocument(uri, {
      selection: new vscode.Range(line - 1, 0, line - 1, 0),
    });
  }

  private updateContent(): void {
    this.panel.webview.html = this.getHtmlContent(ResultsPanel.results);
  }

  private getHtmlContent(results: AnalysisResult[]): string {
    // Handle loading state
    if (ResultsPanel.isLoading) {
      return this.getLoadingHtml();
    }

    // Handle error state
    if (ResultsPanel.errorMessage) {
      return this.getErrorHtml(ResultsPanel.errorMessage);
    }

    // Calculate summary stats
    let totalPoints = 0;
    let totalCritical = 0;
    let totalWarnings = 0;
    const allProviders = new Set<string>();
    const allModels = new Set<string>();

    for (const result of results) {
      totalPoints += result.summary.totalPoints;
      totalCritical += result.summary.criticalIssues;
      totalWarnings += result.summary.warnings;
      result.summary.providers.forEach((p) => allProviders.add(p));
      result.summary.models.forEach((m) => allModels.add(m));
    }

    // Build issues HTML
    let issuesHtml = '';
    for (const result of results) {
      for (const point of result.inferencePoints) {
        for (const issue of point.issues || []) {
          issuesHtml += this.renderIssue(point, issue);
        }
      }
    }

    if (!issuesHtml) {
      issuesHtml = '<p class="no-issues">No issues found. Run an analysis to see results.</p>';
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer Results</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 16px;
    }

    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }

    .refresh-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 12px;
    }

    .refresh-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 12px;
      border-radius: 4px;
      text-align: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
    }

    .stat-critical .stat-value {
      color: var(--vscode-errorForeground);
    }

    .stat-warning .stat-value {
      color: var(--vscode-editorWarning-foreground);
    }

    .issues-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .issues-header h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .issue {
      background: var(--vscode-editor-inactiveSelectionBackground);
      margin-bottom: 8px;
      border-radius: 4px;
      overflow: hidden;
    }

    .issue-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      cursor: pointer;
    }

    .issue-header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .severity-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 2px;
      text-transform: uppercase;
    }

    .severity-critical {
      background: var(--vscode-errorForeground);
      color: white;
    }

    .severity-high {
      background: var(--vscode-editorWarning-foreground);
      color: black;
    }

    .severity-medium {
      background: var(--vscode-editorInfo-foreground);
      color: white;
    }

    .severity-low {
      background: var(--vscode-descriptionForeground);
      color: white;
    }

    .type-badge {
      font-size: 10px;
      padding: 2px 6px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 2px;
      text-transform: uppercase;
    }

    .issue-title {
      flex: 1;
      font-size: 13px;
    }

    .issue-location {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
    }

    .issue-location:hover {
      text-decoration: underline;
    }

    .issue-body {
      padding: 0 12px 12px 12px;
      font-size: 12px;
      line-height: 1.5;
    }

    .issue-description {
      margin-bottom: 8px;
    }

    .issue-impact {
      color: var(--vscode-editorWarning-foreground);
      margin-bottom: 8px;
    }

    .issue-fix {
      background: var(--vscode-textBlockQuote-background);
      padding: 8px;
      border-radius: 2px;
      border-left: 3px solid var(--vscode-textBlockQuote-border);
    }

    .no-issues {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 40px;
    }

    .providers-models {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      font-size: 12px;
    }

    .tag {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 6px;
      border-radius: 2px;
      margin-right: 4px;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>PeakInfer Analysis Results</h1>
    <button class="refresh-btn" onclick="refresh()">Refresh</button>
  </div>

  <div class="summary">
    <div class="stat-card">
      <div class="stat-value">${totalPoints}</div>
      <div class="stat-label">Inference Points</div>
    </div>
    <div class="stat-card stat-critical">
      <div class="stat-value">${totalCritical}</div>
      <div class="stat-label">Critical Issues</div>
    </div>
    <div class="stat-card stat-warning">
      <div class="stat-value">${totalWarnings}</div>
      <div class="stat-label">Warnings</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${results.length}</div>
      <div class="stat-label">Files Analyzed</div>
    </div>
  </div>

  ${
    allProviders.size > 0 || allModels.size > 0
      ? `
  <div class="providers-models">
    ${
      allProviders.size > 0
        ? `<div><strong>Providers:</strong> ${Array.from(allProviders)
            .map((p) => `<span class="tag">${p}</span>`)
            .join('')}</div>`
        : ''
    }
    ${
      allModels.size > 0
        ? `<div><strong>Models:</strong> ${Array.from(allModels)
            .map((m) => `<span class="tag">${m}</span>`)
            .join('')}</div>`
        : ''
    }
  </div>
  `
      : ''
  }

  <div class="issues-section">
    <div class="issues-header">
      <h2>Issues</h2>
    </div>
    ${issuesHtml}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function openFile(file, line) {
      vscode.postMessage({ command: 'openFile', file, line });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function toggleIssue(element) {
      const body = element.nextElementSibling;
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    }
  </script>
</body>
</html>`;
  }

  private renderIssue(point: InferencePoint, issue: Issue): string {
    const fileName = point.file.split('/').pop() || point.file;

    return `
<div class="issue">
  <div class="issue-header" onclick="toggleIssue(this)">
    <span class="severity-badge severity-${issue.severity}">${issue.severity}</span>
    <span class="type-badge">${issue.type}</span>
    <span class="issue-title">${this.escapeHtml(issue.title)}</span>
    <span class="issue-location" onclick="event.stopPropagation(); openFile('${this.escapeHtml(
      point.file
    )}', ${point.line})">${fileName}:${point.line}</span>
  </div>
  <div class="issue-body" style="display: none;">
    ${issue.description ? `<div class="issue-description">${this.escapeHtml(issue.description)}</div>` : ''}
    ${issue.impact ? `<div class="issue-impact"><strong>Impact:</strong> ${this.escapeHtml(issue.impact)}</div>` : ''}
    ${issue.fix ? `<div class="issue-fix"><strong>Fix:</strong> ${this.escapeHtml(issue.fix)}</div>` : ''}
    ${
      issue.benchmark
        ? `<div class="issue-benchmark"><strong>Benchmark:</strong> Your ${issue.benchmark.yourValue} vs ${issue.benchmark.benchmarkValue} (${issue.benchmark.gap})</div>`
        : ''
    }
  </div>
</div>`;
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer - Loading</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--vscode-editor-inactiveSelectionBackground);
      border-top-color: var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .message {
      margin-top: 16px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p class="message">Analyzing LLM inference points...</p>
</body>
</html>`;
  }

  private getErrorHtml(message: string): string {
    const escapedMessage = this.escapeHtml(message);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer - Error</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 24px;
      margin: 0;
    }
    .error-container {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      border-radius: 4px;
      padding: 16px;
      margin: 24px 0;
    }
    .error-title {
      color: var(--vscode-errorForeground);
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 8px 0;
    }
    .error-message {
      color: var(--vscode-foreground);
      margin: 0 0 16px 0;
      line-height: 1.5;
    }
    .retry-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 13px;
    }
    .retry-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .help-text {
      margin-top: 16px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .help-text a {
      color: var(--vscode-textLink-foreground);
    }
  </style>
</head>
<body>
  <h1>PeakInfer Analysis</h1>
  <div class="error-container">
    <h2 class="error-title">Analysis Failed</h2>
    <p class="error-message">${escapedMessage}</p>
    <button class="retry-btn" onclick="retry()">Retry Analysis</button>
  </div>
  <p class="help-text">
    Common issues:<br>
    - Missing or invalid API key: Run "PeakInfer: Set Anthropic API Key" from command palette<br>
    - Network issues: Check your internet connection<br>
    - Rate limiting: Wait a moment and try again
  </p>
  <script>
    const vscode = acquireVsCodeApi();
    function retry() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
