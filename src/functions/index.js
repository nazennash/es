let environment = new paypal.core.SandboxEnvironment(
    functions.config().paypal.client_id,
    functions.config().paypal.client_secret
  );
  let paypalClient = new paypal.core.PayPalHttpClient(environment);
  
  exports.createStripePayment = functions.https.onCall(async (data, context) => {
    try {
      const { amount, currency } = data;
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency: currency,
      });
  
      return { clientSecret: paymentIntent.client_secret };
    } catch (error) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  });
  
  exports.createPayPalOrder = functions.https.onCall(async (data, context) => {
    try {
      const { amount, currency } = data;
      
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: amount.toString(),
          },
        }],
      });
  
      const order = await paypalClient.execute(request);
      return { id: order.result.id };
    } catch (error) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  });
  
  exports.capturePayPalOrder = functions.https.onCall(async (data, context) => {
    try {
      const { orderId } = data;
      
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      const capture = await paypalClient.execute(request);
      
      return capture.result;
    } catch (error) {
      throw new functions.https.HttpsError('internal', error.message);
    }
  });