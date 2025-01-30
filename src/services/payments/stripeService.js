// services/payments/stripeService.js
import { loadStripe } from '@stripe/stripe-js';
import { PaymentService } from './paymentService';

export class StripeService extends PaymentService {
  constructor() {
    super();
    this.stripe = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
    this.elements = null;
  }

  // Add method to initialize elements
  async initializeElements() {
    const stripe = await this.stripe;
    if (!stripe) throw new Error('Failed to load Stripe');
    this.elements = stripe.elements();
    return this.elements;
  }

  async createPayment(amount, currency = 'usd', cardElement) {
    try {
      const stripe = await this.stripe;
      if (!stripe) throw new Error('Failed to load Stripe');
      if (!cardElement) throw new Error('Card element is required');

      const { error: backendError, clientSecret } = await this.createPaymentIntent(amount, currency);
      if (backendError) throw new Error(backendError.message);

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: 'Customer Name', // You should get this from your form
          },
        },
      });

      if (error) throw new Error(error.message);
      return paymentIntent;
    } catch (error) {
      console.error('Error creating payment with Stripe:', error);
      throw new Error('Failed to create payment: ' + error.message);
    }
  }

  // Helper method to create payment intent (removed 'private' keyword)
  async createPaymentIntent(amount, currency) {
    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: Math.round(amount * 100),
        currency: currency,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }
}