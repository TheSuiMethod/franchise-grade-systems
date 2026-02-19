const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'AI Franchise Decision Engine',
            description: 'Full access: 5 negotiation scenarios, 5-way franchise comparison, 8 validation call script topics, plus the AI FDD Analyzer ($97 value included).',
          },
          unit_amount: 29700, // $297.00
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.SITE_URL || 'https://www.franchisegradesystems.com'}/decision-engine-portal?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL || 'https://www.franchisegradesystems.com'}/decision-engine`,
      metadata: {
        product: 'decision_engine',
      },
      payment_intent_data: {
        metadata: {
          product: 'decision_engine',
        }
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Decision Engine checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
