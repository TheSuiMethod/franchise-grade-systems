const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session_id } = req.query;

  if (!session_id || typeof session_id !== 'string' || session_id.length < 10) {
    return res.status(400).json({ valid: false, reason: 'invalid' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // Retrieve the Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['payment_intent']
    });

    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(200).json({ valid: false, reason: 'unpaid' });
    }

    // Verify this is an FDD analyzer purchase
    if (session.metadata?.product !== 'fdd_analyzer') {
      return res.status(200).json({ valid: false, reason: 'invalid' });
    }

    // Check if this session has already been used for analysis
    const paymentIntent = session.payment_intent;
    if (paymentIntent && paymentIntent.metadata?.analyzed === 'true') {
      return res.status(200).json({ valid: false, reason: 'used' });
    }

    // Valid session — return token (the session_id serves as the token)
    return res.status(200).json({
      valid: true,
      token: session_id,
      email: session.customer_details?.email || null
    });

  } catch (error) {
    // Invalid session ID format or Stripe error
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(200).json({ valid: false, reason: 'invalid' });
    }
    console.error('Verify session error:', error);
    return res.status(500).json({ valid: false, reason: 'connection' });
  }
};
