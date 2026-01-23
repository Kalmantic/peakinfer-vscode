/**
 * Quick Start Sidebar View
 *
 * Provides a quick start guide in the sidebar
 */

import * as vscode from 'vscode';

export class QuickStartViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'peakinfer.quickStart';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

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

  private getHtmlContent(webview: vscode.Webview): string {
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
      font-size: 13px;
    }

    .logo {
      text-align: center;
      margin-bottom: 16px;
      padding: 12px;
      background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);
      border-radius: 8px;
    }

    .logo h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .logo p {
      margin: 6px 0 0 0;
      font-size: 11px;
      opacity: 0.9;
    }

    .section {
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      letter-spacing: 0.5px;
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
      transition: background 0.15s;
    }

    .action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .action-btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .action-btn.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .action-btn .icon {
      font-size: 14px;
      width: 20px;
      text-align: center;
    }

    .action-btn .text {
      flex: 1;
    }

    .action-btn .shortcut {
      font-size: 10px;
      padding: 2px 6px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
    }

    .tip {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding: 10px 12px;
      border-radius: 0 4px 4px 0;
      font-size: 11px;
      line-height: 1.5;
    }

    .tip strong {
      color: var(--vscode-textLink-foreground);
    }

    .features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }

    .feature {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 8px;
      border-radius: 4px;
      text-align: center;
      font-size: 10px;
    }

    .feature .icon {
      font-size: 16px;
      margin-bottom: 4px;
    }

    .link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }

    .link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="logo">
    <h2>PeakInfer</h2>
    <p>LLM Inference Analyzer</p>
  </div>

  <div class="section">
    <div class="section-title">Quick Actions</div>
    <button class="action-btn primary" onclick="analyzeFile()">
      <span class="icon">&#128269;</span>
      <span class="text">Analyze Current File</span>
      <span class="shortcut">Cmd+Alt+P</span>
    </button>
    <button class="action-btn" onclick="analyzeWorkspace()">
      <span class="icon">&#128194;</span>
      <span class="text">Analyze Workspace</span>
    </button>
    <button class="action-btn" onclick="showResults()">
      <span class="icon">&#128202;</span>
      <span class="text">View Results</span>
    </button>
  </div>

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
        <div>Cost Issues</div>
      </div>
      <div class="feature">
        <div class="icon">&#9889;</div>
        <div>Latency</div>
      </div>
      <div class="feature">
        <div class="icon">&#128200;</div>
        <div>Throughput</div>
      </div>
      <div class="feature">
        <div class="icon">&#128737;</div>
        <div>Reliability</div>
      </div>
    </div>
  </div>

  <div class="tip">
    <strong>Tip:</strong> Open any file with LLM code and press <strong>Cmd+Alt+P</strong> to analyze it instantly!
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
