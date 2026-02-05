import { WebSocket } from 'ws';
import { AuthenticatedWebSocket } from './types.js';

// In-memory registry of active sockets per auth session id (sid).
// This allows us to immediately disconnect a desktop/mobile/web client when their session is revoked.
const socketsBySid = new Map<string, Set<WebSocket>>();

// Registry of active sockets per userId for broadcasting plan updates.
const socketsByUserId = new Map<string, Set<WebSocket>>();

export function registerWebSocketForSession(sid: string, ws: WebSocket): void {
  const s = String(sid || '').trim();
  if (!s) return;
  let set = socketsBySid.get(s);
  if (!set) {
    set = new Set<WebSocket>();
    socketsBySid.set(s, set);
  }
  set.add(ws);

  const cleanup = () => {
    const cur = socketsBySid.get(s);
    if (!cur) return;
    cur.delete(ws);
    if (cur.size === 0) socketsBySid.delete(s);
    
    // Also remove from userId tracking
    const authWs = ws as AuthenticatedWebSocket;
    const userId = authWs.user?.userId;
    if (userId) {
      const userSet = socketsByUserId.get(userId);
      if (userSet) {
        userSet.delete(ws);
        if (userSet.size === 0) socketsByUserId.delete(userId);
      }
    }
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
  
  // Also register by userId for plan update broadcasting
  const authWs = ws as AuthenticatedWebSocket;
  const userId = authWs.user?.userId;
  if (userId) {
    let userSet = socketsByUserId.get(userId);
    if (!userSet) {
      userSet = new Set<WebSocket>();
      socketsByUserId.set(userId, userSet);
    }
    userSet.add(ws);
  }
}

export function closeWebSocketsForSession(sid: string, reason = 'Session revoked'): number {
  const s = String(sid || '').trim();
  const set = socketsBySid.get(s);
  if (!set || set.size === 0) return 0;

  // Copy to avoid mutation while iterating.
  const sockets = Array.from(set.values());
  for (const ws of sockets) {
    try {
      // Tell clients explicitly (so they can sign out immediately).
      ws.send(JSON.stringify({ type: 'session_revoked', message: reason }));
    } catch (_) {}
    try {
      // 4001 is an app-defined close code.
      ws.close(4001, reason);
    } catch (_) {}
  }
  socketsBySid.delete(s);
  return sockets.length;
}

/**
 * Broadcast a plan update message to all WebSocket connections for a specific user.
 * This allows web and desktop apps to sync plan changes in real-time.
 * 
 * Security: Only sends to sockets that are authenticated with the matching userId.
 * Each socket's userId is verified from its authenticated JWT payload before sending.
 * 
 * @param userId - The user ID to broadcast to (must match authenticated userId)
 * @param planData - Plan update data to send (plan, subscription status, etc.)
 * @returns Number of sockets that received the message
 */
export function broadcastPlanUpdate(userId: string, planData: {
  plan: 'free' | 'pro' | 'pro_plus';
  subscription?: {
    subscriptionId?: string | null;
    status?: string | null;
    nextBillingTime?: string | null;
    cancelAtPeriodEnd?: boolean;
    cancelScheduledAt?: number | null;
  } | null;
}): number {
  const u = String(userId || '').trim();
  if (!u) {
    console.warn('[broadcastPlanUpdate] Invalid userId provided');
    return 0;
  }
  
  const sockets = socketsByUserId.get(u);
  if (!sockets || sockets.size === 0) return 0;
  
  const message = JSON.stringify({
    type: 'plan_update',
    plan: planData.plan,
    subscription: planData.subscription,
    timestamp: new Date().toISOString(),
  });
  
  let sent = 0;
  const socketsArray = Array.from(sockets.values());
  for (const ws of socketsArray) {
    try {
      // Security: Verify that this socket's authenticated userId matches the target userId
      const authWs = ws as AuthenticatedWebSocket;
      const socketUserId = authWs.user?.userId;
      
      if (!socketUserId) {
        console.warn('[broadcastPlanUpdate] Socket missing userId, skipping');
        continue;
      }
      
      if (socketUserId !== u) {
        // This should never happen if registration is correct, but log as security warning
        console.error(`[broadcastPlanUpdate] SECURITY WARNING: Socket userId mismatch. Expected: ${u}, Got: ${socketUserId}`);
        continue;
      }
      
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
        sent++;
      }
    } catch (err) {
      console.error(`[broadcastPlanUpdate] Failed to send to socket:`, err);
    }
  }
  
  return sent;
}

