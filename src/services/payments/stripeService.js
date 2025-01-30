import Stripe from 'stripe';

class StripeService {
  constructor() {
    this.stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
  }

  async createPayment(amount, currency = 'usd') {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe uses cents
        currency,
      });
      return paymentIntent;
    } catch (error) {
      console.error('Error creating payment with Stripe:', error);
      throw new Error('Failed to create payment');
    }
  }

  async confirmPayment(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      console.error('Error confirming payment with Stripe:', error);
      throw new Error('Failed to confirm payment');
    }
  }
}

export { StripeService };