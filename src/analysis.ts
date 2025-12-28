/**
 * Analysis Runner
 *
 * Runs PeakInfer analysis using Anthropic Claude API (BYOK mode)
 */

import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';

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
}

export class AnalysisRunner {
  private context: vscode.ExtensionContext;
  private client: Anthropic | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get Anthropic API key from settings or environment
   */
  private getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('peakinfer');
    const settingsKey = config.get<string>('anthropicApiKey');

    if (settingsKey && settingsKey.trim()) {
      return settingsKey.trim();
    }

    return process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Initialize the Anthropic client
   */
  private initClient(): Anthropic {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error(
        'Anthropic API key not configured. Set it in VS Code settings (peakinfer.anthropicApiKey) or ANTHROPIC_API_KEY environment variable.'
      );
    }

    if (!this.client) {
      this.client = new Anthropic({ apiKey });
    }

    return this.client;
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(fileUri: vscode.Uri): Promise<AnalysisResult> {
    const client = this.initClient();
    const document = await vscode.workspace.openTextDocument(fileUri);
    const content = document.getText();
    const fileName = fileUri.fsPath;

    const prompt = this.buildAnalysisPrompt(fileName, content);

    // Get model from configuration (supports latest alias or specific version)
    const config = vscode.workspace.getConfiguration('peakinfer');
    const model = config.get<string>('model') || 'claude-sonnet-4-latest';

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return this.parseAnalysisResponse(fileName, responseText);
  }

  /**
   * Analyze workspace (multiple files)
   */
  async analyzeWorkspace(
    rootUri: vscode.Uri,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<AnalysisResult[]> {
    const config = vscode.workspace.getConfiguration('peakinfer');
    const excludePatterns = config.get<string[]>('excludePatterns') || [];

    // Find all relevant files
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,py,go,rs}',
      `{${excludePatterns.join(',')}}`
    );

    const results: AnalysisResult[] = [];
    const totalFiles = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (progress) {
        progress.report({
          message: `Analyzing ${file.fsPath.split('/').pop()}`,
          increment: 100 / totalFiles,
        });
      }

      try {
        const result = await this.analyzeFile(file);
        if (result.inferencePoints.length > 0) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error analyzing ${file.fsPath}:`, error);
      }
    }

    return results;
  }

  /**
   * Build the analysis prompt
   */
  private buildAnalysisPrompt(fileName: string, content: string): string {
    const config = vscode.workspace.getConfiguration('peakinfer');
    const includeBenchmarks = config.get<boolean>('includeBenchmarks');

    return `Analyze this file for LLM inference points and issues.

File: ${fileName}

\`\`\`
${content}
\`\`\`

Find all LLM API calls (OpenAI, Anthropic, Google, LangChain, LiteLLM, etc.) and analyze them for:
1. **Cost** - Wrong model selection, overpowered usage, missing caching
2. **Latency** - Missing streaming, blocking calls, sequential when parallel possible
3. **Throughput** - Missing batching, rate limit issues
4. **Reliability** - Missing retries, timeouts, fallbacks

${includeBenchmarks ? 'Include InferenceMAX benchmark comparisons where relevant.' : ''}

Return a JSON response with this structure:
{
  "inferencePoints": [
    {
      "id": "file:line",
      "line": <line_number>,
      "column": <column_number>,
      "provider": "openai|anthropic|google|langchain|litellm|...",
      "model": "<model_name>",
      "framework": "<framework_if_any>",
      "patterns": {
        "streaming": true|false,
        "batching": true|false,
        "retries": true|false,
        "caching": true|false,
        "fallback": true|false
      },
      "issues": [
        {
          "type": "cost|latency|throughput|reliability",
          "severity": "critical|high|medium|low",
          "title": "<short_title>",
          "description": "<detailed_description>",
          "impact": "<estimated_impact>",
          "fix": "<suggested_fix>"
        }
      ],
      "confidence": 0.0-1.0
    }
  ]
}

If no inference points are found, return:
{ "inferencePoints": [] }

IMPORTANT: Return ONLY valid JSON, no markdown formatting.`;
  }

  /**
   * Parse the analysis response
   */
  private parseAnalysisResponse(fileName: string, response: string): AnalysisResult {
    try {
      // Try to extract JSON from response
      let jsonStr = response;

      // Remove markdown code blocks if present
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());
      const inferencePoints: InferencePoint[] = parsed.inferencePoints || [];

      // Add file to each point
      for (const point of inferencePoints) {
        point.file = fileName;
        if (!point.id) {
          point.id = `${fileName}:${point.line}`;
        }
      }

      // Calculate summary
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
      };
    } catch (error) {
      console.error('Failed to parse analysis response:', error);
      return {
        version: '1.0',
        file: fileName,
        analyzedAt: new Date().toISOString(),
        inferencePoints: [],
        summary: {
          totalPoints: 0,
          criticalIssues: 0,
          warnings: 0,
          providers: [],
          models: [],
        },
      };
    }
  }
}
