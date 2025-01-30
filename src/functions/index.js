import * as functions from 'firebase-functions';
import Stripe from 'stripe';
import fetch from 'node-fetch';

const stripe = new Stripe(process.env.VITE_STRIPE_SECRET_KEY);
const PAYPAL_CLIENT_ID = process.env.VITE_PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.VITE_PAYPAL_CLIENT_SECRET;
const PAYPAL_BASE_URL = 'https://api-m.paypal.com'; // Use sandbox URL for testing

export const createStripePaymentIntent = functions.https.onCall(async (data, context) => {
  const { amount, currency } = data;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
    });

    return {
      clientSecret: paymentIntent.client_secret,
    };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const createPayPalOrder = functions.https.onCall(async (data, context) => {
  const { amount } = data;

  try {
    // Get PayPal access token
    const tokenResponse = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const { access_token } = await tokenResponse.json();

    // Create PayPal order
    const orderResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: (amount / 100).toFixed(2), // Convert cents to dollars
          },
        }],
      }),
    });

    const order = await orderResponse.json();
    return { orderID: order.id };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});