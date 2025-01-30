/**
 * @interface PaymentService
 */
class PaymentService {
    /**
     * Create a payment
     * @param {number} amount - Payment amount
     * @param {string} [currency] - Payment currency
     * @returns {Promise<any>}
     */
    async createPayment(amount, currency) {
      throw new Error('Method not implemented');
    }
  
    /**
     * Capture a payment
     * @param {string} paymentId - Payment ID to capture
     * @returns {Promise<any>}
     */
    async capturePayment(paymentId) {
      throw new Error('Method not implemented');
    }
  }
  
  export { PaymentService };