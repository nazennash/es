// src/components/PaymentForm.js
import React, { useState, useEffect } from 'react';
import { Elements } from '@stripe/stripe-elements';
import { PaymentService } from '../services/PaymentService';
import StripeCheckoutForm from './StripeCheckoutForm';
import PayPalButton from './PayPalButton';

const PaymentForm = ({ amount, onSuccess, onError }) => {
  const [stripeSecret, setStripeSecret] = useState(null);
  const [paypalOrderId, setPaypalOrderId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);

  useEffect(() => {
    const initializePayments = async () => {
      try {
        // Initialize both payment methods
        const { clientSecret } = await PaymentService.initializeStripePayment(amount);
        const orderID = await PaymentService.initializePayPalPayment(amount);
        
        setStripeSecret(clientSecret);
        setPaypalOrderId(orderID);
      } catch (error) {
        onError(error);
      }
    };

    initializePayments();
  }, [amount]);

  return (
    <div className="payment-form">
      <div className="payment-method-selector">
        <button
          onClick={() => setPaymentMethod('stripe')}
          className={paymentMethod === 'stripe' ? 'active' : ''}
        >
          Pay with Card
        </button>
        <button
          onClick={() => setPaymentMethod('paypal')}
          className={paymentMethod === 'paypal' ? 'active' : ''}
        >
          Pay with PayPal
        </button>
      </div>

      {paymentMethod === 'stripe' && stripeSecret && (
        <Elements stripe={stripePromise}>
          <StripeCheckoutForm
            clientSecret={stripeSecret}
            onSuccess={onSuccess}
            onError={onError}
          />
        </Elements>
      )}

      {paymentMethod === 'paypal' && paypalOrderId && (
        <PayPalButton
          orderID={paypalOrderId}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
    </div>
  );
};