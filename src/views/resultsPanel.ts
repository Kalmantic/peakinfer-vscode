/**
 * Results Panel
 *
 * AI-native webview panel for displaying PeakInfer analysis results
 * with streaming progress, exposed thinking layer, and suggested actions.
 */

import * as vscode from 'vscode';
import { AnalysisResult, Issue, InferencePoint } from '../analysis';
import {
  ImpactCalculator,
  ImpactSummary,
  IssueWithSavings,
  SuggestedAction,
  MODEL_PRICING,
} from '../utils/impactCalculator';

interface ProgressStage {
  id: string;
  label: string;
  detail?: string;
  completed: boolean;
  current: boolean;
}

export class ResultsPanel {
  private static currentPanel: ResultsPanel | undefined;
  private static extensionUri: vscode.Uri;
  private static results: AnalysisResult[] = [];
  private static errorMessage: string | null = null;
  private static errorType: 'token' | 'network' | 'unknown' | null = null;
  private static isLoading: boolean = false;
  private static progressStages: ProgressStage[] = [];
  private static impactSummary: ImpactSummary | null = null;

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
    ResultsPanel.errorType = null;
    ResultsPanel.isLoading = false;
    ResultsPanel.progressStages = [];
    ResultsPanel.impactSummary = ImpactCalculator.calculateImpactSummary(results);
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
    ResultsPanel.progressStages = [];

