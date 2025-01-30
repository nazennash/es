import { useState } from 'react';
import { StripeService } from '../services/payments/stripeService';
import { PayPalService } from '../services/payments/paypalService';

export const usePayment = () => {
  const [loading, setLoading] = useState(false);
  const stripeService = new StripeService();
  const paypalService = new PayPalService();

  const handleStripePayment = async (amount) => {
    setLoading(true);
    try {
      const intent = await stripeService.createPayment(amount);
      const stripe = await loadStripe(process.env.STRIPE_PUBLIC_KEY);
      await stripe.redirectToCheckout({
        sessionId: intent.id
      });
    } catch (error) {
      console.error('Payment failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalPayment = async (amount) => {
    setLoading(true);
    try {
      const order = await paypalService.createPayment(amount);
      window.location.href = order.links.find(link => link.rel === 'approve').href;
    } catch (error) {
      console.error('Payment failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    handleStripePayment,
    handlePayPalPayment,
    loading
  };
};
