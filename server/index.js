const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.VITE_STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// Create Stripe checkout session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { planId, userId } = req.body;
    
    const prices = {
      'basic': 499, // $4.99
      'pro': 999,   // $9.99
      'premium': 1999 // $19.99
    };

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
      success_url: `${process.env.VITE_APP_URL}/payment-success`,
      cancel_url: `${process.env.VITE_APP_URL}/payment-cancel`,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Webhook to handle successful payments
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // Handle successful payment
    // Update user subscription in your database
  }

  res.json({received: true});
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
