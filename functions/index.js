import * as functions from 'firebase-functions';
import Stripe from 'stripe';

// For Firebase Cloud Functions, keep process.env as it's running in Node.js environment
const stripe = new Stripe(process.env.VITE_STRIPE_SECRET_KEY);

exports.createStripeCheckout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }

  const { planId } = data;
  const userId = context.auth.uid;

  const prices = {
    'basic': 499,
    'pro': 999,
    'premium': 1999
  };

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
          },
          unit_amount: prices[planId],
        },
        quantity: 1,
      }],
      metadata: {
        userId,
        planId
      },
      mode: 'subscription',
      success_url: `${functions.config().app.url}/payment-success`,
      cancel_url: `${functions.config().app.url}/payment-cancel`,
    });

    return { sessionId: session.id };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      functions.config().stripe.webhook_secret
    );
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, planId } = session.metadata;

    // Update user's subscription in Firestore
    await admin.firestore()
      .collection('subscriptions')
      .doc(userId)
      .set({
        planId,
        status: 'active',
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        stripeSessionId: session.id
      });
  }

  res.json({received: true});
});
