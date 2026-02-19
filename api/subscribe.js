// Kit (ConvertKit) Email Subscription API
// Handles form submissions from all site pages
// Tags subscribers based on source for segmentation

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, source, firstName } = req.body || {};

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' });
    }

    // Kit (ConvertKit) configuration
    // REPLACE with your actual values or set as Vercel environment variables
    const FORM_ID = process.env.KIT_FORM_ID || 'YOUR_FORM_ID';
    const API_SECRET = process.env.KIT_API_SECRET || '';

    if (FORM_ID === 'YOUR_FORM_ID') {
        console.error('Kit Form ID not configured');
        return res.status(503).json({ error: 'Email service not configured' });
    }

    try {
        // Step 1: Subscribe to form (this is the core action)
        const formPayload = {
            email,
            api_secret: API_SECRET || undefined,
        };
        if (firstName) formPayload.first_name = firstName;

        const formRes = await fetch(
            `https://api.convertkit.com/v3/forms/${FORM_ID}/subscribe`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formPayload),
            }
        );

        if (!formRes.ok) {
            const errText = await formRes.text();
            console.error('Kit form subscription failed:', formRes.status, errText);
            return res.status(500).json({ error: 'Subscription failed' });
        }

        const formData = await formRes.json();
        const subscriberId = formData?.subscription?.subscriber?.id;

        // Step 2: Tag the subscriber based on source (if API secret is available)
        if (API_SECRET && subscriberId && source) {
            const tagMap = {
                'red-flags-guide': process.env.KIT_TAG_LEAD_MAGNET || '',
                'calculator': process.env.KIT_TAG_CALCULATOR || '',
                'decision-engine': process.env.KIT_TAG_DECISION_ENGINE || '',
                'scorecard': process.env.KIT_TAG_CALCULATOR || '',
                'comparison': process.env.KIT_TAG_DECISION_ENGINE || '',
                'negotiation': process.env.KIT_TAG_DECISION_ENGINE || '',
                'validation': process.env.KIT_TAG_DECISION_ENGINE || '',
            };
            const tagId = tagMap[source];

            if (tagId) {
                try {
                    await fetch(
                        `https://api.convertkit.com/v3/tags/${tagId}/subscribe`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, api_secret: API_SECRET }),
                        }
                    );
                } catch (tagErr) {
                    // Non-critical — subscriber is already added, tag just failed
                    console.error('Tagging failed (non-critical):', tagErr.message);
                }
            }
        }

        return res.status(200).json({ success: true, message: 'Subscribed successfully' });

    } catch (err) {
        console.error('Subscribe error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
