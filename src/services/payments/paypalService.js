// services/payments/paypalService.js
import { PayPalButtons } from '@paypal/react-paypal-js';
import { PaymentService } from './paymentService';

export class PayPalService extends PaymentService {
  constructor() {
    super();
    this.clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    this.clientSecret = import.meta.env.VITE_PAYPAL_CLIENT_SECRET;
  }

  async createPayment(amount, currency = 'USD') {
    try {
      const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      const { access_token } = await response.json();

      const orderResponse = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
          }],
        }),
      });

      return await orderResponse.json();
    } catch (error) {
      console.error('Error creating payment with PayPal:', error);
      throw new Error('Failed to create payment: ' + error.message);
    }
  }

  async capturePayment(orderId) {
    try {
      const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      const { access_token } = await response.json();

      const captureResponse = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      });

      return await captureResponse.json();
    } catch (error) {
      console.error('Error capturing payment with PayPal:', error);
      throw new Error('Failed to capture payment: ' + error.message);
    }
  }
}
