const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.query;

  if (!session_id || typeof session_id !== 'string' || session_id.length < 10) {
    return res.status(400).json({ valid: false, reason: 'invalid' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Price IDs that grant Gap Analyzer access
  const GAP_ACCESS_PRICE_IDS = [
    'price_1T74ktCtSsWNQjR9I9W1Ga1f', // [S23] Operations Gap Analyzer ($97)
  ];

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items']
    });

    if (session.payment_status !== 'paid') {
      return res.status(200).json({ valid: false, reason: 'unpaid' });
    }

    const lineItems = session.line_items?.data || [];
    const hasAccess = lineItems.some(item =>
      GAP_ACCESS_PRICE_IDS.includes(item.price?.id)
    );

    if (!hasAccess) {
      return res.status(200).json({ valid: false, reason: 'wrong_product' });
    }

    // Generate a short-lived access token
    const token = Buffer.from(`gap:${session_id}:${Date.now()}`).toString('base64');

    return res.status(200).json({ valid: true, token });
  } catch (err) {
    console.error('Gap verify error:', err.message);
    return res.status(200).json({ valid: false, reason: 'error' });
  }
};
