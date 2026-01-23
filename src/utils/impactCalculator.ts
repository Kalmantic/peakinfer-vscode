/**
 * Impact Calculator
 *
 * Calculates estimated savings and impact for LLM inference optimizations.
 * Uses model pricing data and usage estimates to provide actionable insights.
 */

import { Issue, InferencePoint, AnalysisResult } from '../analysis';

/**
 * Model pricing data (per 1M tokens)
 * Updated periodically to reflect current market prices
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI Models
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'o1': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 3.00, output: 12.00 },
  'o1-preview': { input: 15.00, output: 60.00 },
  'o3-mini': { input: 1.10, output: 4.40 },

  // Anthropic Models
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku': { input: 0.80, output: 4.00 },
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
  'claude-opus-4': { input: 15.00, output: 75.00 },

  // Google Models
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },

  // Meta Models (via providers)
  'llama-3.1-405b': { input: 3.00, output: 3.00 },
  'llama-3.1-70b': { input: 0.88, output: 0.88 },
  'llama-3.1-8b': { input: 0.18, output: 0.18 },

  // Mistral Models
  'mistral-large': { input: 2.00, output: 6.00 },
  'mistral-small': { input: 0.20, output: 0.60 },
  'mixtral-8x7b': { input: 0.45, output: 0.45 },
};

/**
 * Model recommendations based on use case
 */
export const MODEL_RECOMMENDATIONS: Record<string, string[]> = {
  'simple-classification': ['gpt-4o-mini', 'claude-3-5-haiku', 'gemini-2.0-flash'],
  'text-generation': ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'],
  'complex-reasoning': ['gpt-4o', 'claude-3-5-sonnet', 'o1-mini'],
  'code-generation': ['gpt-4o', 'claude-3-5-sonnet', 'claude-sonnet-4'],
  'data-extraction': ['gpt-4o-mini', 'claude-3-5-haiku', 'gemini-1.5-flash'],
};

/**
 * Issue type to typical savings mapping
 */
const SAVINGS_MULTIPLIERS: Record<string, number> = {
  cost: 1.0,
  latency: 0.3, // Latency improvements often translate to some cost savings
  throughput: 0.5, // Throughput improvements can reduce infrastructure costs
  reliability: 0.2, // Reliability improvements prevent retry costs
};

export interface ImpactSummary {
  estimatedMonthlySavings: number;
  estimatedMonthlyWaste: number;
  latencyIssueCount: number;
  reliabilityGapCount: number;
  topIssuesBySavings: IssueWithSavings[];
  categoryBreakdown: CategoryBreakdown;
}

export interface IssueWithSavings {
  issue: Issue;
  point: InferencePoint;
  estimatedMonthlySavings: number;
  savingsPercentage: number;
  currentModel?: string;
  recommendedModel?: string;
}

export interface CategoryBreakdown {
  cost: { count: number; totalSavings: number };
  latency: { count: number; totalSavings: number };
  throughput: { count: number; totalSavings: number };
  reliability: { count: number; totalSavings: number };
}

export interface SuggestedAction {
  title: string;
  description: string;
  type: 'analyze' | 'fix' | 'learn' | 'related';
  priority: 'high' | 'medium' | 'low';
  command?: string;
  args?: Record<string, unknown>;
}

/**
 * ImpactCalculator provides methods to estimate savings and prioritize issues
 */
export class ImpactCalculator {
  // Default assumptions for estimation
  private static readonly DEFAULT_MONTHLY_CALLS = 10000;
  private static readonly DEFAULT_AVG_INPUT_TOKENS = 500;
  private static readonly DEFAULT_AVG_OUTPUT_TOKENS = 200;

  /**
   * Calculate impact summary from analysis results
   */
  static calculateImpactSummary(results: AnalysisResult[]): ImpactSummary {
    const issuesWithSavings: IssueWithSavings[] = [];
    const categoryBreakdown: CategoryBreakdown = {
      cost: { count: 0, totalSavings: 0 },
      latency: { count: 0, totalSavings: 0 },
      throughput: { count: 0, totalSavings: 0 },
      reliability: { count: 0, totalSavings: 0 },
    };

    let latencyIssueCount = 0;
    let reliabilityGapCount = 0;

    for (const result of results) {
      for (const point of result.inferencePoints) {
        for (const issue of point.issues || []) {
          const savings = this.estimateSavingsForIssue(issue, point);
          issuesWithSavings.push(savings);

          // Update category breakdown
          const category = issue.type as keyof CategoryBreakdown;
          if (categoryBreakdown[category]) {
            categoryBreakdown[category].count++;
            categoryBreakdown[category].totalSavings += savings.estimatedMonthlySavings;
          }

          // Count specific issue types
          if (issue.type === 'latency') {
            latencyIssueCount++;
          } else if (issue.type === 'reliability') {
            reliabilityGapCount++;
          }
        }
      }
    }

    // Sort by savings (highest first)
    issuesWithSavings.sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);

