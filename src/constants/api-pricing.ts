/**
 * API Pricing Configuration
 * 
 * Update these values when pricing changes.
 * Prices are per 1 million (1M) tokens for OpenAI, per minute for Deepgram.
 * 
 * Last updated: February 2026
 * 
 * OpenAI Pricing Source: https://openai.com/pricing
 * Deepgram Pricing Source: https://deepgram.com/pricing
 */

// OpenAI pricing per 1M tokens (input/output)
export const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.2': { input: 1.75, output: 14.00 },
  'gpt-5.1': { input: 1.75, output: 14.00 },
  'gpt-5': { input: 1.75, output: 14.00 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'o4-mini': { input: 1.10, output: 4.40 },
};

// Deepgram pricing per minute(streaming transcription)
export const DEEPGRAM_PRICE_PER_MINUTE = 0.0077;

// Default model to use for cost calculation if model is unknown
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