    // Detect error type for contextual help
    const messageLower = message.toLowerCase();
    if (messageLower.includes('token') || messageLower.includes('auth') || messageLower.includes('401')) {
      ResultsPanel.errorType = 'token';
    } else if (messageLower.includes('network') || messageLower.includes('fetch') || messageLower.includes('timeout')) {
      ResultsPanel.errorType = 'network';
    } else {
      ResultsPanel.errorType = 'unknown';
    }

    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.updateContent();
    }
  }

  /**
   * Show loading state with streaming progress
   */
  static showLoading(): void {
    ResultsPanel.isLoading = true;
    ResultsPanel.errorMessage = null;
    ResultsPanel.errorType = null;
    ResultsPanel.progressStages = [
      { id: 'scan', label: 'Scanning files', completed: false, current: true },
      { id: 'detect', label: 'Detecting inference points', completed: false, current: false },
      { id: 'analyze', label: 'Analyzing patterns', completed: false, current: false },
      { id: 'benchmark', label: 'Comparing benchmarks', completed: false, current: false },
      { id: 'generate', label: 'Generating recommendations', completed: false, current: false },
    ];
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.updateContent();
    }
  }

  /**
   * Update progress stage
   */
  static updateProgress(stageId: string, detail?: string): void {
    let foundCurrent = false;
    for (const stage of ResultsPanel.progressStages) {
      if (stage.id === stageId) {
        stage.current = true;
        stage.detail = detail;
        foundCurrent = true;
      } else if (foundCurrent) {
        stage.current = false;
        stage.completed = false;
      } else {
        stage.completed = true;
        stage.current = false;
      }
    }
    if (ResultsPanel.currentPanel && ResultsPanel.isLoading) {
      ResultsPanel.currentPanel.updateContent();
    }
  }

  /**
   * Clear all results from the panel
   */
  static clearResults(): void {
    ResultsPanel.results = [];
    ResultsPanel.errorMessage = null;
    ResultsPanel.errorType = null;
    ResultsPanel.isLoading = false;
    ResultsPanel.progressStages = [];
    ResultsPanel.impactSummary = null;
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
          case 'analyzeFile':
            vscode.commands.executeCommand('peakinfer.analyzeFile');
            break;
          case 'analyzeWorkspace':
            vscode.commands.executeCommand('peakinfer.analyzeWorkspace');
            break;
          case 'setToken':
            vscode.commands.executeCommand('peakinfer.setToken');
            break;
          case 'applyFix':
            this.applyFix(message.file, message.line, message.fix);
            break;
          case 'learnMore':
            vscode.env.openExternal(vscode.Uri.parse(message.url || 'https://peakinfer.com/docs'));
            break;
          case 'dismissIssue':
            // Future: track dismissed issues
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

  private async applyFix(file: string, line: number, fix: string): Promise<void> {
    const uri = vscode.Uri.file(file);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);

    // Navigate to the line
    const position = new vscode.Position(line - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));

    // Show the fix suggestion
    vscode.window.showInformationMessage(`Suggested fix: ${fix}`, 'Copy to Clipboard').then((action) => {
      if (action === 'Copy to Clipboard') {
        vscode.env.clipboard.writeText(fix);
      }
    });
  }

  private updateContent(): void {
    this.panel.webview.html = this.getHtmlContent(ResultsPanel.results);
  }

  private getHtmlContent(results: AnalysisResult[]): string {
    // Handle loading state with streaming progress
    if (ResultsPanel.isLoading) {
      return this.getLoadingHtml();
    }

    // Handle error state with conversational help
    if (ResultsPanel.errorMessage) {
      return this.getErrorHtml(ResultsPanel.errorMessage, ResultsPanel.errorType);
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

    // Get all issues with savings calculations
    const issuesWithSavings: IssueWithSavings[] = [];
    for (const result of results) {
      for (const point of result.inferencePoints) {
        for (const issue of point.issues || []) {
          issuesWithSavings.push(ImpactCalculator.estimateSavingsForIssue(issue, point));
        }
      }
    }

    // Sort by severity first, then by savings
    issuesWithSavings.sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const aSev = severityOrder[a.issue.severity] ?? 4;
      const bSev = severityOrder[b.issue.severity] ?? 4;
      if (aSev !== bSev) return aSev - bSev;
      return b.estimatedMonthlySavings - a.estimatedMonthlySavings;
    });

    // Build issues HTML with enhanced cards
    let issuesHtml = '';
    for (const item of issuesWithSavings) {
      issuesHtml += this.renderEnhancedIssue(item);
    }

    if (!issuesHtml) {
      issuesHtml = this.getNoIssuesHtml();
    }

    // Generate suggested actions
    const suggestedActions = ImpactCalculator.generateSuggestedActions(results);
    const suggestedActionsHtml =
      suggestedActions.length > 0 ? this.renderSuggestedActions(suggestedActions) : '';

    // Impact summary
    const impactSummary = ResultsPanel.impactSummary;
    const impactHtml = impactSummary ? this.renderImpactSummary(impactSummary) : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer Results</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>PeakInfer Analysis</h1>
      <span class="subtitle">${results.length} file${results.length !== 1 ? 's' : ''} analyzed</span>
    </div>
    <button class="refresh-btn" onclick="refresh()">
      <span class="icon">&#8635;</span> Refresh
    </button>
  </div>

  ${impactHtml}

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
      <div class="stat-label">Files</div>
    </div>
  </div>

  ${
    allProviders.size > 0 || allModels.size > 0
      ? `
  <div class="providers-models">
    ${
      allProviders.size > 0
        ? `<div class="tag-group"><strong>Providers:</strong> ${Array.from(allProviders)
            .map((p) => `<span class="tag">${p}</span>`)
            .join('')}</div>`
        : ''
    }
    ${
      allModels.size > 0
        ? `<div class="tag-group"><strong>Models:</strong> ${Array.from(allModels)
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
      <div class="issues-filter">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="cost">Cost</button>
        <button class="filter-btn" data-filter="latency">Latency</button>
        <button class="filter-btn" data-filter="reliability">Reliability</button>
      </div>
    </div>
    <div class="issues-list">
      ${issuesHtml}
    </div>
  </div>

  ${suggestedActionsHtml}

  <script>
    ${this.getScript()}
  </script>
</body>
</html>`;
  }

  private renderImpactSummary(summary: ImpactSummary): string {
    const wasteFormatted = ImpactCalculator.formatCurrency(summary.estimatedMonthlyWaste);

    return `
    <div class="impact-summary">
      <div class="impact-header">
        <span class="impact-icon">&#128200;</span>
        <span class="impact-title">IMPACT SUMMARY</span>
      </div>
      <div class="impact-cards">
        <div class="impact-card waste">
          <div class="impact-card-icon">&#128176;</div>
          <div class="impact-card-content">
            <div class="impact-card-value">${wasteFormatted}</div>
            <div class="impact-card-label">Est. Monthly Waste</div>
          </div>
        </div>
        <div class="impact-card latency">
          <div class="impact-card-icon">&#9889;</div>
          <div class="impact-card-content">
            <div class="impact-card-value">${summary.latencyIssueCount}</div>
            <div class="impact-card-label">Latency Issues</div>
          </div>
        </div>
        <div class="impact-card reliability">
          <div class="impact-card-icon">&#128737;</div>
          <div class="impact-card-content">
            <div class="impact-card-value">${summary.reliabilityGapCount}</div>
            <div class="impact-card-label">Reliability Gaps</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  private renderEnhancedIssue(item: IssueWithSavings): string {
    const { issue, point } = item;
    const fileName = point.file.split('/').pop() || point.file;
    const savingsText =
      item.estimatedMonthlySavings > 0 ? `$${item.estimatedMonthlySavings.toFixed(0)}/mo` : '';

    // Build benchmark comparison if we have model data
    let benchmarkHtml = '';
    if (item.currentModel && item.recommendedModel) {
      const comparison = ImpactCalculator.getModelComparison(item.currentModel, item.recommendedModel);
      if (comparison) {
        benchmarkHtml = `
        <div class="benchmark-section">
          <div class="benchmark-title">&#128202; WHY IT MATTERS</div>
          <table class="benchmark-table">
            <tr>
              <td class="benchmark-label">Your Choice</td>
              <td class="benchmark-model">${item.currentModel}</td>
              <td class="benchmark-price">$${comparison.current.input.toFixed(2)}/1M input</td>
            </tr>
            <tr class="benchmark-recommended">
              <td class="benchmark-label">Recommended</td>
              <td class="benchmark-model">${item.recommendedModel}</td>
              <td class="benchmark-price">$${comparison.recommended.input.toFixed(2)}/1M input</td>
            </tr>
            <tr class="benchmark-savings">
              <td class="benchmark-label">Savings</td>
              <td colspan="2" class="benchmark-value">${comparison.savingsMultiplier.toFixed(0)}x cost reduction</td>
            </tr>
          </table>
        </div>`;
      }
    } else if (issue.benchmark) {
      benchmarkHtml = `
      <div class="benchmark-section">
        <div class="benchmark-title">&#128202; WHY IT MATTERS</div>
        <div class="benchmark-simple">
          Your ${issue.benchmark.yourValue} vs benchmark ${issue.benchmark.benchmarkValue} (${issue.benchmark.gap})
        </div>
      </div>`;
    }

    return `
<div class="issue-card" data-type="${issue.type}" data-severity="${issue.severity}">
  <div class="issue-card-header" onclick="toggleIssue(this)">
    <div class="issue-badges">
      <span class="severity-badge severity-${issue.severity}">${issue.severity}</span>
      <span class="type-badge type-${issue.type}">${issue.type}</span>
      ${savingsText ? `<span class="savings-badge">${savingsText}</span>` : ''}
    </div>
    <div class="issue-title-row">
      <span class="issue-title">${this.escapeHtml(issue.title)}</span>
      <span class="issue-location" onclick="event.stopPropagation(); openFile('${this.escapeHtml(
        point.file
      )}', ${point.line})">${fileName}:${point.line}</span>
    </div>
    <span class="expand-icon">&#9662;</span>
  </div>
  <div class="issue-card-body">
    <div class="what-section">
      <div class="section-title">&#128269; WHAT WE FOUND</div>
      <p>${this.escapeHtml(issue.description || issue.title)}</p>
      ${point.model ? `<div class="context-info">Model: <code>${point.model}</code> via ${point.provider || 'unknown provider'}</div>` : ''}
    </div>

    ${benchmarkHtml}

    ${
      issue.fix
        ? `
    <div class="fix-section">
      <div class="section-title">&#128161; SUGGESTED FIX</div>
      <div class="fix-content">${this.escapeHtml(issue.fix)}</div>
    </div>
    `
        : ''
    }

    <div class="action-buttons">
      <button class="action-btn primary" onclick="event.stopPropagation(); openFile('${this.escapeHtml(
        point.file
      )}', ${point.line})">View Code</button>
      ${
        issue.fix
          ? `<button class="action-btn" onclick="event.stopPropagation(); applyFix('${this.escapeHtml(
              point.file
            )}', ${point.line}, '${this.escapeHtml(issue.fix)}')">Apply Fix</button>`
          : ''
      }
      <button class="action-btn secondary" onclick="event.stopPropagation(); learnMore('https://peakinfer.com/docs/issues/${issue.type}')">Learn More</button>
    </div>
  </div>
