import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../auth.js';
import {
  getPayPalSubscription,
  verifyPayPalWebhookSignature,
  createPayPalOrder,
  capturePayPalOrder,
  cancelPayPalSubscription,
  getLastSubscriptionCaptureId,
  refundPayPalCapture,
} from '../paypal.js';
import {
  setUserPayPalSubscription,
  updatePayPalSubscriptionStatusBySubscriptionId,
  getUserByIdFull,
  scheduleCancelAtPeriodEnd,
  getUsersWithScheduledCancellations,
  getUserByPayPalSubscriptionId,
} from '../database.js';

const router = express.Router();

const planIdsFromEnv = () => ({
  pro: String(process.env.PAYPAL_PLAN_ID_PRO || '').trim(),
  pro_plus: String(process.env.PAYPAL_PLAN_ID_PRO_PLUS || '').trim(),
});

const mapPlanIdToTier = (planId: string): 'pro' | 'pro_plus' | null => {
  const ids = planIdsFromEnv();
  const p = String(planId || '').trim();
  if (p && ids.pro && p === ids.pro) return 'pro';
  if (p && ids.pro_plus && p === ids.pro_plus) return 'pro_plus';
  return null;
};

router.get('/config', authenticate, async (_req: AuthRequest, res: Response) => {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const mode = String(process.env.PAYPAL_MODE || 'sandbox').trim().toLowerCase();
  const planIds = planIdsFromEnv();
  const enabled = !!(clientId && planIds.pro && planIds.pro_plus);
  return res.json({ enabled, clientId, mode, planIds });
});

