const paypal = require('@paypal/checkout-server-sdk');

class PayPalService {
  constructor() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const environment = process.env.NODE_ENV === 'production'
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);

    this.client = new paypal.core.PayPalHttpClient(environment);
  }

  async createPayment(amount, currency = 'USD') {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: amount.toString()
        }
      }],
      application_context: {
        return_url: `${window.location.origin}/payment/success`,
        cancel_url: `${window.location.origin}/payment/cancel`
      }
    });

    try {
      const order = await this.client.execute(request);
      return order.result;
    } catch (err) {
      console.error(err);
      throw new Error('PayPal payment creation failed');
    }
  }

  async capturePayment(paymentId) {
    // Implement payment capture
  }
}

module.exports = PayPalService;
