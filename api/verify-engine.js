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

  // Price IDs that grant Decision Engine access
  // Decision Engine ($297), Bundle ($897 — includes Engine)
  const ENGINE_ACCESS_PRICE_IDS = [
    'price_1T4XuECtSsWNQjR9dvj2lksh', // AI Franchise Decision Engine ($297)
    'price_1T2incCtSsWNQjR95AMv1AeX',  // Decision Engine + Expert Review Bundle ($897)
  ];

  try {
    // Retrieve the Stripe checkout session with line items
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items']
    });

    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(200).json({ valid: false, reason: 'unpaid' });
    }

    // Verify purchase includes Decision Engine access by checking price IDs
    const lineItems = session.line_items?.data || [];
    const hasAccess = lineItems.some(item =>
      ENGINE_ACCESS_PRICE_IDS.includes(item.price?.id)
    );

    if (!hasAccess) {
      return res.status(200).json({ valid: false, reason: 'wrong_product' });
    }

    // Determine which product was purchased for the frontend
    const purchasedPriceId = lineItems.find(item =>
      ENGINE_ACCESS_PRICE_IDS.includes(item.price?.id)
    )?.price?.id;

    const product = purchasedPriceId === 'price_1T2incCtSsWNQjR95AMv1AeX'
      ? 'bundle'
      : 'decision_engine';

    return res.status(200).json({
      valid: true,
      product: product,
      email: session.customer_details?.email || null,
    });

  } catch (error) {
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(200).json({ valid: false, reason: 'invalid' });
    }
    console.error('Verify engine session error:', error);
    return res.status(500).json({ valid: false, reason: 'connection' });
  }
};
