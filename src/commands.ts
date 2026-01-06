/**
 * Command Registration
 *
 * Registers VS Code commands for PeakInfer
 */

import * as vscode from 'vscode';
import { DiagnosticsManager } from './diagnostics';
import { AnalysisRunner } from './analysis';
import { ResultsPanel } from './views/resultsPanel';

/**
 * Register all PeakInfer commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  diagnosticsManager: DiagnosticsManager,
  analysisRunner: AnalysisRunner
): void {
  // Analyze Current File
  context.subscriptions.push(
    vscode.commands.registerCommand('peakinfer.analyzeFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No file is currently open');
        return;
      }

      await analyzeFile(editor.document.uri, diagnosticsManager, analysisRunner);
    })
  );

  // Analyze Workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('peakinfer.analyzeWorkspace', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder is open');
        return;
      }

      await analyzeWorkspace(
        workspaceFolders[0].uri,
        diagnosticsManager,
        analysisRunner
      );
    })
  );

  // Show Results Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('peakinfer.showResults', () => {
      ResultsPanel.show(context.extensionUri);
    })
  );

  // Clear Diagnostics
  context.subscriptions.push(
    vscode.commands.registerCommand('peakinfer.clearDiagnostics', () => {
      diagnosticsManager.clear();
      ResultsPanel.clearResults();
      vscode.window.showInformationMessage('PeakInfer diagnostics cleared');
    })
  );

  // Set API Key
  context.subscriptions.push(
    vscode.commands.registerCommand('peakinfer.setApiKey', async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your Anthropic API key',
        password: true,
        placeHolder: 'sk-ant-...',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'API key cannot be empty';
          }
          if (!value.startsWith('sk-')) {
            return 'Invalid API key format. Should start with "sk-"';
          }
          return null;
        },
      });

      if (apiKey) {
        const config = vscode.workspace.getConfiguration('peakinfer');
        await config.update(
          'anthropicApiKey',
          apiKey,
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage('Anthropic API key saved');
      }
    })
  );
}

/**
 * Analyze a single file
 */
export async function analyzeFile(
  uri: vscode.Uri,
  diagnosticsManager: DiagnosticsManager,
  analysisRunner: AnalysisRunner
): Promise<void> {
  const fileName = uri.fsPath.split('/').pop() || uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `PeakInfer: Analyzing ${fileName}`,
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Scanning for inference points...' });

        const result = await analysisRunner.analyzeFile(uri);

        if (result.inferencePoints.length === 0) {
          vscode.window.showInformationMessage(
            `PeakInfer: No inference points found in ${fileName}`
          );
          diagnosticsManager.clearFile(uri);
          return;
        }

        diagnosticsManager.updateFromAnalysis(result);

        const { totalPoints, criticalIssues, warnings } = result.summary;
        let message = `PeakInfer: Found ${totalPoints} inference point(s)`;

        if (criticalIssues > 0 || warnings > 0) {
          message += ` with ${criticalIssues} critical and ${warnings} warnings`;
        }

        if (criticalIssues > 0) {
          vscode.window.showWarningMessage(message, 'Show Results').then((action) => {
            if (action === 'Show Results') {
              vscode.commands.executeCommand('peakinfer.showResults');
            }
          });
        } else {
          vscode.window.showInformationMessage(message);
        }

        // Update results panel if open
        ResultsPanel.updateResults([result]);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('API key')) {
          vscode.window
            .showErrorMessage(
              `PeakInfer: ${errorMessage}`,
              'Set API Key'
            )
            .then((action) => {
              if (action === 'Set API Key') {
                vscode.commands.executeCommand('peakinfer.setApiKey');
              }
            });
        } else {
          vscode.window.showErrorMessage(`PeakInfer: ${errorMessage}`);
        }
      }
    }
  );
}

/**
 * Analyze entire workspace
 */
export async function analyzeWorkspace(
  rootUri: vscode.Uri,
  diagnosticsManager: DiagnosticsManager,
  analysisRunner: AnalysisRunner
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'PeakInfer: Analyzing workspace',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        // Clear existing diagnostics
        diagnosticsManager.clear();

        const results = await analysisRunner.analyzeWorkspace(rootUri, progress);

        if (results.length === 0) {
          vscode.window.showInformationMessage(
            'PeakInfer: No inference points found in workspace'
          );
          return;
        }

        diagnosticsManager.updateFromMultipleAnalyses(results);

        // Calculate totals
        let totalPoints = 0;
        let totalCritical = 0;
        let totalWarnings = 0;

        for (const result of results) {
          totalPoints += result.summary.totalPoints;
          totalCritical += result.summary.criticalIssues;
          totalWarnings += result.summary.warnings;
        }

        let message = `PeakInfer: Found ${totalPoints} inference point(s) in ${results.length} file(s)`;

        if (totalCritical > 0 || totalWarnings > 0) {
          message += ` with ${totalCritical} critical and ${totalWarnings} warnings`;
        }

        if (totalCritical > 0) {
          vscode.window
            .showWarningMessage(message, 'Show Results')
            .then((action) => {
              if (action === 'Show Results') {
                vscode.commands.executeCommand('peakinfer.showResults');
              }
            });
        } else {
          vscode.window.showInformationMessage(message);
        }

        // Update results panel
        ResultsPanel.updateResults(results);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('API key')) {
          vscode.window
            .showErrorMessage(
              `PeakInfer: ${errorMessage}`,
              'Set API Key'
            )
            .then((action) => {
              if (action === 'Set API Key') {
                vscode.commands.executeCommand('peakinfer.setApiKey');
              }
            });
        } else {
          vscode.window.showErrorMessage(`PeakInfer: ${errorMessage}`);
        }
      }
    }
  );
}
