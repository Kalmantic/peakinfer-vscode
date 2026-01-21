/**
 * Analysis Runner
 *
 * Runs PeakInfer analysis using PeakInfer API (peakinfer.com/api/analyze)
 */

import * as vscode from 'vscode';

const PEAKINFER_API = 'https://www.peakinfer.com/api';

export interface InferencePoint {
  id: string;
  file: string;
  line: number;
  column?: number;
  provider?: string;
  model?: string;
  framework?: string;
  patterns: {
    streaming?: boolean;
    batching?: boolean;
    retries?: boolean;
    caching?: boolean;
    fallback?: boolean;
  };
  issues: Issue[];
  confidence: number;
}

export interface Issue {
  type: 'cost' | 'latency' | 'throughput' | 'reliability';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact?: string;
  fix?: string;
  benchmark?: {
    yourValue?: number;
    benchmarkValue?: number;
    gap?: string;
  };
}

export interface AnalysisResult {
  version: string;
  file: string;
  analyzedAt: string;
  inferencePoints: InferencePoint[];
  summary: {
    totalPoints: number;
    criticalIssues: number;
    warnings: number;
    providers: string[];
    models: string[];
  };
  credits?: {
    consumed: number;
    remaining: number;
  };
}

interface FileInfo {
  path: string;
  content: string;
}

interface ApiAnalysisResponse {
  success: boolean;
  analysis: {
    inferencePoints: Array<{
      id: string;
      file: string;
      line: number;
      column?: number;
      provider: string;
      model: string;
      framework?: string;
      patterns?: {
        streaming?: boolean;
        batching?: boolean;
        retries?: boolean;
        caching?: boolean;
        fallback?: boolean;
      };
      issues: Array<{
        type: string;
        severity: 'critical' | 'warning' | 'info';
        headline: string;
        evidence: string;
        suggestedFix?: string;
      }>;
      confidence?: number;
    }>;
    summary: {
      totalInferencePoints: number;
      totalFiles: number;
      providers: string[];
      models: string[];
      overallReliability: string;
      totalOptimizations: number;
      criticalOptimizations: number;
    };
  };
  credits?: {
    consumed: number;
    remaining: number;
    expiringSoon: number;
  };
}

interface ApiErrorResponse {
  error: string;
  code?: string;
  hint?: string;
}

export class AnalysisRunner {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get PeakInfer token from settings or environment
   */
  private getToken(): string | undefined {
    const config = vscode.workspace.getConfiguration('peakinfer');
    const settingsToken = config.get<string>('token');

    if (settingsToken && settingsToken.trim()) {
      return settingsToken.trim();
    }

    return process.env.PEAKINFER_TOKEN;
  }

  /**
   * Validate token is configured
   */
  private validateToken(): string {
    const token = this.getToken();

    if (!token) {
      throw new Error(
        'PeakInfer token not configured. Set it in VS Code settings (peakinfer.token) or PEAKINFER_TOKEN environment variable. Get your token at https://peakinfer.com/dashboard'
      );
    }

    return token;
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(fileUri: vscode.Uri): Promise<AnalysisResult> {
    const token = this.validateToken();
    const document = await vscode.workspace.openTextDocument(fileUri);
    const content = document.getText();
    const fileName = fileUri.fsPath;

    const config = vscode.workspace.getConfiguration('peakinfer');
    const includeBenchmarks = config.get<boolean>('includeBenchmarks') ?? true;

    const files: FileInfo[] = [{ path: fileName, content }];

    const response = await this.callAnalysisAPI(token, files, includeBenchmarks);

    if ('error' in response) {
      throw new Error(response.error + (response.hint ? ` (${response.hint})` : ''));
    }

    return this.transformApiResponse(fileName, response);
  }

  /**
   * Analyze workspace (multiple files)
   */
  async analyzeWorkspace(
    rootUri: vscode.Uri,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<AnalysisResult[]> {
    const token = this.validateToken();
    const config = vscode.workspace.getConfiguration('peakinfer');
    const excludePatterns = config.get<string[]>('excludePatterns') || [];
    const includeBenchmarks = config.get<boolean>('includeBenchmarks') ?? true;

    // Find all relevant files
    const fileUris = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,py,go,rs}',
      `{${excludePatterns.join(',')}}`
    );

    if (progress) {
      progress.report({ message: 'Collecting files...' });
    }

    // Collect file contents
    const files: FileInfo[] = [];
    const maxFiles = 50;

    for (let i = 0; i < Math.min(fileUris.length, maxFiles); i++) {
      const fileUri = fileUris[i];
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const content = document.getText();
        if (content.length < 100000) {
          files.push({ path: fileUri.fsPath, content });
        }
      } catch {
        // Skip unreadable files
      }
    }

