const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // Retrieve the session to get the payment intent
    const session = await stripe.checkout.sessions.retrieve(token, {
      expand: ['payment_intent']
    });

    if (session.payment_status !== 'paid') {
      return res.status(403).json({ error: 'Invalid session' });
    }

    // Mark the payment intent as analyzed (prevents reuse)
    if (session.payment_intent?.id) {
      await stripe.paymentIntents.update(session.payment_intent.id, {
        metadata: {
          product: 'fdd_analyzer',
          analyzed: 'true',
          analyzed_at: new Date().toISOString()
        }
      });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Complete session error:', error);
    return res.status(500).json({ error: 'Failed to complete session' });
  }
};
