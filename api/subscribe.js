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
    // ---- Segment 1: Franchise Buyer Lead Gen Tools ----
    //   KIT_TAG_SCORECARD          -> Business Scorecard (S1 nurture, 3 emails, 7 days)
    //   KIT_TAG_CALCULATOR         -> ROI/Profit/Comparison/Negotiation tools (S1 nurture)
    //   KIT_TAG_QUIZ               -> Red Flag Quiz (S1 quiz follow-up, 3 emails)
    //   KIT_TAG_LEAD_MAGNET        -> Red Flags Guide / Checklist (S1 guide, 5 emails, 14 days)
    //   KIT_TAG_ENGINE_INTEREST    -> Decision Engine interest (S1 mid-funnel nurture)
    //
    // ---- Segment 2/3: Independent Business Owner Lead Gen Tools ----
    //   KIT_TAG_GAP_INTEREST       -> Gap Analyzer interest / business ops tools
    //   KIT_TAG_PLAYBOOK_INTEREST  -> Systems Playbook interest
    //   KIT_TAG_SPRINT_INTEREST    -> Implementation Sprint interest
    //
    // ---- Buyer Tags (applied by Zapier after Stripe payment confirmed) ----
    //   KIT_TAG_FDD_BUYER          -> FDD Analyzer $97 purchase
    //   KIT_TAG_ENGINE_BUYER       -> Decision Engine $297 purchase
    //   KIT_TAG_BUNDLE_BUYER       -> Bundle $897 purchase
    //   KIT_TAG_EXPERT_BUYER       -> Expert Review $697 purchase
    //   KIT_TAG_GAP_BUYER          -> Gap Analyzer $97 purchase
    //   KIT_TAG_PLAYBOOK_BUYER     -> Systems Playbook $297 purchase
    //   KIT_TAG_SPRINT_BUYER       -> Implementation Sprint $697 purchase
    //
    const TAG_MAP = {
        // Segment 1 - Franchise Buyer tools
        'scorecard':                process.env.KIT_TAG_SCORECARD || '',
        'calculator':               process.env.KIT_TAG_CALCULATOR || '',
        'comparison':               process.env.KIT_TAG_CALCULATOR || '',
        'negotiation':              process.env.KIT_TAG_CALCULATOR || '',
        'validation':               process.env.KIT_TAG_CALCULATOR || '',
        'red-flags-guide':          process.env.KIT_TAG_LEAD_MAGNET || '',
        'red-flags-checklist':      process.env.KIT_TAG_LEAD_MAGNET || '',
        'red-flag-quiz':            process.env.KIT_TAG_QUIZ || '',
        'decision-engine':          process.env.KIT_TAG_ENGINE_INTEREST || '',
        // Segment 2/3 - Independent Business Owner tools
        'gap-analyzer':             process.env.KIT_TAG_GAP_INTEREST || '',
        'operations-assessment':    process.env.KIT_TAG_GAP_INTEREST || '',
        'business-scorecard-s23':   process.env.KIT_TAG_GAP_INTEREST || '',
        'systems-playbook':         process.env.KIT_TAG_PLAYBOOK_INTEREST || '',
        'implementation-sprint':    process.env.KIT_TAG_SPRINT_INTEREST || '',
        'independent-systems':      process.env.KIT_TAG_GAP_INTEREST || '',
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
