import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminServices } from './firebase-admin';
import { CommerceError, createOrderService } from './orders';
import { createPaymentService } from './payments';
import { razorpayGateway } from './razorpay';

type Request = IncomingMessage & { body?: unknown };
function reply(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body));
}
async function readBody(request: Request) {
  if (request.body !== undefined) {
    if (Buffer.byteLength(typeof request.body === 'string' ? request.body : JSON.stringify(request.body)) > 16000) throw new CommerceError(413, 'The request is too large.');
    return typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  }
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 16000) throw new CommerceError(413, 'The request is too large.');
  }
  try { return JSON.parse(body); } catch { throw new CommerceError(400, 'Invalid request.'); }
}

export default async function handler(request: Request, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  const origin = request.headers.origin;
  const allowed = new Set((process.env.APP_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  if (process.env.NODE_ENV !== 'production') { allowed.add('http://localhost:8081'); allowed.add('http://localhost:5174'); allowed.add('http://localhost:5173'); }
  if (origin) {
    if (!allowed.has(origin)) return reply(response, 403, { error: 'This app origin is not allowed.' });
    response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return; }
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); return reply(response, 405, { error: 'Method not allowed.' }); }
  try {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization || '')?.[1];
    if (!token) throw new CommerceError(401, 'Sign in before continuing.');
    const { auth, db } = adminServices();
    let account;
    try { account = await auth.verifyIdToken(token, true); } catch { throw new CommerceError(401, 'Your session expired. Sign in again.'); }
    const input = await readBody(request) as Record<string, unknown> | null;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CommerceError(400, 'Invalid request.');
    const service = createOrderService(db);
    const actor = { uid: account.uid, admin: account.admin === true };
    switch (input.action) {
      case 'payment-ready': {
        razorpayGateway();
        if ((process.env.RAZORPAY_WEBHOOK_SECRET || '').length < 20) throw new CommerceError(503, 'Test payments are being configured. Please try again later.');
        return reply(response, 200, { ready: true });
      }
      case 'payment-prepare': {
        if ((process.env.RAZORPAY_WEBHOOK_SECRET || '').length < 20) throw new CommerceError(503, 'Test payments are being configured. Please try again later.');
        return reply(response, 200, { checkout: await createPaymentService(db, razorpayGateway()).prepare(input.orderId, actor.uid) });
      }
      case 'payment-verify': return reply(response, 200, { order: await createPaymentService(db, razorpayGateway()).verify(actor.uid, input) });
      case 'payment-refresh': return reply(response, 200, { order: await createPaymentService(db, razorpayGateway()).reconcile(input.orderId, actor.uid, actor.admin) });
      case 'create': return reply(response, 200, { order: await service.create(actor.uid, input) });
      case 'cancel': {
        if (typeof input.orderId !== 'string') throw new CommerceError(400, 'Choose an order.');
        return reply(response, 200, { order: await service.cancel(input.orderId, actor) });
      }
      case 'status': {
        if (!actor.admin) throw new CommerceError(403, 'Admin access is required.');
        if (typeof input.orderId !== 'string' || typeof input.status !== 'string') throw new CommerceError(400, 'Choose an order and status.');
        return reply(response, 200, { order: await service.updateStatus(input.orderId, input.status) });
      }
      case 'expire': {
        if (!actor.admin) throw new CommerceError(403, 'Admin access is required.');
        return reply(response, 200, { expired: await service.expireReservations() });
      }
      default: throw new CommerceError(400, 'Unknown action.');
    }
  } catch (error) {
    if (error instanceof CommerceError) return reply(response, error.status, { error: error.message });
    if (error instanceof SyntaxError) return reply(response, 400, { error: 'Invalid request.' });
    // Never return credentials, tokens, raw provider responses or SDK diagnostics.
    return reply(response, 503, { error: 'Ordering is temporarily unavailable. Please try again later.' });
  }
}
