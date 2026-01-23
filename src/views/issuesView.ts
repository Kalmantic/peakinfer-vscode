/**
 * Issues Sidebar View
 *
 * Shows analysis issues in the sidebar for quick access
 */

import * as vscode from 'vscode';
import { DiagnosticsManager } from '../diagnostics';

export class IssuesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'peakinfer.issues';
  private _view?: vscode.WebviewView;

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
        case 'showResults':
          vscode.commands.executeCommand('peakinfer.showResults');
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

  private getHtmlContent(webview: vscode.Webview): string {
    const allDiagnostics = this.diagnosticsManager.getAllDiagnostics();

    // Group diagnostics by severity
    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    const issues: Array<{
      file: string;
      fileName: string;
      line: number;
      message: string;
      severity: string;
    }> = [];

    allDiagnostics.forEach(([uri, diagnostics]) => {
      const filePath = uri.fsPath;
      const fileName = filePath.split('/').pop() || filePath;

      diagnostics.forEach((d) => {
        let severity = 'info';
        if (d.severity === vscode.DiagnosticSeverity.Error) {
          severity = 'critical';
          criticalCount++;
        } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
          severity = 'warning';
          warningCount++;
        } else {
          infoCount++;
        }

        issues.push({
          file: filePath,
          fileName,
          line: d.range.start.line + 1,
          message: d.message.split('\n')[0], // First line only
          severity,
        });
      });
    });

    const totalIssues = issues.length;

    if (totalIssues === 0) {
      return this.getEmptyStateHtml();
    }

    const issuesHtml = issues
      .map(
        (issue) => `
      <div class="issue" onclick="openFile('${this.escapeHtml(issue.file)}', ${issue.line})">
        <div class="issue-header">
          <span class="severity severity-${issue.severity}"></span>
          <span class="issue-location">${this.escapeHtml(issue.fileName)}:${issue.line}</span>
        </div>
        <div class="issue-message">${this.escapeHtml(issue.message)}</div>
      </div>
    `
      )
      .join('');

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

    .summary {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 4px;
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

    .issues-list {
      padding: 8px;
    }

    .issue {
      padding: 8px 10px;
      margin-bottom: 4px;
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

    .issue-location {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .issue-message {
      font-size: 12px;
      line-height: 1.4;
      color: var(--vscode-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .view-all {
      display: block;
      text-align: center;
      padding: 10px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font-size: 11px;
    }

    .view-all:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="summary">
    ${criticalCount > 0 ? `<div class="stat"><span class="stat-dot critical"></span>${criticalCount} Critical</div>` : ''}
    ${warningCount > 0 ? `<div class="stat"><span class="stat-dot warning"></span>${warningCount} Warning</div>` : ''}
    ${infoCount > 0 ? `<div class="stat"><span class="stat-dot info"></span>${infoCount} Info</div>` : ''}
  </div>

  <div class="issues-list">
    ${issuesHtml}
  </div>

  <a class="view-all" onclick="showResults()">View Full Results Panel</a>

  <script>
    const vscode = acquireVsCodeApi();

    function openFile(file, line) {
      vscode.postMessage({ command: 'openFile', file, line });
    }

    function showResults() {
      vscode.postMessage({ command: 'showResults' });
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
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.6;
    }

    .empty-title {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .empty-message {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .action-btn {
      display: inline-block;
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .action-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .shortcut {
      margin-top: 12px;
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
  <div class="shortcut">
    or press <kbd>Cmd+Alt+P</kbd>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function analyzeFile() {
      vscode.postMessage({ command: 'analyzeFile' });
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
