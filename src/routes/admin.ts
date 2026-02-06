import express, { Request, Response } from 'express';
import { authenticate, AuthRequest } from '../auth.js';
import {
  getAllUsers,
  getUserByIdFull,
  updateUserPlan,
  setUserAdmin,
  getSystemStats,
  getAdminApiUsageStats,
} from '../database.js';
import {
  OPENAI_PRICING,
  DEEPGRAM_PRICE_PER_MINUTE,
  DEFAULT_OPENAI_MODEL,
} from '../constants/api-pricing.js';

const router = express.Router();

// Admin authentication middleware
const requireAdmin = async (req: AuthRequest, res: Response, next: express.NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const user = await getUserByIdFull(req.user.userId);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to verify admin status' });
  }
};

// Apply authentication and admin check to all routes
router.use(authenticate);
router.use(requireAdmin);

// Get system statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getSystemStats();
    return res.json(stats);
  } catch (error: any) {
    console.error('Error fetching system stats:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch system stats' });
  }
});

// Get all users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
    const result = await getAllUsers(limit, skip);
    return res.json(result);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

// Get user by ID
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const user = await getUserByIdFull(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Remove sensitive data
    const { password_hash, ...safeUser } = user as any;
    return res.json(safeUser);
  } catch (error: any) {
    console.error('Error fetching user:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch user' });
  }
});

// Update user plan
router.put('/users/:id/plan', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { plan } = req.body;
    
    if (!plan || !['free', 'pro', 'pro_plus'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be free, pro, or pro_plus' });
    }
    
    const success = await updateUserPlan(userId, plan);
    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    return res.json({ success: true, plan });
  } catch (error: any) {
    console.error('Error updating user plan:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user plan' });
  }
});

// Set user admin status
router.put('/users/:id/admin', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { is_admin } = req.body;
    
    if (typeof is_admin !== 'boolean') {
      return res.status(400).json({ error: 'is_admin must be a boolean' });
    }
    
    const success = await setUserAdmin(userId, is_admin);
    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    return res.json({ success: true, is_admin });
  } catch (error: any) {
    console.error('Error updating user admin status:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user admin status' });
  }
});

function calculateOpenAICost(promptTokens: number, completionTokens: number, model: string): number {
  const pricing = OPENAI_PRICING[model] || OPENAI_PRICING[DEFAULT_OPENAI_MODEL];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

function calculateDeepgramCost(totalMinutes: number): number {
  return totalMinutes * DEEPGRAM_PRICE_PER_MINUTE;
}

// Get API usage statistics (OpenAI + Deepgram)
router.get('/api-usage', async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    
    const stats = await getAdminApiUsageStats(startDate, endDate);
    
    // Calculate costs using actual prompt/completion tokens per model
    let totalCost = 0;
    const costsByModel: Record<string, number> = {};
    
    if (stats.openai && stats.openai.byModel) {
      for (const [model, modelStats] of Object.entries(stats.openai.byModel)) {
        const promptTokens = modelStats.promptTokens || 0;
        const completionTokens = modelStats.completionTokens || 0;
        
        const modelCost = calculateOpenAICost(promptTokens, completionTokens, model);
        costsByModel[model] = modelCost;
        totalCost += modelCost;
      }
    }
    
    // Calculate Deepgram costs
    const deepgramCost = calculateDeepgramCost(stats.deepgram.totalMinutes || 0);
    
    return res.json({
      ...stats,
      costs: {
        openai: {
          total: totalCost,
          byModel: costsByModel,
        },
        deepgram: {
          total: deepgramCost,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching API usage stats:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch API usage stats' });
  }
});

export default router;
