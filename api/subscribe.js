// Kit (ConvertKit) Email Subscription API
// Handles form submissions from all site pages
// Tags subscribers based on source for correct sequence triggering

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
    const FORM_ID = process.env.KIT_FORM_ID || '';
    const API_SECRET = process.env.KIT_API_SECRET || '';

    if (!FORM_ID) {
        console.error('Kit Form ID not configured. Set KIT_FORM_ID in Vercel environment variables.');
        return res.status(503).json({ error: 'Email service not configured' });
    }

    // Tag ID mapping: source parameter -> Vercel environment variable -> Kit tag ID
    //
    // Each environment variable should contain the NUMERIC Kit tag ID.
    // To find tag IDs: Kit dashboard > Grow > Tags > click tag > ID is in the URL
    //
    // === SEGMENT 1: Franchise Buyers ===
    //   KIT_TAG_SCORECARD       -> triggers Scorecard Nurture (3 emails, 7 days)
    //   KIT_TAG_CALCULATOR      -> triggers Calculator Nurture (3 emails, 7 days)
    //   KIT_TAG_QUIZ            -> triggers Quiz Nurture (3 emails, 7 days)
    //   KIT_TAG_LEAD_MAGNET     -> triggers Red Flags Guide sequence (5 emails, 14 days)
    //
    // === SEGMENT 2/3: Independent Business Owners ===
    //   KIT_TAG_SEG23_SCORECARD -> triggers Seg 2/3 Welcome + Nurture (8 emails)
    //   KIT_TAG_SEG23_TIER1     -> triggers Seg 2/3 Tier 1 Post-Purchase (5 emails)
    //   KIT_TAG_SEG23_TIER2     -> triggers Seg 2/3 Tier 2 Post-Purchase (7 emails)
    //   KIT_TAG_SEG23_TIER3     -> triggers Seg 2/3 Tier 3 Post-Purchase (5 emails)
    //   KIT_TAG_SEG1_REJECT     -> triggers Cross-Sell Branch (5 emails)
    //   KIT_TAG_SEG23_CROSSSELL -> triggers Seg 2/3 cross-sell nurture
    //   KIT_TAG_SEG23_NURTURE   -> general Seg 2/3 nurture tag
    //
    const TAG_MAP = {
        // --- Segment 1: Franchise Buyers ---
        'scorecard':            process.env.KIT_TAG_SCORECARD || '',
        'calculator':           process.env.KIT_TAG_CALCULATOR || '',
        'comparison':           process.env.KIT_TAG_CALCULATOR || '',
        'negotiation':          process.env.KIT_TAG_CALCULATOR || '',
        'validation':           process.env.KIT_TAG_CALCULATOR || '',
        'red-flags-guide':      process.env.KIT_TAG_LEAD_MAGNET || '',
        'red-flags-checklist':  process.env.KIT_TAG_LEAD_MAGNET || '',
        'red-flag-quiz':        process.env.KIT_TAG_QUIZ || '',
        'decision-engine':      process.env.KIT_TAG_LEAD_MAGNET || '',

        // --- Segment 2/3: Independent Business Owners ---
        'scorecard-independent':    process.env.KIT_TAG_SEG23_SCORECARD || '',
        'gap-analyzer':             process.env.KIT_TAG_SEG23_TIER1 || '',
        'systems-playbook':         process.env.KIT_TAG_SEG23_TIER2 || '',
        'implementation-sprint':    process.env.KIT_TAG_SEG23_TIER3 || '',
        'seg1-reject':              process.env.KIT_TAG_SEG1_REJECT || '',
        'independent-systems':      process.env.KIT_TAG_SEG23_SCORECARD || '',
    };

    try {
        // Step 1: Subscribe to form
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

        // Step 2: Apply source-specific tag
        if (API_SECRET && subscriberId && source) {
            const tagId = TAG_MAP[source];

            if (tagId) {
                try {
                    const tagRes = await fetch(
                        `https://api.convertkit.com/v3/tags/${tagId}/subscribe`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, api_secret: API_SECRET }),
                        }
                    );
                    if (!tagRes.ok) {
                        console.error('Tag apply failed:', tagRes.status, await tagRes.text());
                    }
                } catch (tagErr) {
                    console.error('Tagging failed (non-critical):', tagErr.message);
                }
            } else {
                console.warn(`No tag configured for source: "${source}". Check Vercel env vars.`);
            }
        }

        return res.status(200).json({ success: true, message: 'Subscribed successfully' });

    } catch (err) {
        console.error('Subscribe error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
