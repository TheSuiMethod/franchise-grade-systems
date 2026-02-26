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

  // Price IDs that grant FDD Analyzer access
  // Single ($97), Decision Engine ($297 — includes Analyzer), Bundle ($897 — includes Engine)
  const FDD_ACCESS_PRICE_IDS = [
    'price_1T4Xu3CtSsWNQjR9NJmOQIxS', // FDD Analyzer - Single Analysis ($97)
    'price_1T4XuECtSsWNQjR9dvj2lksh', // AI Franchise Decision Engine ($297)
    'price_1T2incCtSsWNQjR95AMv1AeX',  // Decision Engine + Expert Review Bundle ($897)
  ];

  try {
    // Retrieve the Stripe checkout session with line items and payment intent
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['payment_intent', 'line_items']
    });

    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(200).json({ valid: false, reason: 'unpaid' });
    }

    // Verify purchase includes FDD Analyzer access by checking price IDs
    const lineItems = session.line_items?.data || [];
    const hasAccess = lineItems.some(item =>
      FDD_ACCESS_PRICE_IDS.includes(item.price?.id)
    );

    if (!hasAccess) {
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
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(200).json({ valid: false, reason: 'invalid' });
    }
    console.error('Verify session error:', error);
    return res.status(500).json({ valid: false, reason: 'connection' });
  }
};
