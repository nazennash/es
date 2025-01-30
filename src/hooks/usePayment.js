// hooks/usePayment.js
import { useState } from 'react';
import { StripeService } from '../services/payments/stripeService';
import { PayPalService } from '../services/payments/paypalService';

export const usePayment = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const stripeService = new StripeService();
  const payPalService = new PayPalService();

  const handleStripePayment = async (amount) => {
    setLoading(true);
    setError(null);
    try {
      const result = await stripeService.createPayment(amount, 'USD');
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalPayment = async (amount) => {
    setLoading(true);
    setError(null);
    try {
      const result = await payPalService.createPayment(amount, 'USD');
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalCapture = async (orderId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await payPalService.capturePayment(orderId);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    handleStripePayment,
    handlePayPalPayment,
    handlePayPalCapture,
    loading,
    error,
  };
};