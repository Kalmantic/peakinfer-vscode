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
import { QuickStartViewProvider } from './views/quickStartView';
import { IssuesViewProvider } from './views/issuesView';

// Global instances
let diagnosticsManager: DiagnosticsManager;
let analysisRunner: AnalysisRunner;

// Extension state key for first run
const FIRST_RUN_KEY = 'peakinfer.firstRun';

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

    // Register sidebar views
    const quickStartProvider = new QuickStartViewProvider(context.extensionUri);
    const issuesProvider = new IssuesViewProvider(context.extensionUri, diagnosticsManager);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('peakinfer.quickStart', quickStartProvider)
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('peakinfer.issues', issuesProvider)
    );

    // Register open walkthrough command
    context.subscriptions.push(
      vscode.commands.registerCommand('peakinfer.openWalkthrough', () => {
        vscode.commands.executeCommand(
          'workbench.action.openWalkthrough',
          'kalmantic.peakinfer#peakinfer.gettingStarted',
          false
        );
      })
    );

    // Check for first run and show welcome
    const isFirstRun = context.globalState.get<boolean>(FIRST_RUN_KEY, true);
    if (isFirstRun) {
      showWelcomeMessage(context);
      context.globalState.update(FIRST_RUN_KEY, false);
    }

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

  // Show status bar item with improved UX
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = 'PeakInfer';
  statusBarItem.text = '$(terminal) PeakInfer';
  statusBarItem.command = {
    command: 'peakinfer.showQuickPick',
    title: 'PeakInfer Actions'
  };
  statusBarItem.tooltip = new vscode.MarkdownString(
    '**PeakInfer** - LLM Inference Analyzer\n\n' +
    '$(search) Click to see options\n\n' +
    '`Cmd+Alt+P` to analyze current file'
  );
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register quick pick command for status bar
  context.subscriptions.push(
    vscode.commands.registerCommand('peakinfer.showQuickPick', async () => {
      const items: vscode.QuickPickItem[] = [
        {
          label: '$(search) Analyze Current File',
          description: 'Cmd+Alt+P',
          detail: 'Scan the current file for LLM inference issues'
        },
        {
          label: '$(folder-opened) Analyze Workspace',
          description: '',
          detail: 'Scan all files in the workspace'
        },
        {
          label: '$(output) Show Results Panel',
          description: '',
          detail: 'View detailed analysis results'
        },
        {
          label: '$(key) Set Token',
          description: '',
          detail: 'Configure your PeakInfer API token'
        },
        {
          label: '$(book) Getting Started',
          description: '',
          detail: 'Learn how to use PeakInfer'
        },
        {
          label: '$(clear-all) Clear Diagnostics',
          description: '',
          detail: 'Remove all PeakInfer diagnostics'
        }
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'What would you like to do?',
        title: 'PeakInfer'
      });

      if (selected) {
        if (selected.label.includes('Analyze Current File')) {
          vscode.commands.executeCommand('peakinfer.analyzeFile');
        } else if (selected.label.includes('Analyze Workspace')) {
          vscode.commands.executeCommand('peakinfer.analyzeWorkspace');
        } else if (selected.label.includes('Show Results')) {
          vscode.commands.executeCommand('peakinfer.showResults');
        } else if (selected.label.includes('Set Token')) {
          vscode.commands.executeCommand('peakinfer.setToken');
        } else if (selected.label.includes('Getting Started')) {
          vscode.commands.executeCommand('peakinfer.openWalkthrough');
        } else if (selected.label.includes('Clear Diagnostics')) {
          vscode.commands.executeCommand('peakinfer.clearDiagnostics');
        }
      }
    })
  );

  // Update status bar based on diagnostics
  diagnosticsManager.onDiagnosticsChanged((count) => {
    if (count === 0) {
      statusBarItem.text = '$(terminal) PeakInfer';
      statusBarItem.backgroundColor = undefined;
      statusBarItem.tooltip = new vscode.MarkdownString(
        '**PeakInfer** - LLM Inference Analyzer\n\n' +
        '$(check) No issues found\n\n' +
        '$(search) Click to see options\n\n' +
        '`Cmd+Alt+P` to analyze current file'
      );
    } else {
      statusBarItem.text = `$(warning) PeakInfer (${count})`;
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      statusBarItem.tooltip = new vscode.MarkdownString(
        `**PeakInfer** - LLM Inference Analyzer\n\n` +
        `$(warning) **${count} issue${count > 1 ? 's' : ''} found**\n\n` +
        `Click to see options or view results`
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

/**
 * Show welcome message on first install
 */
async function showWelcomeMessage(context: vscode.ExtensionContext): Promise<void> {
  const action = await vscode.window.showInformationMessage(
    'Welcome to PeakInfer! Analyze your LLM code for cost, latency, and reliability issues.',
    'Get Started',
    'Set Token',
    'Later'
  );

  if (action === 'Get Started') {
    vscode.commands.executeCommand('peakinfer.openWalkthrough');
  } else if (action === 'Set Token') {
    vscode.commands.executeCommand('peakinfer.setToken');
  }
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
