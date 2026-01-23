/**
 * Issues Sidebar View
 *
 * AI-native issues view with impact summary, prioritization by ROI,
 * and category filtering for quick access to LLM inference issues.
 */

import * as vscode from 'vscode';
import { DiagnosticsManager } from '../diagnostics';
import { ImpactCalculator, ImpactSummary } from '../utils/impactCalculator';
import { AnalysisResult, Issue, InferencePoint } from '../analysis';

interface IssueItem {
  file: string;
  fileName: string;
  line: number;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  type: 'cost' | 'latency' | 'throughput' | 'reliability';
  estimatedSavings?: number;
  title: string;
}

export class IssuesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'peakinfer.issues';
  private _view?: vscode.WebviewView;
  private lastResults: AnalysisResult[] = [];
  private lastImpactSummary: ImpactSummary | null = null;
  private activeFilter: 'all' | 'cost' | 'latency' | 'reliability' = 'all';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diagnosticsManager: DiagnosticsManager
  ) {
    // Update view when diagnostics change
    diagnosticsManager.onDiagnosticsChanged(() => {
      if (this._view) {
        this._view.webview.html = this.getHtmlContent(this._view.webview);
      }
    });
  }

  /**
   * Update with analysis results for impact calculation
   */
  updateWithResults(results: AnalysisResult[]): void {
    this.lastResults = results;
    if (results.length > 0) {
      this.lastImpactSummary = ImpactCalculator.calculateImpactSummary(results);
    }
    if (this._view) {
      this._view.webview.html = this.getHtmlContent(this._view.webview);
    }
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

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'openFile':
          this.openFile(message.file, message.line);
          break;
        case 'analyzeFile':
          vscode.commands.executeCommand('peakinfer.analyzeFile');
          break;
        case 'analyzeWorkspace':
          vscode.commands.executeCommand('peakinfer.analyzeWorkspace');
          break;
        case 'showResults':
          vscode.commands.executeCommand('peakinfer.showResults');
          break;
        case 'setFilter':
          this.activeFilter = message.filter;
          webviewView.webview.html = this.getHtmlContent(webviewView.webview);
          break;
        case 'quickFix':
          this.handleQuickFix(message.file, message.line, message.fix);
          break;
      }
    });
  }

  private openFile(file: string, line: number): void {
    const uri = vscode.Uri.file(file);
    vscode.window.showTextDocument(uri, {
      selection: new vscode.Range(line - 1, 0, line - 1, 0),
    });
  }

  private async handleQuickFix(file: string, line: number, fix: string): Promise<void> {
    const uri = vscode.Uri.file(file);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);

    const position = new vscode.Position(line - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));

    vscode.window.showInformationMessage(`Suggested fix: ${fix}`, 'Copy to Clipboard').then((action) => {
      if (action === 'Copy to Clipboard') {
        vscode.env.clipboard.writeText(fix);
      }
    });
  }

  private getHtmlContent(_webview: vscode.Webview): string {
    const allDiagnostics = this.diagnosticsManager.getAllDiagnostics();
    const impact = this.lastImpactSummary;

    // Collect and enrich issues
    const issues: IssueItem[] = [];
    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    // Category counts
    const categoryCounts = {
      cost: 0,
      latency: 0,
      throughput: 0,
      reliability: 0,
    };

    allDiagnostics.forEach(([uri, diagnostics]) => {
      const filePath = uri.fsPath;
      const fileName = filePath.split('/').pop() || filePath;

      diagnostics.forEach((d) => {
        // Parse severity
        let severity: 'critical' | 'warning' | 'info' = 'info';
        if (d.severity === vscode.DiagnosticSeverity.Error) {
          severity = 'critical';
          criticalCount++;
        } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
          severity = 'warning';
          warningCount++;
        } else {
          infoCount++;
        }

        // Parse type from message
        const typeMatch = d.message.match(/\[(COST|LATENCY|THROUGHPUT|RELIABILITY)\]/i);
        const type = (typeMatch ? typeMatch[1].toLowerCase() : 'cost') as IssueItem['type'];

        if (categoryCounts[type] !== undefined) {
          categoryCounts[type]++;
        }

        // Extract title from message
        const firstLine = d.message.split('\n')[0];
        const title = firstLine.replace(/\[.*?\]/g, '').trim();

        // Find estimated savings from impact summary
        let estimatedSavings: number | undefined;
        if (impact && impact.topIssuesBySavings) {
          const matching = impact.topIssuesBySavings.find(
            (item) =>
              item.point.file.endsWith(fileName) && item.point.line === d.range.start.line + 1
          );
          if (matching) {
            estimatedSavings = matching.estimatedMonthlySavings;
          }
        }

        issues.push({
          file: filePath,
          fileName,
          line: d.range.start.line + 1,
          message: d.message,
          severity,
          type,
          estimatedSavings,
          title,
        });
      });
    });

    const totalIssues = issues.length;

    if (totalIssues === 0) {
      return this.getEmptyStateHtml();
    }

    // Sort issues: critical first, then by savings
    issues.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return (b.estimatedSavings || 0) - (a.estimatedSavings || 0);
    });

    // Filter by category
    const filteredIssues =
      this.activeFilter === 'all'
        ? issues
        : issues.filter((i) => i.type === this.activeFilter);

    // Top priority issue (highest savings)
    const topPriorityIssue =
      issues.find((i) => i.severity === 'critical' && (i.estimatedSavings || 0) > 0) || issues[0];

    // Build issues HTML
    const issuesHtml = filteredIssues
      .slice(0, 20) // Limit for performance
      .map(
        (issue) => `
      <div class="issue" onclick="openFile('${this.escapeHtml(issue.file)}', ${issue.line})">
        <div class="issue-header">
          <span class="severity severity-${issue.severity}"></span>
          <span class="type-badge type-${issue.type}">${issue.type}</span>
          <span class="issue-location">${this.escapeHtml(issue.fileName)}:${issue.line}</span>
          ${issue.estimatedSavings ? `<span class="savings">$${issue.estimatedSavings.toFixed(0)}/mo</span>` : ''}
        </div>
        <div class="issue-title">${this.escapeHtml(issue.title)}</div>
      </div>
    `
      )
      .join('');

    // Impact summary section
    const impactHtml =
      impact && impact.estimatedMonthlyWaste > 0
        ? `
    <div class="impact-summary">
      <div class="impact-row">
        <span class="impact-icon">&#128176;</span>
        <span class="impact-label">Est. Monthly Waste</span>
        <span class="impact-value waste">${ImpactCalculator.formatCurrency(impact.estimatedMonthlyWaste)}</span>
      </div>
      ${
        impact.latencyIssueCount > 0
          ? `
      <div class="impact-row">
        <span class="impact-icon">&#9889;</span>
        <span class="impact-label">Latency Issues</span>
        <span class="impact-value">${impact.latencyIssueCount} calls &gt; 2s</span>
      </div>
      `
          : ''
      }
      ${
        impact.reliabilityGapCount > 0
          ? `
      <div class="impact-row">
        <span class="impact-icon">&#128737;</span>
        <span class="impact-label">Reliability Gaps</span>
        <span class="impact-value">${impact.reliabilityGapCount} without retry</span>
      </div>
      `
          : ''
      }
    </div>
    `
        : '';

    // Top priority section
    const topPriorityHtml =
      topPriorityIssue && topPriorityIssue.severity === 'critical'
        ? `
    <div class="top-priority">
      <div class="top-priority-header">
        <span class="fire-icon">&#128293;</span>
        TOP PRIORITY
      </div>
      <div class="top-priority-issue" onclick="openFile('${this.escapeHtml(topPriorityIssue.file)}', ${topPriorityIssue.line})">
        <div class="priority-title">${this.escapeHtml(topPriorityIssue.title.substring(0, 40))}${topPriorityIssue.title.length > 40 ? '...' : ''}</div>
        <div class="priority-meta">
          <span class="priority-location">${topPriorityIssue.fileName}:${topPriorityIssue.line}</span>
          ${topPriorityIssue.estimatedSavings ? `<span class="priority-savings">Saving: $${topPriorityIssue.estimatedSavings.toFixed(0)}/mo</span>` : ''}
        </div>
        <div class="priority-actions">
          <button class="action-btn" onclick="event.stopPropagation(); openFile('${this.escapeHtml(topPriorityIssue.file)}', ${topPriorityIssue.line})">View</button>
        </div>
      </div>
    </div>
    `
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer Issues</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 0;
      margin: 0;
      font-size: 12px;
    }

    .summary-bar {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
    }

    .stat-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .stat-dot.critical {
      background: var(--vscode-errorForeground);
    }

    .stat-dot.warning {
      background: var(--vscode-editorWarning-foreground);
    }

    .stat-dot.info {
      background: var(--vscode-editorInfo-foreground);
    }

    .impact-summary {
      padding: 12px;
      background: linear-gradient(135deg, var(--vscode-editor-inactiveSelectionBackground) 0%, var(--vscode-sideBar-background) 100%);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .impact-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 11px;
    }

    .impact-icon {
      width: 18px;
      text-align: center;
    }

    .impact-label {
      flex: 1;
      color: var(--vscode-descriptionForeground);
    }

    .impact-value {
      font-weight: 600;
    }

    .impact-value.waste {
      color: var(--vscode-errorForeground);
    }

    .top-priority {
      padding: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .top-priority-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-errorForeground);
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .fire-icon {
      font-size: 12px;
    }

    .top-priority-issue {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-left: 3px solid var(--vscode-errorForeground);
      padding: 10px;
      border-radius: 0 4px 4px 0;
      cursor: pointer;
    }

    .top-priority-issue:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .priority-title {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .priority-meta {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .priority-savings {
      color: var(--vscode-testing-iconPassed);
      font-weight: 600;
    }

    .priority-actions {
      display: flex;
      gap: 6px;
    }

    .action-btn {
      padding: 4px 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
    }

    .action-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .category-tabs {
      display: flex;
      padding: 8px 12px;
      gap: 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
      overflow-x: auto;
    }

    .tab-btn {
      padding: 4px 10px;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      white-space: nowrap;
    }

    .tab-btn:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .tab-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .tab-count {
      margin-left: 4px;
      opacity: 0.7;
    }

    .issues-list {
      padding: 8px;
    }

    .issue {
      padding: 10px;
      margin-bottom: 6px;
      background: var(--vscode-list-inactiveSelectionBackground);
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .issue:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .issue-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .severity {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .severity-critical {
      background: var(--vscode-errorForeground);
    }

    .severity-warning {
      background: var(--vscode-editorWarning-foreground);
    }

    .severity-info {
      background: var(--vscode-editorInfo-foreground);
    }

    .type-badge {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 2px;
      text-transform: uppercase;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .type-cost {
      background: rgba(239, 68, 68, 0.2);
      color: var(--vscode-errorForeground);
    }

    .type-latency {
      background: rgba(234, 179, 8, 0.2);
      color: var(--vscode-editorWarning-foreground);
    }

    .type-reliability {
      background: rgba(59, 130, 246, 0.2);
      color: var(--vscode-editorInfo-foreground);
    }

    .issue-location {
      flex: 1;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .savings {
      font-size: 10px;
      color: var(--vscode-testing-iconPassed);
      font-weight: 600;
    }

    .issue-title {
      font-size: 11px;
      line-height: 1.4;
      color: var(--vscode-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .view-all {
      display: block;
      text-align: center;
      padding: 12px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font-size: 11px;
    }

    .view-all:hover {
      text-decoration: underline;
    }

    .issues-footer {
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      text-align: center;
    }

    .footer-btn {
      width: 100%;
      padding: 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }

    .footer-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
</head>
<body>
  <div class="summary-bar">
    ${criticalCount > 0 ? `<div class="stat"><span class="stat-dot critical"></span>${criticalCount} Critical</div>` : ''}
    ${warningCount > 0 ? `<div class="stat"><span class="stat-dot warning"></span>${warningCount} Warning</div>` : ''}
    ${infoCount > 0 ? `<div class="stat"><span class="stat-dot info"></span>${infoCount} Info</div>` : ''}
  </div>

  ${impactHtml}

  ${topPriorityHtml}

  <div class="category-tabs">
    <button class="tab-btn ${this.activeFilter === 'all' ? 'active' : ''}" onclick="setFilter('all')">
      All<span class="tab-count">(${totalIssues})</span>
    </button>
    <button class="tab-btn ${this.activeFilter === 'cost' ? 'active' : ''}" onclick="setFilter('cost')">
      &#128176; Cost<span class="tab-count">(${categoryCounts.cost})</span>
    </button>
    <button class="tab-btn ${this.activeFilter === 'latency' ? 'active' : ''}" onclick="setFilter('latency')">
      &#9889; Latency<span class="tab-count">(${categoryCounts.latency})</span>
    </button>
    <button class="tab-btn ${this.activeFilter === 'reliability' ? 'active' : ''}" onclick="setFilter('reliability')">
      &#128737; Reliability<span class="tab-count">(${categoryCounts.reliability})</span>
    </button>
  </div>

  <div class="issues-list">
    ${issuesHtml}
  </div>

  ${filteredIssues.length > 20 ? `<a class="view-all" onclick="showResults()">View All ${filteredIssues.length} Issues</a>` : ''}

  <div class="issues-footer">
    <button class="footer-btn" onclick="showResults()">View Full Results Panel</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function openFile(file, line) {
      vscode.postMessage({ command: 'openFile', file, line });
    }

    function showResults() {
      vscode.postMessage({ command: 'showResults' });
    }

    function setFilter(filter) {
      vscode.postMessage({ command: 'setFilter', filter });
    }

    function quickFix(file, line, fix) {
      vscode.postMessage({ command: 'quickFix', file, line, fix });
    }
  </script>
</body>
</html>`;
  }

  private getEmptyStateHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer Issues</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 24px 16px;
      margin: 0;
      font-size: 12px;
      text-align: center;
    }

    .empty-icon {
      font-size: 36px;
      margin-bottom: 12px;
      color: var(--vscode-testing-iconPassed);
    }

    .empty-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .empty-message {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .action-btn {
      display: inline-block;
      padding: 10px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-bottom: 8px;
    }

    .action-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .secondary-btn {
      display: block;
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border: none;
      cursor: pointer;
      font-size: 11px;
      margin-top: 8px;
    }

    .secondary-btn:hover {
      text-decoration: underline;
    }

    .shortcut {
      margin-top: 16px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .shortcut kbd {
      background: var(--vscode-badge-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: inherit;
    }
  </style>
</head>
<body>
  <div class="empty-icon">&#10004;</div>
  <div class="empty-title">No Issues Found</div>
  <div class="empty-message">
    Run an analysis to detect LLM inference issues in your code.
  </div>
  <button class="action-btn" onclick="analyzeFile()">Analyze Current File</button>
  <button class="secondary-btn" onclick="analyzeWorkspace()">or Analyze Workspace</button>
  <div class="shortcut">
    Press <kbd>Cmd+Alt+P</kbd> to analyze quickly
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function analyzeFile() {
      vscode.postMessage({ command: 'analyzeFile' });
    }

    function analyzeWorkspace() {
      vscode.postMessage({ command: 'analyzeWorkspace' });
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
      .replace(/'/g, '&#039;')
      .replace(/\\/g, '\\\\');
  }
}
