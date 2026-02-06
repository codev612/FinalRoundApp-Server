/**
 * Plan Cost Calculator
 * 
 * Calculates estimated API costs for plan limits to ensure profitability.
 * Helps determine appropriate plan limits based on subscription price and API costs.
 * 
 * Assumptions:
 * - Target cost ratio: Keep API costs at ~60-70% of subscription revenue
 * - Average token usage: 70% prompt, 30% completion
 * - Model mix: Weighted average based on allowed models
 */

import { OPENAI_PRICING, DEEPGRAM_PRICE_PER_MINUTE, DEFAULT_OPENAI_MODEL } from './api-pricing.js';
import { PLAN_CONFIGS, type PlanConfig } from './plan-config.js';

/**
 * Calculate average cost per 1K tokens for a set of models
 */
function calculateAverageTokenCost(models: string[]): number {
  if (models.length === 0) return 0;
  
  // Weighted average (assuming equal usage distribution)
  let totalCost = 0;
  for (const model of models) {
    const pricing = OPENAI_PRICING[model] || OPENAI_PRICING[DEFAULT_OPENAI_MODEL];
    // Average of input (70%) and output (30%) weighted cost per 1K tokens
    const avgCostPer1K = ((pricing.input * 0.7) + (pricing.output * 0.3)) / 1000;
    totalCost += avgCostPer1K;
  }
  return totalCost / models.length;
}

/**
 * Calculate estimated monthly API costs for a plan at full usage
 */
export function calculatePlanCosts(config: PlanConfig): {
  deepgramCost: number;
  openaiCost: number;
  totalCost: number;
  costRatio: number; // Cost as percentage of subscription price
} {
  // Deepgram cost
  const deepgramCost = config.transcriptionMinutesPerMonth * DEEPGRAM_PRICE_PER_MINUTE;
  
  // OpenAI cost (using average model cost)
  const avgTokenCost = calculateAverageTokenCost(config.allowedModels);
  const openaiCost = (config.aiTokensPerMonth / 1000) * avgTokenCost;
  
  const totalCost = deepgramCost + openaiCost;
  const costRatio = config.price > 0 ? (totalCost / config.price) * 100 : 0;
  
  return {
    deepgramCost,
    openaiCost,
    totalCost,
    costRatio,
  };
}

/**
 * Suggest plan limits based on target cost ratio
 */
export function suggestPlanLimits(
  subscriptionPrice: number,
  targetCostRatio: number = 65, // Target: 65% of revenue goes to API costs
  preferredMinutes?: number,
  preferredTokens?: number
): {
  transcriptionMinutes: number;
  aiTokens: number;
  estimatedCost: number;
} {
  const maxCost = subscriptionPrice * (targetCostRatio / 100);
  
  // Allocate 40% to Deepgram, 60% to OpenAI (adjustable)
  const deepgramBudget = maxCost * 0.4;
  const openaiBudget = maxCost * 0.6;
  
  // Calculate limits
  const transcriptionMinutes = preferredMinutes || Math.floor(deepgramBudget / DEEPGRAM_PRICE_PER_MINUTE);
  
  // Estimate tokens based on average cost (using gpt-4.1-mini as baseline for conservative estimate)
  const avgTokenCostPer1K = (OPENAI_PRICING['gpt-4.1-mini'].input * 0.7 + OPENAI_PRICING['gpt-4.1-mini'].output * 0.3) / 1000;
  const aiTokens = preferredTokens || Math.floor((openaiBudget / avgTokenCostPer1K) * 1000);
  
  const estimatedCost = (transcriptionMinutes * DEEPGRAM_PRICE_PER_MINUTE) + 
                        ((aiTokens / 1000) * avgTokenCostPer1K);
  
  return {
    transcriptionMinutes,
    aiTokens,
    estimatedCost,
  };
}

/**
 * Print cost analysis for all plans
 */
export function printPlanCostAnalysis(): void {
  console.log('\n=== Plan Cost Analysis ===\n');
  
  for (const [tier, config] of Object.entries(PLAN_CONFIGS)) {
    const costs = calculatePlanCosts(config);
    console.log(`${config.name} ($${config.price}/month):`);
    console.log(`  Deepgram: $${costs.deepgramCost.toFixed(4)}`);
    console.log(`  OpenAI: $${costs.openaiCost.toFixed(4)}`);
    console.log(`  Total Cost: $${costs.totalCost.toFixed(4)}`);
    console.log(`  Cost Ratio: ${costs.costRatio.toFixed(1)}%`);
    console.log(`  Profit Margin: $${(config.price - costs.totalCost).toFixed(4)}`);
    console.log('');
  }
}
