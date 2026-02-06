/**
 * Plan Cost Analysis Script
 * 
 * Run with: npm run analyze-costs
 * 
 * Analyzes plan costs and suggests optimal limits based on:
 * - Subscription pricing
 * - API costs (OpenAI + Deepgram)
 * - Target profit margins
 */

import { PLAN_CONFIGS } from '../constants/plan-config.js';
import { OPENAI_PRICING, DEEPGRAM_PRICE_PER_MINUTE, DEFAULT_OPENAI_MODEL } from '../constants/api-pricing.js';

function calculateAverageTokenCost(models: string[]): number {
  if (models.length === 0) return 0;
  let totalCost = 0;
  for (const model of models) {
    const pricing = OPENAI_PRICING[model] || OPENAI_PRICING[DEFAULT_OPENAI_MODEL];
    // Average: 70% prompt tokens, 30% completion tokens
    const avgCostPer1K = ((pricing.input * 0.7) + (pricing.output * 0.3)) / 1000;
    totalCost += avgCostPer1K;
  }
  return totalCost / models.length;
}

function calculatePlanCosts(config: typeof PLAN_CONFIGS.pro) {
  const deepgramCost = config.transcriptionMinutesPerMonth * DEEPGRAM_PRICE_PER_MINUTE;
  const avgTokenCost = calculateAverageTokenCost(config.allowedModels);
  const openaiCost = (config.aiTokensPerMonth / 1000) * avgTokenCost;
  const totalCost = deepgramCost + openaiCost;
  const costRatio = config.price > 0 ? (totalCost / config.price) * 100 : 0;
  const profitMargin = config.price - totalCost;
  
  return { deepgramCost, openaiCost, totalCost, costRatio, profitMargin };
}

console.log('\n=== Plan Cost Analysis ===\n');

for (const [tier, config] of Object.entries(PLAN_CONFIGS)) {
  const costs = calculatePlanCosts(config as typeof PLAN_CONFIGS.pro);
  
  console.log(`${config.name} Plan ($${config.price}/month):`);
  console.log(`  Limits:`);
  console.log(`    Transcription: ${config.transcriptionMinutesPerMonth.toLocaleString()} min/month`);
  console.log(`    AI Tokens: ${config.aiTokensPerMonth.toLocaleString()}/month`);
  console.log(`    AI Requests: ${config.aiRequestsPerMonth.toLocaleString()}/month`);
  console.log(`  Costs:`);
  console.log(`    Deepgram: $${costs.deepgramCost.toFixed(4)}`);
  console.log(`    OpenAI: $${costs.openaiCost.toFixed(4)}`);
  console.log(`    Total API Cost: $${costs.totalCost.toFixed(4)}`);
  console.log(`  Financials:`);
  console.log(`    Cost Ratio: ${costs.costRatio.toFixed(1)}% of revenue`);
  console.log(`    Profit Margin: $${costs.profitMargin.toFixed(4)} (${((costs.profitMargin / config.price) * 100).toFixed(1)}%)`);
  console.log('');
}

console.log('=== Recommendations ===');
console.log('Target: Keep API costs at 60-70% of subscription revenue');
console.log('This leaves 30-40% for infrastructure, support, and profit.\n');
