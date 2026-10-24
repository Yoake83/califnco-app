export type CheckoutOptions = {
  key: string; order_id: string; amount: number; currency: 'INR';
  name: string; description: string; prefill: { name: string; contact: string };
};
export type PaymentResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
