// /src/components/PaymentComponent.jsx
import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Initialize Firebase Functions
const functions = getFunctions();
const createStripePayment = httpsCallable(functions, 'createStripePayment');
const createPayPalOrder = httpsCallable(functions, 'createPayPalOrder');
const capturePayPalOrder = httpsCallable(functions, 'capturePayPalOrder');

// Replace with your publishable keys
const stripePromise = loadStripe('your_stripe_publishable_key');
const PAYPAL_CLIENT_ID = 'your_paypal_client_id';

const PaymentComponent = ({ amount, currency = 'USD' }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stripe payment handling
  const handleStripePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      const stripe = await stripePromise;
      
      // Call Firebase function to create payment intent
      const result = await createStripePayment({ amount, currency });
      const { clientSecret } = result.data;

      const paymentResult = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement('card'),
          billing_details: {
            name: 'Customer Name',
          },
        },
      });

      if (paymentResult.error) {
        throw new Error(paymentResult.error.message);
      }

      // Payment successful
      console.log('Payment successful:', paymentResult.paymentIntent);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // PayPal payment handling
  const handlePayPalOrderCreate = async () => {
    try {
      const result = await createPayPalOrder({ amount, currency });
      return result.data.id;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const handlePayPalApprove = async (data) => {
    try {
      const result = await capturePayPalOrder({ orderId: data.orderID });
      console.log('PayPal payment successful:', result.data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="payment-container">
      {error && <div className="error">{error}</div>}
      
      <div className="payment-methods">
        <button
          onClick={handleStripePayment}
          disabled={loading}
        >
          Pay with Stripe
        </button>
        
        <PayPalScriptProvider options={{ 
          "client-id": PAYPAL_CLIENT_ID,
          currency: currency,
        }}>
          <PayPalButtons
            createOrder={handlePayPalOrderCreate}
            onApprove={handlePayPalApprove}
            disabled={loading}
          />
        </PayPalScriptProvider>
      </div>
    </div>
  );
};

export default PaymentComponent;