</div>`;
  }

  private renderSuggestedActions(actions: SuggestedAction[]): string {
    const actionsHtml = actions
      .map(
        (action) => `
      <div class="suggested-action priority-${action.priority}">
        <span class="action-arrow">&#8594;</span>
        <div class="action-content">
          <div class="action-title">${this.escapeHtml(action.title)}</div>
          <div class="action-description">${this.escapeHtml(action.description)}</div>
        </div>
        ${
          action.command
            ? `<button class="action-btn small" onclick="executeCommand('${action.command}')">${action.type === 'analyze' ? 'Run' : 'Go'}</button>`
            : ''
        }
      </div>
    `
      )
      .join('');

    return `
    <div class="suggested-section">
      <div class="suggested-header">
        <span class="suggested-icon">&#128203;</span>
        <span class="suggested-title">SUGGESTED NEXT STEPS</span>
      </div>
      <p class="suggested-intro">Based on your analysis, you might also want to:</p>
      <div class="suggested-list">
        ${actionsHtml}
      </div>
      <div class="suggested-buttons">
        <button class="action-btn" onclick="analyzeWorkspace()">Analyze Workspace</button>
        <button class="action-btn secondary" onclick="learnMore('https://peakinfer.com/docs')">View Documentation</button>
      </div>
    </div>`;
  }

  private getNoIssuesHtml(): string {
    return `
    <div class="no-issues">
      <div class="no-issues-icon">&#10004;</div>
      <div class="no-issues-title">Looking Good!</div>
      <p>No issues found in the analyzed files. Your LLM code follows best practices.</p>
      <button class="action-btn" onclick="analyzeWorkspace()">Analyze More Files</button>
    </div>`;
  }

  private getLoadingHtml(): string {
    const stagesHtml = ResultsPanel.progressStages
      .map(
        (stage) => `
      <div class="progress-stage ${stage.completed ? 'completed' : ''} ${stage.current ? 'current' : ''}">
        <span class="stage-icon">${stage.completed ? '&#10003;' : stage.current ? '&#9679;' : '&#9675;'}</span>
        <span class="stage-label">${stage.label}</span>
        ${stage.detail ? `<span class="stage-detail">${stage.detail}</span>` : ''}
      </div>
    `
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer - Analyzing</title>
  <style>
    ${this.getStyles()}

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      padding: 40px;
    }

    .loading-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 32px;
    }

    .progress-stages {
      width: 100%;
      max-width: 400px;
    }

    .progress-stage {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      margin-bottom: 4px;
      border-radius: 6px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      opacity: 0.5;
      transition: all 0.3s ease;
    }

    .progress-stage.completed {
      opacity: 0.7;
    }

    .progress-stage.current {
      opacity: 1;
      background: var(--vscode-list-activeSelectionBackground);
      border-left: 3px solid var(--vscode-button-background);
    }

    .stage-icon {
      font-size: 14px;
      width: 20px;
      text-align: center;
    }

    .progress-stage.completed .stage-icon {
      color: var(--vscode-testing-iconPassed);
    }

    .progress-stage.current .stage-icon {
      color: var(--vscode-button-background);
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .stage-label {
      flex: 1;
      font-size: 13px;
    }

    .stage-detail {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .loading-tip {
      margin-top: 32px;
      padding: 12px 16px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      border-radius: 0 4px 4px 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="loading-container">
    <div class="loading-title">Analyzing your LLM code...</div>
    <div class="progress-stages">
      ${stagesHtml}
    </div>
    <div class="loading-tip">
      <strong>Tip:</strong> PeakInfer checks for cost waste, latency issues, and reliability gaps in your inference code.
    </div>
  </div>
</body>
</html>`;
  }

  private getErrorHtml(message: string, errorType: 'token' | 'network' | 'unknown' | null): string {
    const escapedMessage = this.escapeHtml(message);

    let helpSections = '';

    if (errorType === 'token') {
      helpSections = `
      <div class="help-option">
        <div class="help-number">1</div>
        <div class="help-content">
          <div class="help-title">Token not set</div>
          <div class="help-description">Get a free token at peakinfer.com/dashboard</div>
          <button class="action-btn primary" onclick="setToken()">Set Token</button>
        </div>
      </div>
      <div class="help-option">
        <div class="help-number">2</div>
        <div class="help-content">
          <div class="help-title">Token expired or invalid</div>
          <div class="help-description">Check your dashboard for a new token</div>
          <button class="action-btn" onclick="learnMore('https://peakinfer.com/dashboard')">Open Dashboard</button>
        </div>
      </div>`;
    } else if (errorType === 'network') {
      helpSections = `
      <div class="help-option">
        <div class="help-number">1</div>
        <div class="help-content">
          <div class="help-title">Check your connection</div>
          <div class="help-description">Make sure you're connected to the internet</div>
        </div>
      </div>
      <div class="help-option">
        <div class="help-number">2</div>
        <div class="help-content">
          <div class="help-title">Try again</div>
          <div class="help-description">Sometimes it's just a temporary blip</div>
          <button class="action-btn primary" onclick="retry()">Retry Analysis</button>
        </div>
      </div>`;
    } else {
      helpSections = `
      <div class="help-option">
        <div class="help-number">1</div>
        <div class="help-content">
          <div class="help-title">Try again</div>
          <div class="help-description">The issue might be temporary</div>
          <button class="action-btn primary" onclick="retry()">Retry Analysis</button>
        </div>
      </div>
      <div class="help-option">
        <div class="help-number">2</div>
        <div class="help-content">
          <div class="help-title">Check your token</div>
          <div class="help-description">Make sure your PeakInfer token is valid</div>
          <button class="action-btn" onclick="setToken()">Set Token</button>
        </div>
      </div>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PeakInfer - Help Needed</title>
  <style>
    ${this.getStyles()}

    .error-container {
      max-width: 500px;
      margin: 40px auto;
      padding: 24px;
    }

    .error-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .error-icon {
      font-size: 28px;
    }

    .error-title {
      font-size: 18px;
      font-weight: 600;
    }

    .error-message {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-size: 13px;
      line-height: 1.5;
    }

    .help-intro {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px;
      font-size: 13px;
    }

    .help-option {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .help-number {
      width: 28px;
      height: 28px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      flex-shrink: 0;
    }

    .help-content {
      flex: 1;
    }

    .help-title {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .help-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }

    .help-footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 12px;
      font-size: 12px;
    }

    .help-link {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: none;
    }

    .help-link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-header">
      <span class="error-icon">&#129300;</span>
      <span class="error-title">Couldn't complete the analysis</span>
    </div>

    <div class="error-message">${escapedMessage}</div>

    <p class="help-intro">Here's what might help:</p>

    ${helpSections}

    <div class="help-footer">
      <a class="help-link" onclick="learnMore('https://peakinfer.com/docs/troubleshooting')">Troubleshooting Guide</a>
      <a class="help-link" onclick="learnMore('https://peakinfer.com/support')">Contact Support</a>
    </div>
  </div>

  <script>
    ${this.getScript()}
  </script>
</body>
</html>`;
  }

  private getStyles(): string {
    return `
    * {
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
      line-height: 1.5;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .header-left {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .subtitle {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .refresh-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .refresh-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .refresh-btn .icon {
      font-size: 14px;
    }

    /* Impact Summary */
    .impact-summary {
      background: linear-gradient(135deg, var(--vscode-editor-inactiveSelectionBackground) 0%, var(--vscode-editor-background) 100%);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .impact-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .impact-icon {
      font-size: 16px;
    }

    .impact-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
    }

    .impact-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    .impact-card {
      background: var(--vscode-editor-background);
      border-radius: 6px;
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .impact-card-icon {
      font-size: 20px;
    }

    .impact-card-value {
      font-size: 18px;
      font-weight: 600;
    }

    .impact-card.waste .impact-card-value {
      color: var(--vscode-errorForeground);
    }

    .impact-card-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    /* Summary Cards */
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 16px;
      border-radius: 6px;
      text-align: center;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .stat-critical .stat-value {
      color: var(--vscode-errorForeground);
    }

    .stat-warning .stat-value {
      color: var(--vscode-editorWarning-foreground);
    }

    /* Providers/Models */
    .providers-models {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 20px;
      font-size: 12px;
    }

    .tag-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tag {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
    }

    /* Issues Section */
    .issues-section {
      margin-bottom: 24px;
    }

    .issues-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .issues-header h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .issues-filter {
      display: flex;
      gap: 4px;
    }

    .filter-btn {
      background: transparent;
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-foreground);
      padding: 4px 10px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
    }

    .filter-btn:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .filter-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    /* Issue Cards */
    .issue-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      border: 1px solid transparent;
      transition: border-color 0.2s;
    }

    .issue-card:hover {
      border-color: var(--vscode-panel-border);
    }

    .issue-card[data-severity="critical"] {
      border-left: 3px solid var(--vscode-errorForeground);
    }

    .issue-card[data-severity="high"] {
      border-left: 3px solid var(--vscode-editorWarning-foreground);
    }

    .issue-card-header {
      padding: 14px 16px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;
    }

    .issue-card-header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .issue-badges {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .severity-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 3px;
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
      padding: 2px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      text-transform: uppercase;
    }

    .savings-badge {
      font-size: 10px;
      padding: 2px 8px;
      background: rgba(34, 197, 94, 0.2);
      color: var(--vscode-testing-iconPassed);
      border-radius: 3px;
      font-weight: 600;
    }

    .issue-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .issue-title {
      font-size: 13px;
      font-weight: 500;
      flex: 1;
    }

    .issue-location {
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      white-space: nowrap;
    }

    .issue-location:hover {
      text-decoration: underline;
    }

    .expand-icon {
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--vscode-descriptionForeground);
      transition: transform 0.2s;
    }

    .issue-card.expanded .expand-icon {
      transform: translateY(-50%) rotate(180deg);
    }

    .issue-card-body {
      display: none;
      padding: 0 16px 16px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .issue-card.expanded .issue-card-body {
      display: block;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin: 16px 0 8px;
    }

    .what-section p {
      margin: 0 0 8px;
      font-size: 13px;
    }

    .context-info {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .context-info code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
    }

    /* Benchmark Section */
    .benchmark-section {
      margin-top: 16px;
    }

    .benchmark-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .benchmark-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      overflow: hidden;
    }

    .benchmark-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .benchmark-table tr:last-child td {
      border-bottom: none;
    }

    .benchmark-label {
      color: var(--vscode-descriptionForeground);
      width: 100px;
    }

    .benchmark-model {
      font-weight: 500;
    }

    .benchmark-price {
      text-align: right;
      color: var(--vscode-descriptionForeground);
    }

    .benchmark-recommended {
      background: rgba(34, 197, 94, 0.1);
    }

    .benchmark-recommended .benchmark-model {
      color: var(--vscode-testing-iconPassed);
    }

    .benchmark-savings {
      background: rgba(34, 197, 94, 0.15);
    }

    .benchmark-savings .benchmark-value {
      color: var(--vscode-testing-iconPassed);
      font-weight: 600;
    }

    .benchmark-simple {
      font-size: 12px;
      padding: 8px 12px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }

    /* Fix Section */
    .fix-section {
      margin-top: 16px;
    }

    .fix-content {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding: 10px 12px;
      border-radius: 0 4px 4px 0;
      font-size: 12px;
    }

    /* Action Buttons */
    .action-buttons {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .action-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
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

    .action-btn.secondary {
      background: transparent;
      border: 1px solid var(--vscode-panel-border);
    }

    .action-btn.small {
      padding: 4px 12px;
      font-size: 11px;
    }

    /* Suggested Actions */
    .suggested-section {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      padding: 16px;
      margin-top: 24px;
    }

    .suggested-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .suggested-icon {
      font-size: 16px;
    }

    .suggested-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
    }

    .suggested-intro {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 12px;
    }

    .suggested-action {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      margin-bottom: 8px;
    }

    .suggested-action.priority-high {
      border-left: 3px solid var(--vscode-errorForeground);
    }

    .suggested-action.priority-medium {
      border-left: 3px solid var(--vscode-editorWarning-foreground);
    }

    .action-arrow {
      color: var(--vscode-textLink-foreground);
      font-size: 14px;
    }

    .action-content {
      flex: 1;
    }

    .action-title {
      font-size: 12px;
      font-weight: 500;
    }

    .action-description {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .suggested-buttons {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    /* No Issues */
    .no-issues {
      text-align: center;
      padding: 48px 24px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
    }

    .no-issues-icon {
      font-size: 48px;
      margin-bottom: 16px;
      color: var(--vscode-testing-iconPassed);
    }

    .no-issues-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .no-issues p {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px;
    }
    `;
  }

  private getScript(): string {
    return `
    const vscode = acquireVsCodeApi();

    function openFile(file, line) {
      vscode.postMessage({ command: 'openFile', file, line });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function retry() {
      vscode.postMessage({ command: 'refresh' });
    }

    function analyzeFile() {
      vscode.postMessage({ command: 'analyzeFile' });
    }

    function analyzeWorkspace() {
      vscode.postMessage({ command: 'analyzeWorkspace' });
    }

    function setToken() {
      vscode.postMessage({ command: 'setToken' });
    }

    function applyFix(file, line, fix) {
      vscode.postMessage({ command: 'applyFix', file, line, fix });
    }

    function learnMore(url) {
      vscode.postMessage({ command: 'learnMore', url });
    }

    function executeCommand(cmd) {
      vscode.postMessage({ command: cmd.replace('peakinfer.', '') });
    }

    function toggleIssue(element) {
      const card = element.closest('.issue-card');
      card.classList.toggle('expanded');
    }

    // Filter functionality
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;
        document.querySelectorAll('.issue-card').forEach(card => {
          if (filter === 'all' || card.dataset.type === filter) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
    `;
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
