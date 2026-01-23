/**
 * Diagnostics Manager
 *
 * Manages VS Code diagnostics (squiggles) for inference issues
 */

import * as vscode from 'vscode';
import { AnalysisResult, Issue, InferencePoint } from './analysis';

export class DiagnosticsManager {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private _onDiagnosticsChanged = new vscode.EventEmitter<number>();
  readonly onDiagnosticsChanged = this._onDiagnosticsChanged.event;

  private totalDiagnostics = 0;

  constructor(diagnosticCollection: vscode.DiagnosticCollection) {
    this.diagnosticCollection = diagnosticCollection;
  }

  /**
   * Update diagnostics from analysis result
   */
  updateFromAnalysis(result: AnalysisResult): void {
    const uri = vscode.Uri.file(result.file);
    const diagnostics = this.createDiagnostics(result);

    this.diagnosticCollection.set(uri, diagnostics);
    this.updateTotalCount();
  }

  /**
   * Update diagnostics from multiple analysis results
   */
  updateFromMultipleAnalyses(results: AnalysisResult[]): void {
    for (const result of results) {
      this.updateFromAnalysis(result);
    }
  }

  /**
   * Clear all diagnostics
   */
  clear(): void {
    this.diagnosticCollection.clear();
    this.totalDiagnostics = 0;
    this._onDiagnosticsChanged.fire(0);
  }

  /**
   * Clear diagnostics for a specific file
   */
  clearFile(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
    this.updateTotalCount();
  }

  /**
   * Get diagnostics for a specific file
   */
  getDiagnostics(uri: vscode.Uri): readonly vscode.Diagnostic[] | undefined {
    return this.diagnosticCollection.get(uri);
  }

  /**
   * Get all diagnostics across all files
   */
  getAllDiagnostics(): [vscode.Uri, readonly vscode.Diagnostic[]][] {
    const result: [vscode.Uri, readonly vscode.Diagnostic[]][] = [];
    this.diagnosticCollection.forEach((uri, diagnostics) => {
      if (diagnostics.length > 0) {
        result.push([uri, diagnostics]);
      }
    });
    return result;
  }

  /**
   * Create diagnostics from analysis result
   */
  private createDiagnostics(result: AnalysisResult): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const config = vscode.workspace.getConfiguration('peakinfer');
    const threshold = config.get<string>('severityThreshold') || 'warning';

    for (const point of result.inferencePoints) {
      for (const issue of point.issues || []) {
        if (!this.meetsThreshold(issue.severity, threshold)) {
          continue;
        }

        const diagnostic = this.createDiagnostic(point, issue);
        diagnostics.push(diagnostic);
      }
    }

    return diagnostics;
  }

  /**
   * Create a single diagnostic
   */
  private createDiagnostic(point: InferencePoint, issue: Issue): vscode.Diagnostic {
    // Create range for the line
    const line = Math.max(0, point.line - 1); // VS Code uses 0-indexed lines
    const column = point.column ? point.column - 1 : 0;

    // Create a range that spans the entire line
    const range = new vscode.Range(
      new vscode.Position(line, column),
      new vscode.Position(line, 1000) // Extend to end of line
    );

    // Build diagnostic message
    let message = `[${issue.type.toUpperCase()}] ${issue.title}`;
    if (issue.description) {
      message += `\n${issue.description}`;
    }
    if (issue.impact) {
      message += `\nImpact: ${issue.impact}`;
    }
    if (issue.fix) {
      message += `\nFix: ${issue.fix}`;
    }
    if (issue.benchmark) {
      message += `\nBenchmark: Your ${issue.benchmark.yourValue} vs ${issue.benchmark.benchmarkValue} (${issue.benchmark.gap})`;
    }

    // Map severity
    const severity = this.mapSeverity(issue.severity);

    const diagnostic = new vscode.Diagnostic(range, message, severity);

    // Add source and code
    diagnostic.source = 'PeakInfer';
    diagnostic.code = {
      value: issue.type,
      target: vscode.Uri.parse('https://peakinfer.com/docs/issues/' + issue.type),
    };

    // Add tags for hints
    if (issue.severity === 'low') {
      diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    }

    // Add related information if we have a fix
    if (issue.fix) {
      diagnostic.relatedInformation = [
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(vscode.Uri.file(point.file), range),
          `Suggested fix: ${issue.fix}`
        ),
      ];
    }

    return diagnostic;
  }

  /**
   * Map issue severity to VS Code diagnostic severity
   */
  private mapSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'critical':
        return vscode.DiagnosticSeverity.Error;
      case 'high':
        return vscode.DiagnosticSeverity.Warning;
      case 'medium':
        return vscode.DiagnosticSeverity.Warning;
      case 'low':
        return vscode.DiagnosticSeverity.Information;
      default:
        return vscode.DiagnosticSeverity.Hint;
    }
  }

  /**
   * Check if issue severity meets threshold
   */
  private meetsThreshold(issueSeverity: string, threshold: string): boolean {
    const severityOrder = ['error', 'warning', 'info'];
    const issueLevel = this.mapSeverityToThreshold(issueSeverity);
    const thresholdLevel = severityOrder.indexOf(threshold);

    return severityOrder.indexOf(issueLevel) <= thresholdLevel;
  }

  /**
   * Map issue severity to threshold level
   */
  private mapSeverityToThreshold(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'info';
    }
  }

  /**
   * Update total diagnostic count
   */
  private updateTotalCount(): void {
    let total = 0;
    this.diagnosticCollection.forEach((uri, diagnostics) => {
      total += diagnostics.length;
    });

    if (total !== this.totalDiagnostics) {
      this.totalDiagnostics = total;
      this._onDiagnosticsChanged.fire(total);
    }
  }
}
