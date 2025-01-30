import paypal from '@paypal/checkout-server-sdk';

class PayPalService {
  constructor() {
    const Environment = import.meta.env.PROD
      ? paypal.core.LiveEnvironment
      : paypal.core.SandboxEnvironment;

    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_PAYPAL_CLIENT_SECRET;

    this.environment = new Environment(clientId, clientSecret);
    this.client = new paypal.core.PayPalHttpClient(this.environment);
  }

  async createPayment(amount, currency = 'USD') {
    try {
      const request = new paypal.orders.OrdersCreateRequest();
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
          },
        ],
      });

      const response = await this.client.execute(request);
      return response.result;
    } catch (error) {
      console.error('Error creating payment with PayPal:', error);
      throw new Error('Failed to create payment');
    }
  }

  async capturePayment(orderId) {
    try {
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      const response = await this.client.execute(request);
      return response.result;
    } catch (error) {
      console.error('Error capturing payment with PayPal:', error);
      throw new Error('Failed to capture payment');
    }
  }
}

export { PayPalService };