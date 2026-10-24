import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminServices } from './firebase-admin';
import { CommerceError } from './orders';
import { createPaymentService } from './payments';
import { razorpayGateway, validSignature } from './razorpay';

export default async function webhook(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');
  const reply = (status: number, message: string) => { response.statusCode = status; response.end(JSON.stringify({ message })); };
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return reply(405, 'Method not allowed.'); }
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (secret.length < 20) return reply(503, 'Webhook is not configured.');
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 128000) return reply(413, 'Request too large.');
      chunks.push(bytes);
    }
    const body = Buffer.concat(chunks);
    if (!validSignature(body, request.headers['x-razorpay-signature'], secret)) return reply(400, 'Invalid webhook signature.');
    const event = JSON.parse(body.toString('utf8'));
    if (!['payment.authorized', 'payment.captured', 'order.paid', 'refund.processed', 'refund.failed'].includes(event.event)) return reply(200, 'Ignored event.');
    const gateway = razorpayGateway();
    const service = createPaymentService(adminServices().db, gateway);
    if (event.event.startsWith('refund.')) {
      const paymentId = event.payload?.refund?.entity?.payment_id;
      if (typeof paymentId !== 'string' || !/^pay_[A-Za-z0-9]{1,80}$/.test(paymentId)) return reply(400, 'Invalid payment.');
      await service.runRefund(paymentId);
    } else {
      const paymentId = event.payload?.payment?.entity?.id;
      if (typeof paymentId !== 'string' || !/^pay_[A-Za-z0-9]{1,80}$/.test(paymentId)) return reply(400, 'Invalid payment.');
      // Fetch authoritative provider data rather than trusting event ordering or snapshots.
      await service.processPayment(await gateway.payment(paymentId));
    }
    return reply(200, 'Processed.');
  } catch (error) {
    if (error instanceof SyntaxError) return reply(400, 'Invalid JSON.');
    if (error instanceof CommerceError && error.status === 404) return reply(200, 'Unrelated payment.');
    return reply(503, 'Payment reconciliation will be retried.');
  }
}