    // Calculate totals
    const estimatedMonthlyWaste = issuesWithSavings.reduce(
      (sum, item) => sum + item.estimatedMonthlySavings,
      0
    );

    return {
      estimatedMonthlySavings: estimatedMonthlyWaste,
      estimatedMonthlyWaste,
      latencyIssueCount,
      reliabilityGapCount,
      topIssuesBySavings: issuesWithSavings.slice(0, 5),
      categoryBreakdown,
    };
  }

  /**
   * Estimate savings for a single issue
   */
  static estimateSavingsForIssue(issue: Issue, point: InferencePoint): IssueWithSavings {
    let estimatedMonthlySavings = 0;
    let savingsPercentage = 0;
    let recommendedModel: string | undefined;

    const currentModel = point.model?.toLowerCase() || '';

    // Check if this is a model-related cost issue
    if (issue.type === 'cost' && currentModel) {
      const currentPrice = this.getModelPrice(currentModel);
      recommendedModel = this.getRecommendedModel(currentModel, issue);
      const recommendedPrice = recommendedModel ? this.getModelPrice(recommendedModel) : null;

      if (currentPrice && recommendedPrice) {
        // Calculate monthly cost difference
        const monthlyInputTokens = this.DEFAULT_MONTHLY_CALLS * this.DEFAULT_AVG_INPUT_TOKENS;
        const monthlyOutputTokens = this.DEFAULT_MONTHLY_CALLS * this.DEFAULT_AVG_OUTPUT_TOKENS;

        const currentMonthlyCost =
          (monthlyInputTokens / 1_000_000) * currentPrice.input +
          (monthlyOutputTokens / 1_000_000) * currentPrice.output;

        const recommendedMonthlyCost =
          (monthlyInputTokens / 1_000_000) * recommendedPrice.input +
          (monthlyOutputTokens / 1_000_000) * recommendedPrice.output;

        estimatedMonthlySavings = Math.max(0, currentMonthlyCost - recommendedMonthlyCost);
        savingsPercentage =
          currentMonthlyCost > 0
            ? ((currentMonthlyCost - recommendedMonthlyCost) / currentMonthlyCost) * 100
            : 0;
      }
    } else {
      // For non-cost issues, apply a multiplier based on issue type and severity
      const baseEstimate = this.getBaseEstimateFromSeverity(issue.severity);
      const multiplier = SAVINGS_MULTIPLIERS[issue.type] || 0.1;
      estimatedMonthlySavings = baseEstimate * multiplier;
      savingsPercentage = multiplier * 100;
    }

    return {
      issue,
      point,
      estimatedMonthlySavings: Math.round(estimatedMonthlySavings * 100) / 100,
      savingsPercentage: Math.round(savingsPercentage * 10) / 10,
      currentModel: point.model,
      recommendedModel,
    };
  }

  /**
   * Get model pricing (normalized model name)
   */
  private static getModelPrice(model: string): { input: number; output: number } | null {
    const normalizedModel = this.normalizeModelName(model);
    return MODEL_PRICING[normalizedModel] || null;
  }

  /**
   * Normalize model name for lookup
   */
  private static normalizeModelName(model: string): string {
    const normalized = model.toLowerCase().trim();

    // Handle versioned model names
    if (normalized.includes('gpt-4o-mini')) return 'gpt-4o-mini';
    if (normalized.includes('gpt-4o')) return 'gpt-4o';
    if (normalized.includes('gpt-4-turbo')) return 'gpt-4-turbo';
    if (normalized.includes('gpt-4')) return 'gpt-4';
    if (normalized.includes('gpt-3.5')) return 'gpt-3.5-turbo';

    if (normalized.includes('claude-3-5-sonnet') || normalized.includes('claude-3.5-sonnet'))
      return 'claude-3-5-sonnet';
    if (normalized.includes('claude-3-5-haiku') || normalized.includes('claude-3.5-haiku'))
      return 'claude-3-5-haiku';
    if (normalized.includes('claude-3-opus')) return 'claude-3-opus';
    if (normalized.includes('claude-3-sonnet')) return 'claude-3-sonnet';
    if (normalized.includes('claude-3-haiku')) return 'claude-3-haiku';
    if (normalized.includes('claude-sonnet-4')) return 'claude-sonnet-4';
    if (normalized.includes('claude-opus-4')) return 'claude-opus-4';

    if (normalized.includes('gemini-2')) return 'gemini-2.0-flash';
    if (normalized.includes('gemini-1.5-pro')) return 'gemini-1.5-pro';
    if (normalized.includes('gemini-1.5-flash') || normalized.includes('gemini-flash'))
      return 'gemini-1.5-flash';

    return normalized;
  }

  /**
   * Get recommended model based on current model and issue
   */
  private static getRecommendedModel(currentModel: string, issue: Issue): string | undefined {
    const normalizedCurrent = this.normalizeModelName(currentModel);

    // Map expensive models to cheaper alternatives
    const recommendations: Record<string, string> = {
      'gpt-4': 'gpt-4o-mini',
      'gpt-4-turbo': 'gpt-4o-mini',
      'gpt-4o': 'gpt-4o-mini',
      'claude-3-opus': 'claude-3-5-haiku',
      'claude-opus-4': 'claude-3-5-haiku',
      'claude-3-5-sonnet': 'claude-3-5-haiku',
      'claude-sonnet-4': 'claude-3-5-haiku',
      'gemini-1.5-pro': 'gemini-1.5-flash',
      'o1': 'o1-mini',
      'o1-preview': 'o1-mini',
    };

    // Check issue description for hints about recommended model
    if (issue.fix) {
      const fixLower = issue.fix.toLowerCase();
      for (const model of Object.keys(MODEL_PRICING)) {
        if (fixLower.includes(model)) {
          return model;
        }
      }
    }

    return recommendations[normalizedCurrent];
  }

  /**
   * Get base estimate from severity level
   */
  private static getBaseEstimateFromSeverity(severity: string): number {
    switch (severity) {
      case 'critical':
        return 200;
      case 'high':
        return 100;
      case 'medium':
        return 50;
      case 'low':
        return 20;
      default:
        return 10;
    }
  }

  /**
   * Generate suggested actions based on analysis results
   */
  static generateSuggestedActions(results: AnalysisResult[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    const impactSummary = this.calculateImpactSummary(results);

    // If there are high-savings issues, suggest fixing them first
    if (impactSummary.topIssuesBySavings.length > 0) {
      const topIssue = impactSummary.topIssuesBySavings[0];
      if (topIssue.estimatedMonthlySavings > 50) {
        actions.push({
          title: `Fix top issue in ${topIssue.point.file.split('/').pop()}`,
          description: `Potential savings: $${topIssue.estimatedMonthlySavings.toFixed(0)}/month`,
          type: 'fix',
          priority: 'high',
        });
      }
    }

    // Check for reliability issues that need attention
    if (impactSummary.reliabilityGapCount > 0) {
      actions.push({
        title: `Review ${impactSummary.reliabilityGapCount} reliability gap(s)`,
        description: 'Missing retry logic or error handling detected',
        type: 'fix',
        priority: 'high',
      });
    }

    // Check for latency issues
    if (impactSummary.latencyIssueCount > 0) {
      actions.push({
        title: `Optimize ${impactSummary.latencyIssueCount} latency issue(s)`,
        description: 'Consider streaming or batching to reduce latency',
        type: 'fix',
        priority: 'medium',
      });
    }

    // Suggest analyzing related files
    const analyzedFiles = new Set(results.map((r) => r.file));
    if (analyzedFiles.size === 1) {
      actions.push({
        title: 'Analyze entire workspace',
        description: 'Find issues across all files with LLM code',
        type: 'analyze',
        priority: 'medium',
        command: 'peakinfer.analyzeWorkspace',
      });
    }

    // Learning resources
    if (impactSummary.estimatedMonthlyWaste > 100) {
      actions.push({
        title: 'Learn about model selection',
        description: 'Best practices for choosing the right model',
        type: 'learn',
        priority: 'low',
      });
    }

    return actions;
  }

  /**
   * Format currency for display
   */
  static formatCurrency(amount: number): string {
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}k`;
    }
    return `$${amount.toFixed(0)}`;
  }

  /**
   * Format percentage for display
   */
  static formatPercentage(value: number): string {
    if (value >= 100) {
      return `${Math.round(value / 10) * 10}%`;
    }
    return `${Math.round(value)}%`;
  }

  /**
   * Get comparison data for two models
   */
  static getModelComparison(
    currentModel: string,
    recommendedModel: string
  ): { current: { input: number; output: number }; recommended: { input: number; output: number }; savingsMultiplier: number } | null {
    const currentPrice = this.getModelPrice(currentModel);
    const recommendedPrice = this.getModelPrice(recommendedModel);

    if (!currentPrice || !recommendedPrice) {
      return null;
    }

    const currentAvg = (currentPrice.input + currentPrice.output) / 2;
    const recommendedAvg = (recommendedPrice.input + recommendedPrice.output) / 2;
    const savingsMultiplier = currentAvg / recommendedAvg;

    return {
      current: currentPrice,
      recommended: recommendedPrice,
      savingsMultiplier,
    };
  }
}
