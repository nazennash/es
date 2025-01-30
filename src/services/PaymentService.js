// src/services/PaymentService.js
import { loadStripe } from '@stripe/stripe-js';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

const stripePromise = loadStripe('your_stripe_publishable_key');

export class PaymentService {
  static async initializeStripePayment(amount, currency = 'usd') {
    try {
      const createPaymentIntent = httpsCallable(functions, 'createStripePaymentIntent');
      const response = await createPaymentIntent({ amount, currency });
      const stripe = await stripePromise;
      
      return {
        stripe,
        clientSecret: response.data.clientSecret
      };
    } catch (error) {
      console.error('Error initializing Stripe payment:', error);
      throw error;
    }
  }

  static async initializePayPalPayment(amount) {
    try {
      const createPayPalOrder = httpsCallable(functions, 'createPayPalOrder');
      const response = await createPayPalOrder({ amount });
      return response.data.orderID;
    } catch (error) {
      console.error('Error initializing PayPal payment:', error);
      throw error;
    }
  }
}
