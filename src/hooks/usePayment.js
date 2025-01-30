import { StripeService } from '../services/payments/stripeService';
import { PayPalService } from '../services/payments/paypalService';
class PaymentProcessor extends PaymentService {
  constructor(paymentGateway) {
    super();
    this.paymentGateway = paymentGateway;
  }

  async createPayment(amount, currency) {
    return this.paymentGateway.createPayment(amount, currency);
  }

  async capturePayment(paymentId) {
    return this.paymentGateway.capturePayment(paymentId);
  }
}

// Example usage with Stripe
const stripeService = new StripeService();
const stripePaymentProcessor = new PaymentProcessor(stripeService);

// Example usage with PayPal
const payPalService = new PayPalService();
const payPalPaymentProcessor = new PaymentProcessor(payPalService);