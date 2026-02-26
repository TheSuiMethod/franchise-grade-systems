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
        price: 'price_1T4XuECtSsWNQjR9dvj2lksh', // AI Franchise Decision Engine ($297)
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.SITE_URL || 'https://www.franchisegradesystems.com'}/decision-engine-portal?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL || 'https://www.franchisegradesystems.com'}/decision-engine`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Decision Engine checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
