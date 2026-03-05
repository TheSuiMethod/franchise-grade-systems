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

  // Price IDs that grant Playbook portal access
  const PLAYBOOK_ACCESS_PRICE_IDS = [
    'price_1T74lDCtSsWNQjR95RjGMWSO', // [S23] Franchise-Grade Systems Playbook ($297)
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
      PLAYBOOK_ACCESS_PRICE_IDS.includes(item.price?.id)
    );

    if (!hasAccess) {
      return res.status(200).json({ valid: false, reason: 'wrong_product' });
    }

    const token = Buffer.from(`playbook:${session_id}:${Date.now()}`).toString('base64');
    return res.status(200).json({ valid: true, token });
  } catch (err) {
    console.error('Playbook verify error:', err.message);
    return res.status(200).json({ valid: false, reason: 'error' });
  }
};
