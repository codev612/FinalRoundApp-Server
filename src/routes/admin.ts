import express, { Request, Response } from 'express';
import { authenticate, AuthRequest } from '../auth.js';
import {
  getAllUsers,
  getUserByIdFull,
  updateUserPlan,
  setUserAdmin,
  getSystemStats,
  getAdminApiUsageStats,
  getActiveSystemNotification,
  setSystemNotification,
  clearSystemNotification,
  getAllNotifications,
  deleteNotification,
  updateNotificationStatus,
  updateNotificationMessage,
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

// ----- System notification management -----

// Get current active notification (if any)
router.get('/notification', async (_req: Request, res: Response) => {
  try {
    const notif = await getActiveSystemNotification();
    return res.json({
      notification: notif
        ? {
            id: notif._id?.toString(),
            message: notif.message,
            createdAt: notif.createdAt,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Error fetching system notification:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch notification' });
  }
});

// Set or clear the active notification
router.post('/notification', async (req: Request, res: Response) => {
  try {
    const { message, buttonLabel, buttonUrl } = req.body;
    if (typeof message !== 'string') {
      return res.status(400).json({ error: 'message must be a string' });
    }

    const trimmed = message.trim();
    if (!trimmed) {
      await clearSystemNotification();
      return res.json({ success: true, notification: null });
    }

    const notif = await setSystemNotification(
      trimmed,
      typeof buttonLabel === 'string' ? buttonLabel : undefined,
      typeof buttonUrl === 'string' ? buttonUrl : undefined
    );
    return res.json({
      success: true,
      notification: {
        id: notif._id?.toString(),
        message: notif.message,
        createdAt: notif.createdAt,
        buttonLabel: notif.buttonLabel,
        buttonUrl: notif.buttonUrl,
      },
    });
  } catch (error: any) {
    console.error('Error setting system notification:', error);
    return res.status(500).json({ error: error.message || 'Failed to set notification' });
  }
});

// Get all notifications (for management page)
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const notifications = await getAllNotifications(limit);
    return res.json({
      notifications: notifications.map(n => ({
        id: n._id?.toString(),
        message: n.message,
        createdAt: n.createdAt,
        isActive: n.isActive,
        buttonLabel: n.buttonLabel,
        buttonUrl: n.buttonUrl,
        readCount: Array.isArray(n.readBy) ? n.readBy.length : 0,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
  }
});

// Delete a notification
router.delete('/notifications/:id', async (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;
    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }
    const deleted = await deleteNotification(notificationId);
    if (!deleted) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete notification' });
  }
});

// Update notification status (active/inactive)
router.patch('/notifications/:id/status', async (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;
    const { isActive } = req.body;
    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }
    const updated = await updateNotificationStatus(notificationId, isActive);
    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating notification status:', error);
    return res.status(500).json({ error: error.message || 'Failed to update notification status' });
  }
});

// Update notification message text
router.patch('/notifications/:id', async (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;
    const { message, buttonLabel, buttonUrl } = req.body;
    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }
    if (typeof message !== 'string') {
      return res.status(400).json({ error: 'message must be a string' });
    }
    const trimmed = message.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'message cannot be empty' });
    }
    const updated = await updateNotificationMessage(
      notificationId,
      trimmed,
      typeof buttonLabel === 'string' ? buttonLabel : undefined,
      typeof buttonUrl === 'string' ? buttonUrl : undefined
    );
    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating notification message:', error);
    return res.status(500).json({ error: error.message || 'Failed to update notification message' });
  }
});

export default router;