    if (progress) {
      progress.report({ message: `Analyzing ${files.length} files...`, increment: 50 });
    }

    // Call API with all files at once
    const response = await this.callAnalysisAPI(token, files, includeBenchmarks);

    if ('error' in response) {
      throw new Error(response.error + (response.hint ? ` (${response.hint})` : ''));
    }

    if (progress) {
      progress.report({ message: 'Processing results...', increment: 40 });
    }

    // Group results by file
    const resultsByFile = new Map<string, InferencePoint[]>();

    for (const point of response.analysis.inferencePoints) {
      const fileName = point.file;
      if (!resultsByFile.has(fileName)) {
        resultsByFile.set(fileName, []);
      }
      resultsByFile.get(fileName)!.push(this.transformInferencePoint(point));
    }

    // Create results for each file
    const results: AnalysisResult[] = [];

    for (const [fileName, points] of resultsByFile) {
      if (points.length > 0) {
        results.push(this.createResultFromPoints(fileName, points, response.credits));
      }
    }

    return results;
  }

  /**
   * Call PeakInfer API
   */
  private async callAnalysisAPI(
    token: string,
    files: FileInfo[],
    includeBenchmarks: boolean
  ): Promise<ApiAnalysisResponse | ApiErrorResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(`${PEAKINFER_API}/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        files,
        source: 'vscode',
        layers: {
          benchmarks: includeBenchmarks ? { framework: 'api' } : undefined,
        },
        mode: 'paid',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return data as ApiErrorResponse;
    }

    return data as ApiAnalysisResponse;
  }

  /**
   * Transform API inference point to local format
   */
  private transformInferencePoint(apiPoint: ApiAnalysisResponse['analysis']['inferencePoints'][0]): InferencePoint {
    return {
      id: apiPoint.id || `${apiPoint.file}:${apiPoint.line}`,
      file: apiPoint.file,
      line: apiPoint.line,
      column: apiPoint.column,
      provider: apiPoint.provider,
      model: apiPoint.model,
      framework: apiPoint.framework,
      patterns: apiPoint.patterns || {},
      issues: (apiPoint.issues || []).map(issue => ({
        type: issue.type as Issue['type'],
        severity: this.mapSeverity(issue.severity),
        title: issue.headline,
        description: issue.evidence,
        fix: issue.suggestedFix,
      })),
      confidence: apiPoint.confidence || 0.9,
    };
  }

  /**
   * Map API severity to local severity
   */
  private mapSeverity(severity: 'critical' | 'warning' | 'info'): Issue['severity'] {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'warning':
        return 'high';
      case 'info':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Transform API response to local format
   */
  private transformApiResponse(
    fileName: string,
    response: ApiAnalysisResponse
  ): AnalysisResult {
    const inferencePoints = response.analysis.inferencePoints
      .filter(p => p.file === fileName || p.file.endsWith(fileName.split('/').pop() || ''))
      .map(p => this.transformInferencePoint(p));

    return this.createResultFromPoints(fileName, inferencePoints, response.credits);
  }

  /**
   * Create result from inference points
   */
  private createResultFromPoints(
    fileName: string,
    inferencePoints: InferencePoint[],
    credits?: ApiAnalysisResponse['credits']
  ): AnalysisResult {
    const providers = new Set<string>();
    const models = new Set<string>();
    let criticalIssues = 0;
    let warnings = 0;

    for (const point of inferencePoints) {
      if (point.provider) providers.add(point.provider);
      if (point.model) models.add(point.model);

      for (const issue of point.issues || []) {
        if (issue.severity === 'critical') criticalIssues++;
        else if (issue.severity === 'high' || issue.severity === 'medium')
          warnings++;
      }
    }

    return {
      version: '1.0',
      file: fileName,
      analyzedAt: new Date().toISOString(),
      inferencePoints,
      summary: {
        totalPoints: inferencePoints.length,
        criticalIssues,
        warnings,
        providers: Array.from(providers),
        models: Array.from(models),
      },
      credits: credits ? {
        consumed: credits.consumed,
        remaining: credits.remaining,
      } : undefined,
    };
  }
}
