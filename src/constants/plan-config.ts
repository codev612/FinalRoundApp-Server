/**
 * Plan Configuration
 * 
 * Defines pricing, limits, and entitlements for each subscription tier.
 * 
 * Pricing: Monthly subscription prices (USD)
 * Limits: Monthly usage limits per plan
 * 
 * Cost Considerations:
 * - Deepgram: $0.0077 per minute
 * - OpenAI: Varies by model (see api-pricing.ts)
 * - Target: Keep API costs at ~60-70% of subscription revenue
 * 
 * Use plan-cost-calculator.ts to analyze and adjust limits based on costs.
 * 
 * Last updated: February 2026
 */

export type PlanTier = 'free' | 'pro' | 'pro_plus';

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  price: number; // Monthly price in USD
  transcriptionMinutesPerMonth: number;
  aiTokensPerMonth: number;
  aiRequestsPerMonth: number;
  aiTokensPerMonthByModel: Record<string, number>;
  canUseSummary: boolean;
  allowedModels: string[];
  rateLimits: {
    maxPerMinute: number;
    maxConcurrent: number;
  };
}

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  free: {
    tier: 'free',
    name: 'Free',
    price: 0,
    // Free tier: Minimal limits to encourage upgrades
    // Estimated cost: ~$0.50/month per user
    transcriptionMinutesPerMonth: 65, // ~$0.50 Deepgram cost
    aiTokensPerMonth: 50_000, // ~$0.04 OpenAI cost (gpt-4.1-mini)
    aiRequestsPerMonth: 200,
    aiTokensPerMonthByModel: {
      'gpt-4.1-mini': 40_000,
      'gpt-4.1': 10_000,
      'gpt-4o-mini': 10_000,
    },
    canUseSummary: false,
    allowedModels: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
    rateLimits: {
      maxPerMinute: 10,
      maxConcurrent: 1,
    },
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    price: 20, // $10/month
    // Adjusted limits: ~$6.50 API cost (65% of $10)
    // Deepgram: ~$2.60 (340 min), OpenAI: ~$3.90 (650K tokens avg)
    transcriptionMinutesPerMonth: 600, // ~$2.62 Deepgram cost
    aiTokensPerMonth: 1_300_000, // ~$3.90 OpenAI cost (avg model mix)
    aiRequestsPerMonth: 3_000, // Adjusted proportionally
    aiTokensPerMonthByModel: {
      // Adjusted to fit within ~$3.90 OpenAI budget (650K tokens total)
      'gpt-5': 300_000,    // ~$1.18
      'gpt-5.1': 160_000,   // ~$0.63
      'gpt-4.1': 100_000,  // ~$0.50
      'gpt-4.1-mini': 400_000, // ~$0.15
      'gpt-4o': 120_000,    // ~$0.30
      'gpt-4o-mini': 120_000, // ~$0.09
      // Total: ~650K tokens
    },
    canUseSummary: true,
    allowedModels: ['gpt-5', 'gpt-5.1', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
    rateLimits: {
      maxPerMinute: 30,
      maxConcurrent: 2,
    },
  },
  pro_plus: {
    tier: 'pro_plus',
    name: 'Pro+',
    price: 50, // $50/month
    // Adjusted limits: ~$32.50 API cost (65% of $50)
    // Deepgram: ~$13 (1,690 min), OpenAI: ~$19.50 (2.6M tokens avg)
    transcriptionMinutesPerMonth: 1_700, // ~$13.01 Deepgram cost
    aiTokensPerMonth: 3_000_000, // ~$19.50 OpenAI cost (avg model mix)
    aiRequestsPerMonth: 15_000, // Adjusted proportionally
    aiTokensPerMonthByModel: {
      // Adjusted to fit within ~$19.50 OpenAI budget (2.6M tokens total)
      'gpt-5.2': 500_000,  // ~$3.94
      'gpt-5': 1_000_000,    // ~$4.73
      'gpt-5.1': 400_000,  // ~$3.15
      'gpt-4.1': 400_000,  // ~$2.00
      'gpt-4.1-mini': 800_000, // ~$0.38
      'gpt-4o': 200_000,   // ~$0.50
      'gpt-4o-mini': 200_000, // ~$0.15
      // Total: ~3.0M tokens
    },
    canUseSummary: true,
    allowedModels: ['gpt-5.2', 'gpt-5', 'gpt-5.1', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
    rateLimits: {
      maxPerMinute: 60,
      maxConcurrent: 3,
    },
  },
};

/**
 * Get plan configuration by tier
 */
export function getPlanConfig(tier: PlanTier): PlanConfig {
  return PLAN_CONFIGS[tier] || PLAN_CONFIGS.free;
}

/**
 * Normalize plan name to PlanTier
 */
export function normalizePlan(p: any): PlanTier {
  if (p === 'pro' || p === 'pro_plus') return p;
  // Backward/alternate naming
  if (p === 'business' || p === 'proplus' || p === 'pro+') return 'pro_plus';
  return 'free';
}
