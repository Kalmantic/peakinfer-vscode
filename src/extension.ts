/**
 * PeakInfer VS Code Extension
 *
 * AI-native LLM inference analysis with proactive detection,
 * enhanced CodeLens, and streamlined UX.
 */

import * as vscode from 'vscode';
import { registerCommands, analyzeFile, analyzeWorkspace } from './commands';
import { DiagnosticsManager } from './diagnostics';
import { ResultsPanel } from './views/resultsPanel';
import { AnalysisRunner, AnalysisResult } from './analysis';
import { QuickStartViewProvider } from './views/quickStartView';
import { IssuesViewProvider } from './views/issuesView';
import { ImpactCalculator } from './utils/impactCalculator';

// Global instances
let diagnosticsManager: DiagnosticsManager;
let analysisRunner: AnalysisRunner;
let quickStartProvider: QuickStartViewProvider;
let issuesProvider: IssuesViewProvider;

// LLM detection state
const llmFileCache = new Map<string, { hasLLM: boolean; lastChecked: number }>();
const LLM_CACHE_TTL = 60000; // 1 minute
const analyzedFiles = new Set<string>();

// Extension state keys
const FIRST_RUN_KEY = 'peakinfer.firstRun';
const DONT_ASK_FILES_KEY = 'peakinfer.dontAskFiles';

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

    // Register sidebar views with enhanced providers
    quickStartProvider = new QuickStartViewProvider(context.extensionUri, diagnosticsManager);
    issuesProvider = new IssuesViewProvider(context.extensionUri, diagnosticsManager);

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

  // Phase 8: Auto-detection on file open
  const openDisposable = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (!editor) return;

    const document = editor.document;
    const config = vscode.workspace.getConfiguration('peakinfer');

    // Check if auto-detection is enabled (default: true)
    const autoDetect = config.get<boolean>('autoDetect', true);
    if (!autoDetect) return;

    // Skip non-code files
    const supportedLanguages = ['typescript', 'javascript', 'python', 'go', 'rust'];
    if (!supportedLanguages.includes(document.languageId)) return;

    // Check if file has LLM code
    const hasLLM = await detectLLMCode(document);
    if (!hasLLM) return;

    // Check if already analyzed recently
    if (analyzedFiles.has(document.uri.fsPath)) return;

    // Check if user said "don't ask for this file"
    const dontAskFiles = context.globalState.get<string[]>(DONT_ASK_FILES_KEY, []);
    if (dontAskFiles.includes(document.uri.fsPath)) return;

    // Show non-intrusive notification
    const action = await vscode.window.showInformationMessage(
      `LLM code detected in ${document.fileName.split('/').pop()}`,
      'Analyze Now',
      'Later',
      "Don't Ask"
    );

    if (action === 'Analyze Now') {
      analyzedFiles.add(document.uri.fsPath);
      await analyzeFile(document.uri, diagnosticsManager, analysisRunner);
    } else if (action === "Don't Ask") {
      dontAskFiles.push(document.uri.fsPath);
      context.globalState.update(DONT_ASK_FILES_KEY, dontAskFiles);
    }
  });
  context.subscriptions.push(openDisposable);

  // Show status bar item with improved UX
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.name = 'PeakInfer';
  statusBarItem.text = '$(terminal) PeakInfer';
  statusBarItem.command = {
    command: 'peakinfer.showQuickPick',
    title: 'PeakInfer Actions',
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
          detail: 'Scan the current file for LLM inference issues',
        },
        {
          label: '$(folder-opened) Analyze Workspace',
          description: '',
          detail: 'Scan all files in the workspace',
        },
        {
          label: '$(output) Show Results Panel',
          description: '',
          detail: 'View detailed analysis results',
        },
        {
          label: '$(key) Set Token',
          description: '',
          detail: 'Configure your PeakInfer API token',
        },
        {
          label: '$(book) Getting Started',
          description: '',
          detail: 'Learn how to use PeakInfer',
        },
        {
          label: '$(clear-all) Clear Diagnostics',
          description: '',
          detail: 'Remove all PeakInfer diagnostics',
        },
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'What would you like to do?',
        title: 'PeakInfer',
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
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarItem.tooltip = new vscode.MarkdownString(
        `**PeakInfer** - LLM Inference Analyzer\n\n` +
          `$(warning) **${count} issue${count > 1 ? 's' : ''} found**\n\n` +
          `Click to see options or view results`
      );
    }
  });

  // Phase 7: Enhanced code lens provider with savings info
  const codeLensProvider = new EnhancedCodeLensProvider(diagnosticsManager, context);
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

  // Register quick fix code action provider
  const quickFixProvider = new QuickFixActionProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: 'typescript' },
        { language: 'javascript' },
        { language: 'python' },
        { language: 'go' },
        { language: 'rust' },
      ],
      quickFixProvider,
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }
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

