/**
 * PeakInfer VS Code Extension
 *
 * LLM inference analysis - find cost waste, latency issues, and reliability gaps
 */

import * as vscode from 'vscode';
import { registerCommands, analyzeFile, analyzeWorkspace } from './commands';
import { DiagnosticsManager } from './diagnostics';
import { ResultsPanel } from './views/resultsPanel';
import { AnalysisRunner } from './analysis';

// Global instances
let diagnosticsManager: DiagnosticsManager;
let analysisRunner: AnalysisRunner;

export function activate(context: vscode.ExtensionContext) {
  console.log('PeakInfer extension activated');

  try {
    // Initialize diagnostics collection
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('peakinfer');
    context.subscriptions.push(diagnosticCollection);

    // Initialize managers
    diagnosticsManager = new DiagnosticsManager(diagnosticCollection);
    analysisRunner = new AnalysisRunner(context);

    // Register commands
    registerCommands(context, diagnosticsManager, analysisRunner);

    // Register results panel
    ResultsPanel.register(context);
  } catch (error) {
    console.error('Error activating PeakInfer extension:', error);
    vscode.window.showErrorMessage(
      `PeakInfer extension failed to activate: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }

  // Set up file save listener for analyze-on-save
  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const config = vscode.workspace.getConfiguration('peakinfer');
    if (config.get<boolean>('analyzeOnSave')) {
      await analyzeFile(document.uri, diagnosticsManager, analysisRunner);
    }
  });
  context.subscriptions.push(saveDisposable);

  // Show status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(pulse) PeakInfer';
  statusBarItem.command = 'peakinfer.showResults';
  statusBarItem.tooltip = 'Click to show PeakInfer results';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Update status bar based on diagnostics
  diagnosticsManager.onDiagnosticsChanged((count) => {
    if (count === 0) {
      statusBarItem.text = '$(check) PeakInfer';
      statusBarItem.backgroundColor = undefined;
    } else if (count > 0) {
      statusBarItem.text = `$(warning) PeakInfer (${count})`;
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    }
  });

  // Register code lens provider for inline hints
  const codeLensProvider = new InferenceCodeLensProvider(diagnosticsManager);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { language: 'typescript' },
        { language: 'javascript' },
        { language: 'python' },
        { language: 'go' },
        { language: 'rust' },
      ],
      codeLensProvider
    )
  );
}

export function deactivate() {
  console.log('PeakInfer extension deactivated');
}

/**
 * Code lens provider for showing inference point hints
 */
class InferenceCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private diagnosticsManager: DiagnosticsManager) {
    // Refresh code lenses when diagnostics change
    diagnosticsManager.onDiagnosticsChanged(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('peakinfer');
    if (!config.get<boolean>('showInlineHints')) {
      return [];
    }

    const diagnostics = this.diagnosticsManager.getDiagnostics(document.uri);
    if (!diagnostics || diagnostics.length === 0) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    for (const diagnostic of diagnostics) {
      const range = diagnostic.range;
      const severity = this.getSeverityLabel(diagnostic.severity);
      const impact = this.extractImpact(diagnostic.message);

      const codeLens = new vscode.CodeLens(range, {
        title: `[${severity}] ${impact}`,
        command: 'peakinfer.showResults',
        tooltip: diagnostic.message,
      });

      codeLenses.push(codeLens);
    }

    return codeLenses;
  }

  private getSeverityLabel(severity: vscode.DiagnosticSeverity | undefined): string {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return 'CRITICAL';
      case vscode.DiagnosticSeverity.Warning:
        return 'WARNING';
      case vscode.DiagnosticSeverity.Information:
        return 'INFO';
      default:
        return 'HINT';
    }
  }

  private extractImpact(message: string): string {
    // Extract impact from message if present
    const impactMatch = message.match(/Impact: ([^.]+)/);
    if (impactMatch) {
      return impactMatch[1].trim();
    }
    // Return first 50 chars of message
    return message.slice(0, 50) + (message.length > 50 ? '...' : '');
  }
}
