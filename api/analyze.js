const Stripe = require('stripe');
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, itemNum, text, prompt } = req.body;

  // Validate inputs
  if (!token || !itemNum || !text || !prompt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (typeof text !== 'string' || text.length < 20) {
    return res.status(400).json({ error: 'Text too short for analysis' });
  }

  // Cap input length to prevent abuse (50K chars per item is generous)
  const truncatedText = text.substring(0, 50000);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // Verify the session is still valid
    const session = await stripe.checkout.sessions.retrieve(token, {
      expand: ['payment_intent']
    });

    if (session.payment_status !== 'paid') {
      return res.status(403).json({ error: 'Payment not verified' });
    }

    if (session.payment_intent?.metadata?.analyzed === 'true') {
      return res.status(403).json({ error: 'Analysis already completed' });
    }

    // Call Claude API
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are a franchise due diligence expert with 20+ years of experience analyzing Franchise Disclosure Documents. You have deep knowledge of FTC Franchise Rule (16 CFR Parts 436 and 437), NASAA franchise examination guidelines, SBA franchise lending data, and IFA industry statistics.

Your job is to protect prospective franchise buyers by identifying risks, hidden costs, and red flags in FDD documents. You are thorough, specific, and practical. You never sugarcoat.

CRITICAL RULES:
1. Always ground findings in specific text from the provided FDD excerpt
2. Reference industry benchmarks, FTC data, NASAA guidelines, or IFA statistics where relevant
3. Every red flag must include a specific question the buyer should ask the franchisor
4. Be alert to common FDD traps: uncapped fee increases, minimum payment floors, mandatory vendor lock-in, vague territory definitions, unreasonable termination triggers, and missing financial performance data
5. Flag what is MISSING or NOT DISCLOSED as aggressively as what IS disclosed — omissions are often more dangerous than bad terms
6. Do not provide legal advice — provide factual analysis and questions to discuss with a franchise attorney

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON array. No markdown, no explanation, no preamble. Just the JSON array.
Each object in the array must have exactly three fields:
- "severity": "red" or "yellow" or "green"
- "finding": A clear, specific, plain-English explanation of what you found (2-4 sentences)
- "question": A specific question the buyer should ask the franchisor about this finding

Example:
[{"severity":"red","finding":"The technology fee has no stated maximum and can be increased with only 30 days written notice. Per IFA data, uncapped technology fees are among the most common sources of unexpected cost increases for franchisees.","question":"What has the technology fee been for each of the last 3 years, and what is the contractual maximum it can be increased to?"}]

Return between 2-6 findings per item, prioritizing the most significant risks. Always include at least one finding even if the item appears standard — explain WHY it's standard.`;

    const userMessage = `Analyze the following FDD Item ${itemNum} text for a prospective franchise buyer.

${prompt}

--- FDD TEXT START ---
${truncatedText}
--- FDD TEXT END ---

Respond with ONLY a valid JSON array of findings. No other text.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
      temperature: 0.3 // Low temperature for consistency
    });

    // Parse the response
    let findings;
    try {
      const responseText = response.content[0].text.trim();
      // Handle potential markdown code block wrapping
      const cleaned = responseText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      findings = JSON.parse(cleaned);

      // Validate structure
      if (!Array.isArray(findings)) {
        throw new Error('Response is not an array');
      }

      findings = findings.filter(f =>
        f && typeof f === 'object' &&
        ['red', 'yellow', 'green'].includes(f.severity) &&
        typeof f.finding === 'string' &&
        typeof f.question === 'string'
      ).slice(0, 8); // Max 8 findings per item

      if (findings.length === 0) {
        throw new Error('No valid findings parsed');
      }
    } catch (parseError) {
      console.error('Parse error:', parseError, 'Raw:', response.content[0].text);
      // Fallback: return a generic analysis note
      findings = [{
        severity: 'yellow',
        finding: 'The AI analysis could not fully parse this section. The text may contain formatting that requires manual review. We recommend having a franchise attorney review this item directly.',
        question: 'Can you provide a clean, plain-text version of this FDD item for review?'
      }];
    }

    return res.status(200).json({ findings });

  } catch (error) {
    console.error('Analysis error:', error);

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(403).json({ error: 'Invalid session' });
    }

    return res.status(500).json({
      error: 'Analysis failed',
      findings: [{
        severity: 'yellow',
        finding: 'This item could not be analyzed due to a temporary service issue. Please try again or consult a franchise attorney for review of this section.',
        question: 'N/A — retry analysis or consult an attorney.'
      }]
    });
  }
};
