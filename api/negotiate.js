const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scenario, history, userMessage, token } = req.body;

  if (!scenario || !userMessage) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // TODO: Add Stripe verification for $297 tier when launched
  // For now, allow demo mode with limited turns

  const truncatedMessage = (typeof userMessage === 'string') ? userMessage.substring(0, 3000) : '';

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      reply: null
    });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const scenarioPrompts = {
      territory: {
        role: 'VP of Franchise Development',
        context: 'The prospective franchisee wants exclusive territory protection. The FDD currently offers a "protected area" of only a 3-mile radius with significant carve-outs (online sales, catering, non-traditional venues). The franchisor recently started selling through delivery apps that overlap territories.',
        personality: 'Confident, polished, slightly evasive. You deflect direct questions about territory encroachment with phrases like "our system is designed for mutual success." You mention that "no franchisee has complained about online sales overlap." You are willing to make small concessions (expanding from 3 to 5 miles) but push back hard on delivery app exclusivity. You will NOT agree to full territory exclusivity — that is a dealbreaker for corporate.',
        coachingFocus: 'Territory negotiation tactics, identifying weak language in FDD, using Item 12 data as leverage'
      },
      fees: {
        role: 'Director of Franchise Operations',
        context: 'The prospective franchisee is pushing back on uncapped technology fees ($250/month currently, but FDD allows unlimited increases with 30 days notice), mandatory vendor requirements (bookkeeping at $400-600/month), and a 6% royalty with $125/week minimum floor. Total ongoing fees represent approximately 18-22% of gross revenue.',
        personality: 'Matter-of-fact, data-driven. You justify fees by pointing to "system-wide averages" and "value of the brand." You claim the technology fee has "only increased once in 3 years." You are willing to discuss a fee cap for the first 2 years but push back on permanent caps. You will NOT reduce the royalty rate. You get mildly defensive if the franchisee implies the fees are excessive.',
        coachingFocus: 'Fee negotiation strategies, understanding total cost burden, using Item 6 and Item 7 analysis'
      },
      exit: {
        role: 'General Counsel for the franchise system',
        context: 'The prospective franchisee is concerned about exit terms. The FDD includes: 2-year non-compete with 25-mile radius post-termination, $15,000 transfer fee, right of first refusal on any sale, franchisor approval required for any buyer (with vague "reasonable" criteria), and de-identification costs estimated at $10,000-$25,000. Termination can be triggered by 2 defaults in 12 months regardless of cure.',
        personality: 'Legalistic, measured, precise with language. You explain everything as "standard in the industry" and "protecting the integrity of the brand." You are somewhat rigid but can be moved on specific points like reducing the non-compete radius or clarifying buyer approval criteria. You will NOT remove the right of first refusal or change the termination triggers. You speak in careful, qualified statements.',
        coachingFocus: 'Exit term negotiation, understanding termination triggers, protecting resale value'
      },
      renewal: {
        role: 'Senior VP of Franchise Relations',
        context: 'The prospective franchisee is negotiating renewal terms. The FDD states: 10-year initial term with a renewal option, but renewal requires signing the "then-current" franchise agreement (which could have materially different terms), paying a $10,000 renewal fee, completing remodel to current standards (estimated $50K-$100K), and being in "good standing" (vaguely defined). No guarantee that renewal terms will match original agreement.',
        personality: 'Warm and personable but vague on specifics. You say things like "we value our long-term partners" and "renewal has always been smooth." You avoid committing to specific renewal terms. You can be pushed to define "good standing" more precisely and to cap the remodel requirements. You will NOT lock in current agreement terms for renewal.',
        coachingFocus: 'Renewal negotiation, protecting long-term investment, identifying vague language risks'
      },
      item19: {
        role: 'CFO of the franchise system',
        context: 'The franchisee is questioning the financial performance representations in Item 19. The FDD shows average gross revenue of $480K but does not break out expenses, net income, or owner compensation. Median is notably absent. The footnotes reveal the average is pulled from only the top 60% of locations (bottom 40% excluded). The FDD also notes that "results vary materially by location, management, and market conditions."',
        personality: 'Numbers-oriented but selective with data. You emphasize the $480K average and say "our top performers do significantly better." You dodge questions about median income and owner take-home pay. You get uncomfortable when pressed on why bottom 40% are excluded. You can be pushed to share more context about expense ratios but will NOT provide net income data or admit the average is misleading.',
        coachingFocus: 'Financial analysis, Item 19 interpretation, identifying misleading averages, asking for data behind the data'
      }
    };

    const sc = scenarioPrompts[scenario] || scenarioPrompts.territory;

    const systemPrompt = `You are roleplaying as the ${sc.role} of a franchise company in a negotiation simulation designed to train prospective franchise buyers.

SCENARIO CONTEXT:
${sc.context}

YOUR CHARACTER:
${sc.personality}

RULES:
1. Stay in character at all times. You are the franchise representative.
2. Be realistic — real franchise reps are trained negotiators. Don't cave easily.
3. Use the specific numbers and terms from the scenario context in your responses.
4. Keep responses concise (2-4 sentences typically, up to 6 for complex points).
5. Occasionally use real franchise industry language and tactics.
6. If the prospective franchisee makes a STRONG point backed by data or FDD specifics, acknowledge it and make a small concession — but always get something in return.
7. If the prospective franchisee is vague or emotional, deflect professionally.
8. Do NOT break character to give coaching tips — stay fully in the role.
9. Respond ONLY with your in-character dialogue. No stage directions, no parentheticals.
10. If the user seems to be wrapping up or says something conclusive, respond naturally and end with something like asking if they'd like to schedule a follow-up or next step.

Remember: Your job is to give the buyer realistic practice. Make them EARN every concession.`;

    // Build conversation history for multi-turn
    const messages = [];
    if (history && Array.isArray(history)) {
      history.slice(-10).forEach(h => { // Keep last 10 exchanges to manage context
        messages.push({ role: h.role, content: h.content });
      });
    }
    messages.push({ role: 'user', content: truncatedMessage });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: messages,
      system: systemPrompt,
      temperature: 0.7
    });

    const reply = response.content[0].text.trim();

    return res.status(200).json({ reply, scenario });

  } catch (error) {
    console.error('Negotiation sim error:', error);
    return res.status(500).json({
      error: 'Simulation error',
      reply: "I apologize, but I need to step away for a moment. Let's continue this conversation shortly."
    });
  }
};