/**
 * Detect if a document contains LLM code (Phase 8)
 */
async function detectLLMCode(document: vscode.TextDocument): Promise<boolean> {
  const filePath = document.uri.fsPath;

  // Check cache
  const cached = llmFileCache.get(filePath);
  if (cached && Date.now() - cached.lastChecked < LLM_CACHE_TTL) {
    return cached.hasLLM;
  }

  const content = document.getText();

  // LLM detection patterns
  const llmPatterns = [
    // OpenAI patterns
    /openai\.ChatCompletion/i,
    /openai\.Completion/i,
    /client\.chat\.completions/i,
    /from\s+openai\s+import/i,
    /import\s+.*OpenAI/i,

    // Anthropic patterns
    /anthropic\.messages/i,
    /anthropic\.completions/i,
    /Anthropic\s*\(/i,
    /from\s+anthropic\s+import/i,

    // Model name patterns
    /model\s*[:=]\s*["'](gpt-4|gpt-3\.5|claude-|gemini-|llama)/i,
    /["'](gpt-4o|gpt-4-turbo|claude-3|claude-sonnet|claude-opus)/i,

    // SDK patterns
    /LangChain|ChatOpenAI|ChatAnthropic/i,
    /google\.generativeai/i,

    // Framework patterns
    /\.create\s*\(\s*\{[^}]*model\s*:/i,
    /messages\.create\s*\(/i,
    /completions\.create\s*\(/i,
  ];

  const hasLLM = llmPatterns.some((pattern) => pattern.test(content));

  // Update cache
  llmFileCache.set(filePath, { hasLLM, lastChecked: Date.now() });

  return hasLLM;
}

/**
 * Update views with analysis results
 */
export function updateViewsWithResults(results: AnalysisResult[]): void {
  if (quickStartProvider) {
    quickStartProvider.updateWithResults(results);
  }
  if (issuesProvider) {
    issuesProvider.updateWithResults(results);
  }
}

export function deactivate() {
  console.log('PeakInfer extension deactivated');
}

/**
 * Phase 7: Enhanced code lens provider with savings information
 */
class EnhancedCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(
    private diagnosticsManager: DiagnosticsManager,
    private context: vscode.ExtensionContext
  ) {
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
      const { severity, type, savings, fix } = this.parseDiagnostic(diagnostic);

      // Build title with savings info (Phase 7 enhancement)
      let title = severity;
      if (savings) {
        title = `${savings} waste`;
      } else if (type) {
        title = `${severity} ${type}`;
      }

      // Add impact info
      const impact = this.extractImpact(diagnostic.message);
      if (impact && impact.length < 40) {
        title += ` - ${impact}`;
      }

      // Main code lens
      const codeLens = new vscode.CodeLens(range, {
        title: title,
        command: 'peakinfer.showResults',
        tooltip: diagnostic.message,
      });
      codeLenses.push(codeLens);

      // Add "Fix" action if available
      if (fix) {
        const fixLens = new vscode.CodeLens(range, {
          title: '[Fix]',
          command: 'peakinfer.applyQuickFix',
          arguments: [document.uri, range.start.line, fix],
          tooltip: `Apply: ${fix}`,
        });
        codeLenses.push(fixLens);
      }

      // Add "Details" link
      const detailsLens = new vscode.CodeLens(range, {
        title: '[Details]',
        command: 'peakinfer.showIssueDetails',
        arguments: [document.uri, range.start.line],
        tooltip: 'View full issue details',
      });
      codeLenses.push(detailsLens);
    }

    return codeLenses;
  }

  private parseDiagnostic(diagnostic: vscode.Diagnostic): {
    severity: string;
    type: string | null;
    savings: string | null;
    fix: string | null;
  } {
    let severity = 'Issue';
    let type: string | null = null;
    let savings: string | null = null;
    let fix: string | null = null;

    // Parse severity
    if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
      severity = 'CRITICAL';
    } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
      severity = 'WARNING';
    } else {
      severity = 'INFO';
    }

    // Parse type
    const typeMatch = diagnostic.message.match(/\[(COST|LATENCY|THROUGHPUT|RELIABILITY)\]/i);
    if (typeMatch) {
      type = typeMatch[1].toLowerCase();
    }

    // Extract savings estimate from message
    const savingsMatch = diagnostic.message.match(/\$(\d+(?:\.\d+)?)\s*\/\s*(?:mo|month)/i);
    if (savingsMatch) {
      savings = `$${savingsMatch[1]}/mo`;
    }

    // Extract fix suggestion
    const fixMatch = diagnostic.message.match(/Fix:\s*(.+?)(?:\n|$)/i);
    if (fixMatch) {
      fix = fixMatch[1].trim();
    }

    return { severity, type, savings, fix };
  }

  private extractImpact(message: string): string {
    // Extract impact from message if present
    const impactMatch = message.match(/Impact:\s*([^.\n]+)/);
    if (impactMatch) {
      return impactMatch[1].trim();
    }

    // Get first line without brackets
    const firstLine = message.split('\n')[0];
    const cleaned = firstLine.replace(/\[.*?\]/g, '').trim();
    return cleaned.slice(0, 50) + (cleaned.length > 50 ? '...' : '');
  }
}

/**
 * Quick fix code action provider
 */
class QuickFixActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Filter to PeakInfer diagnostics
    const peakinferDiagnostics = context.diagnostics.filter((d) => d.source === 'PeakInfer');

    for (const diagnostic of peakinferDiagnostics) {
      // Extract fix suggestion
      const fixMatch = diagnostic.message.match(/Fix:\s*(.+?)(?:\n|$)/i);
      if (fixMatch) {
        const fixSuggestion = fixMatch[1].trim();

        // Create "Apply Suggestion" action
        const action = new vscode.CodeAction(
          `PeakInfer: ${fixSuggestion.substring(0, 50)}${fixSuggestion.length > 50 ? '...' : ''}`,
          vscode.CodeActionKind.QuickFix
        );
        action.command = {
          command: 'peakinfer.applyQuickFix',
          title: 'Apply PeakInfer suggestion',
          arguments: [document.uri, diagnostic.range.start.line, fixSuggestion],
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        actions.push(action);
      }

      // Create "View Details" action
      const detailsAction = new vscode.CodeAction(
        'PeakInfer: View full issue details',
        vscode.CodeActionKind.QuickFix
      );
      detailsAction.command = {
        command: 'peakinfer.showResults',
        title: 'View PeakInfer results',
      };
      detailsAction.diagnostics = [diagnostic];
      actions.push(detailsAction);

      // Create "Learn More" action
      const learnAction = new vscode.CodeAction('PeakInfer: Learn more', vscode.CodeActionKind.QuickFix);
      learnAction.command = {
        command: 'vscode.open',
        title: 'Open documentation',
        arguments: [vscode.Uri.parse('https://peakinfer.com/docs')],
      };
      learnAction.diagnostics = [diagnostic];
      actions.push(learnAction);
    }

    return actions;
  }
}

// Register additional commands for Phase 7
vscode.commands.registerCommand(
  'peakinfer.applyQuickFix',
  async (uri: vscode.Uri, line: number, fix: string) => {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);

    // Navigate to the line
    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));

    // Show the fix suggestion with copy option
    const action = await vscode.window.showInformationMessage(`Suggested fix: ${fix}`, 'Copy to Clipboard', 'Dismiss');

    if (action === 'Copy to Clipboard') {
      await vscode.env.clipboard.writeText(fix);
      vscode.window.showInformationMessage('Fix copied to clipboard!');
    }
  }
);

vscode.commands.registerCommand(
  'peakinfer.showIssueDetails',
  async (_uri: vscode.Uri, _line: number) => {
    vscode.commands.executeCommand('peakinfer.showResults');
  }
);
