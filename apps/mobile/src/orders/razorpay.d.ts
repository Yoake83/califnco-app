declare module 'react-native-razorpay' {
  const checkout: {
    open(options: import('./payment-types').CheckoutOptions & { theme: { color: string } }): Promise<import('./payment-types').PaymentResult>;
  };
  export default checkout;
}
