type PayPalMode = 'sandbox' | 'live';

const paypalMode = (): PayPalMode => {
  const v = String(process.env.PAYPAL_MODE || 'sandbox').trim().toLowerCase();
  return v === 'live' ? 'live' : 'sandbox';
};

const paypalBaseUrl = (): string => {
  return paypalMode() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
};

export type PayPalSubscription = {
  id: string;
  status: string;
  plan_id: string;
  subscriber?: {
    email_address?: string;
  };
  billing_info?: {
    next_billing_time?: string;
  };
};

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - now > 60_000) {
    return cachedAccessToken.token;
  }

  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const secret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!clientId || !secret) {
    throw new Error('PayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing)');
  }

  const basic = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || `PayPal token error (HTTP ${res.status})`);
  }
  const token = String(data.access_token || '');
  const expiresIn = Number(data.expires_in || 0) || 0;
  if (!token) throw new Error('PayPal token error (missing access_token)');

  cachedAccessToken = { token, expiresAtMs: now + (expiresIn * 1000) };
  return token;
}

export async function paypalApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.name || data?.error || `PayPal API error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function getPayPalSubscription(subscriptionId: string): Promise<PayPalSubscription> {
  const id = String(subscriptionId || '').trim();
  if (!id) throw new Error('subscriptionId is required');
  return await paypalApi<PayPalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
}

/**
 * Cancel a PayPal subscription.
 * @see https://developer.paypal.com/docs/api/subscriptions/v1/#subscriptions_cancel
 */
export async function cancelPayPalSubscription(subscriptionId: string, reason?: string): Promise<void> {
  const id = String(subscriptionId || '').trim();
  if (!id) throw new Error('subscriptionId is required');
  await paypalApi(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      reason: reason || 'User requested cancellation',
    }),
  });
}

// --- Orders v2 (advanced checkout: create order + capture) ---

export type PayPalOrderCreatePayload = {
  intent: 'CAPTURE';
  purchase_units: Array<{
    amount: { currency_code: string; value: string };
    description?: string;
    reference_id?: string;
  }>;
};

export type PayPalOrder = {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string; status: string }>;
      authorizations?: Array<{ id: string; status: string }>;
    };
  }>;
  details?: Array<{ issue: string; description: string }>;
  debug_id?: string;
};

/**
 * Create an order (Orders v2) for one-time checkout.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_create
 */
export async function createPayPalOrder(cart?: { amount?: string; currency_code?: string }[]): Promise<PayPalOrder> {
  const amount = (Array.isArray(cart) && cart.length > 0 && cart[0]?.amount)
    ? String(cart[0].amount)
    : '100.00';
  const currencyCode = (Array.isArray(cart) && cart.length > 0 && cart[0]?.currency_code)
    ? String(cart[0].currency_code).toUpperCase()
    : 'USD';
  const body: PayPalOrderCreatePayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: { currency_code: currencyCode, value: amount },
      },
    ],
  };
  return await paypalApi<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Capture payment for an order (Orders v2).
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
export async function capturePayPalOrder(orderId: string): Promise<PayPalOrder> {
  const id = String(orderId || '').trim();
  if (!id) throw new Error('orderId is required');
  return await paypalApi<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
    method: 'POST',
  });
}

export async function verifyPayPalWebhookSignature(args: {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
  webhookEvent: any;
}): Promise<boolean> {
  const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
  if (!webhookId) {
    throw new Error('PAYPAL_WEBHOOK_ID is required to verify webhooks');
  }
  const data = await paypalApi<{ verification_status?: string }>(`/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: args.authAlgo,
      cert_url: args.certUrl,
      transmission_id: args.transmissionId,
      transmission_sig: args.transmissionSig,
      transmission_time: args.transmissionTime,
      webhook_id: webhookId,
      webhook_event: args.webhookEvent,
    }),
  });
  return String(data?.verification_status || '').toUpperCase() === 'SUCCESS';
}

/**
 * Get subscription transactions.
 * @see https://developer.paypal.com/docs/api/subscriptions/v1/#subscriptions_transactions
 */
export async function getPayPalSubscriptionTransactions(
  subscriptionId: string,
  startTime?: string,
  endTime?: string
): Promise<{
  transactions?: Array<{
    id?: string;
    status?: string;
    amount_with_breakdown?: {
      gross_amount?: { currency_code?: string; value?: string };
    };
    payer_name?: { given_name?: string; surname?: string };
    time?: string;
  }>;
}> {
  const id = String(subscriptionId || '').trim();
  if (!id) throw new Error('subscriptionId is required');
  
  const params = new URLSearchParams();
  if (startTime) params.append('start_time', startTime);
  if (endTime) params.append('end_time', endTime);
  
  const query = params.toString();
  const url = `/v1/billing/subscriptions/${encodeURIComponent(id)}/transactions${query ? '?' + query : ''}`;
  
  return await paypalApi(url, {
    method: 'GET',
  });
}

/**
 * Get the last completed payment capture_id from a subscription.
 */
export async function getLastSubscriptionCaptureId(subscriptionId: string): Promise<string | null> {
  try {
    // Get transactions from the last 30 days
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const transactions = await getPayPalSubscriptionTransactions(subscriptionId, startTime, endTime);
    const txns = transactions?.transactions || [];
    
    // Find the last completed payment transaction
    // PayPal subscription transactions have the capture_id in the transaction id
    // We need to find a COMPLETED transaction
    for (let i = txns.length - 1; i >= 0; i--) {
      const txn = txns[i];
      if (txn?.status === 'COMPLETED' && txn?.id) {
        // The transaction id is the capture_id for subscription payments
        return txn.id;
      }
    }
    
    return null;
  } catch (error: any) {
    console.error(`Failed to get last capture_id for subscription ${subscriptionId}:`, error);
    return null;
  }
}

/**
 * Refund a PayPal capture.
 * @see https://developer.paypal.com/docs/api/payments/v2/#captures_refund
 */
export async function refundPayPalCapture(
  captureId: string,
  amount?: { currency_code?: string; value?: string },
  note?: string
): Promise<{
  id?: string;
  status?: string;
  amount?: { currency_code?: string; value?: string };
}> {
  const id = String(captureId || '').trim();
  if (!id) throw new Error('captureId is required');
  
  const body: any = {};
  if (amount) {
    body.amount = amount;
  }
  if (note) {
    body.note_to_payer = note;
  }
  
  return await paypalApi(`/v2/payments/captures/${encodeURIComponent(id)}/refund`, {
    method: 'POST',
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