/** Webhook test endpoint - logs webhook info without processing (for debugging) */
router.post('/webhook-test', async (req, res: Response) => {
  console.log('\n=== PayPal Webhook Test (No Processing) ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.url}`);
  console.log(`Headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`Body:`, JSON.stringify(req.body, null, 2));
  console.log('==========================================\n');
  return res.json({ 
    received: true, 
    timestamp: new Date().toISOString(),
    eventType: req.body?.event_type || 'N/A',
    subscriptionId: req.body?.resource?.id || 'N/A',
  });
});

/** Create order (Orders v2) for one-time checkout. Body: { cart?: [{ amount?, currency_code? }] } */
router.post('/orders', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const cart = (req.body as any)?.cart;
    const jsonResponse = await createPayPalOrder(Array.isArray(cart) ? cart : undefined);
    return res.status(201).json(jsonResponse);
  } catch (error: any) {
    console.error('Failed to create order:', error);
    return res.status(500).json({ error: error?.message || 'Failed to create order.' });
  }
});

/** Capture order (Orders v2) after buyer approval. */
router.post('/orders/:orderID/capture', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const orderID = req.params.orderID;
    const jsonResponse = await capturePayPalOrder(orderID);
    return res.json(jsonResponse);
  } catch (error: any) {
    console.error('Failed to capture order:', error);
    return res.status(500).json({ error: error?.message || 'Failed to capture order.' });
  }
});

router.post('/attach-subscription', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const subscriptionId = String((req.body as any)?.subscriptionId || '').trim();
    if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });

    const sub = await getPayPalSubscription(subscriptionId);
    const status = String(sub.status || '').toUpperCase();
    if (status !== 'ACTIVE') {
      return res.status(400).json({ error: `Subscription is not active yet (status=${status || 'unknown'})` });
    }
    const planId = String(sub.plan_id || '').trim();
    const tier = mapPlanIdToTier(planId);
    if (!tier) return res.status(400).json({ error: 'Unknown PayPal plan_id for this server' });

    await setUserPayPalSubscription(userId, {
      subscriptionId,
      planId,
      status,
      plan: tier,
      subscriberEmail: String(sub?.subscriber?.email_address || '').trim() || null,
      nextBillingTime: String(sub?.billing_info?.next_billing_time || '').trim() || null,
    });

    return res.json({
      message: 'Subscription attached successfully.',
      plan: tier,
      subscriptionId,
      status,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to attach subscription' });
  }
});

/** Cancel the user's current PayPal subscription. */
router.post('/cancel-subscription', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await getUserByIdFull(userId);
    const subscriptionId = user?.paypal?.subscriptionId;
    
    if (!subscriptionId) {
      return res.status(400).json({ error: 'No active PayPal subscription found.' });
    }

    const cancelAtPeriodEnd = Boolean((req.body as any)?.cancelAtPeriodEnd);
    const reason = String((req.body as any)?.reason || 'User requested cancellation').trim();
    const isDowngrade = Boolean((req.body as any)?.isDowngrade);
    const isUpgrade = Boolean((req.body as any)?.isUpgrade);
    const isPlanChange = isDowngrade || isUpgrade;
    const shouldRefund = isPlanChange && !cancelAtPeriodEnd; // Refund only for immediate plan changes (upgrade/downgrade)

    if (cancelAtPeriodEnd) {
      // Schedule cancellation at end of billing period
      const { scheduleCancelAtPeriodEnd } = await import('../database.js');
      await scheduleCancelAtPeriodEnd(userId, subscriptionId);
      
      return res.json({
        message: 'Subscription will be cancelled at the end of your current billing period. You will continue to have access until then.',
        subscriptionId,
        cancelAtPeriodEnd: true,
      });
    } else {
      // Cancel immediately
      let refundResult = null;
      
      // If this is a plan change (upgrade/downgrade), try to refund the last payment
      if (shouldRefund) {
        try {
          const captureId = await getLastSubscriptionCaptureId(subscriptionId);
          if (captureId) {
            refundResult = await refundPayPalCapture(
              captureId,
              undefined,
              isDowngrade
                ? 'Refund for subscription downgrade'
                : isUpgrade
                  ? 'Refund for subscription upgrade (plan change)'
                  : 'Refund for subscription plan change'
            );
            console.log(`Refunded capture ${captureId} for subscription ${subscriptionId} (plan change)`);
          } else {
            console.warn(`Could not find capture_id for subscription ${subscriptionId} to refund`);
          }
        } catch (refundError: any) {
          console.error(`Failed to refund subscription ${subscriptionId}:`, refundError);
          // Continue with cancellation even if refund fails
        }
      }
      
      await cancelPayPalSubscription(subscriptionId, reason);
      
      // Update user's plan to free immediately (PayPal webhook will also update when cancellation is confirmed)
      await updatePayPalSubscriptionStatusBySubscriptionId(subscriptionId, 'CANCELLED', 'free', null);

      return res.json({
        message: 'Subscription cancelled successfully. Your plan has been changed to Free.' + (refundResult ? ' A refund has been processed.' : ''),
        subscriptionId,
        cancelAtPeriodEnd: false,
        refunded: refundResult ? true : false,
      });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to cancel subscription' });
  }
});

// PayPal webhook (no auth). Requires PAYPAL_WEBHOOK_ID.
router.post('/webhook', async (req, res: Response) => {
  const webhookId = req.body?.id || 'unknown';
  const eventType = String((req.body as any)?.event_type || '');
  
  // Log incoming webhook for debugging
  console.log('\n=== PayPal Webhook Received ===');
  console.log(`Webhook ID: ${webhookId}`);
  console.log(`Event Type: ${eventType}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Headers:`, {
    'paypal-transmission-id': req.header('paypal-transmission-id'),
    'paypal-transmission-time': req.header('paypal-transmission-time'),
    'paypal-auth-algo': req.header('paypal-auth-algo'),
  });
  console.log(`Full Body:`, JSON.stringify(req.body, null, 2));
  console.log('==============================\n');

  try {
    const transmissionId = String(req.header('paypal-transmission-id') || '');
    const transmissionTime = String(req.header('paypal-transmission-time') || '');
    const transmissionSig = String(req.header('paypal-transmission-sig') || '');
    const certUrl = String(req.header('paypal-cert-url') || '');
    const authAlgo = String(req.header('paypal-auth-algo') || '');

    console.log(`[Webhook ${webhookId}] Verifying signature...`);
    const ok = await verifyPayPalWebhookSignature({
      transmissionId,
      transmissionTime,
      transmissionSig,
      certUrl,
      authAlgo,
      webhookEvent: req.body,
    });
    
    if (!ok) {
      console.error(`[Webhook ${webhookId}] ❌ Invalid webhook signature`);
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    console.log(`[Webhook ${webhookId}] ✓ Signature verified`);

    const resource = (req.body as any)?.resource || {};
    const subscriptionId = String(resource?.id || '').trim();
    const status = String(resource?.status || '').trim();
    const planId = String(resource?.plan_id || '').trim();
    const tier = mapPlanIdToTier(planId);
    const nextBillingTime = String(resource?.billing_info?.next_billing_time || '').trim() || null;

    console.log(`[Webhook ${webhookId}] Processing event:`, {
      eventType,
      subscriptionId: subscriptionId || 'N/A',
      status: status || 'N/A',
      planId: planId || 'N/A',
      tier: tier || 'N/A',
      nextBillingTime: nextBillingTime || 'N/A',
    });

    if (subscriptionId) {
      // Check if this subscription was scheduled for cancellation at period end
      const user = await getUserByPayPalSubscriptionId(subscriptionId);
      const cancelAtPeriodEnd = user?.paypal?.cancelAtPeriodEnd === true;
      
      console.log(`[Webhook ${webhookId}] User found:`, {
        userId: user?._id?.toString() || 'N/A',
        currentPlan: user?.plan || 'N/A',
        cancelAtPeriodEnd: cancelAtPeriodEnd,
      });
      
      // If scheduled for cancellation and we get a billing cycle completion event, cancel now
      if (cancelAtPeriodEnd && eventType.includes('BILLING.SUBSCRIPTION.CYCLE.COMPLETED')) {
        console.log(`[Webhook ${webhookId}] ⚠ Scheduled cancellation detected, cancelling subscription now...`);
        try {
          await cancelPayPalSubscription(subscriptionId, 'Scheduled cancellation at end of billing period');
          console.log(`[Webhook ${webhookId}] ✓ Subscription cancelled successfully`);
          // Status will be updated by subsequent CANCELLED event
        } catch (err: any) {
          console.error(`[Webhook ${webhookId}] ❌ Failed to cancel scheduled subscription:`, err);
        }
      }
      
      // Handle cancellation events
      if (eventType.includes('BILLING.SUBSCRIPTION.CANCELLED') || eventType.includes('BILLING.SUBSCRIPTION.EXPIRED') || eventType.includes('BILLING.SUBSCRIPTION.SUSPENDED')) {
        console.log(`[Webhook ${webhookId}] Processing cancellation event...`);
        await updatePayPalSubscriptionStatusBySubscriptionId(subscriptionId, status || 'CANCELLED', 'free', nextBillingTime);
        console.log(`[Webhook ${webhookId}] ✓ Updated subscription to CANCELLED, plan set to free`);
      } else if (eventType.includes('BILLING.SUBSCRIPTION.ACTIVATED') && tier) {
        console.log(`[Webhook ${webhookId}] Processing activation event...`);
        await updatePayPalSubscriptionStatusBySubscriptionId(subscriptionId, status || 'ACTIVE', tier, nextBillingTime);
        console.log(`[Webhook ${webhookId}] ✓ Updated subscription to ACTIVE, plan set to ${tier}`);
      } else if (eventType.includes('BILLING.SUBSCRIPTION.UPDATED')) {
        console.log(`[Webhook ${webhookId}] Processing update event...`);
        // Update status and next billing time, but don't change plan unless status changed
        await updatePayPalSubscriptionStatusBySubscriptionId(subscriptionId, status || 'UNKNOWN', undefined, nextBillingTime);
        console.log(`[Webhook ${webhookId}] ✓ Updated subscription status to ${status}`);
      } else {
        console.log(`[Webhook ${webhookId}] Processing other event (${eventType})...`);
        // Other events - just update status and next billing time
        await updatePayPalSubscriptionStatusBySubscriptionId(subscriptionId, status || 'UNKNOWN', undefined, nextBillingTime);
        console.log(`[Webhook ${webhookId}] ✓ Updated subscription status to ${status}`);
      }
    } else {
      console.log(`[Webhook ${webhookId}] ⚠ No subscription ID found in webhook event`);
    }

    console.log(`[Webhook ${webhookId}] ✓ Webhook processed successfully\n`);
    return res.json({ ok: true });
  } catch (error: any) {
    console.error(`[Webhook ${webhookId}] ❌ Error processing webhook:`, error);
    console.error(`[Webhook ${webhookId}] Error stack:`, error?.stack);
    return res.status(500).json({ error: error?.message || 'Webhook error' });
  }
});

export default router;

