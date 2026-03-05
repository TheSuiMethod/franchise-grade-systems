const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { answers, token } = req.body || {};

  if (!token || !answers) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Basic token format check (not cryptographic -- access already verified at gate)
  if (!token.startsWith('Z2Fw')) { // base64 of 'gap'
    return res.status(403).json({ error: 'Invalid access token' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Analysis service not configured' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a franchise operations expert analyzing an independent business owner's operational systems. You have deep expertise in what separates businesses that scale from businesses that stall, and you've seen how franchise systems create operational infrastructure that most independent owners never build.

The business owner has answered a detailed intake questionnaire. Analyze their responses and generate a comprehensive Operations Gap Analysis Report.

BUSINESS INTAKE DATA:
${JSON.stringify(answers, null, 2)}

Generate a detailed Operations Gap Analysis Report in valid JSON format with this exact structure:

{
  "business_summary": "2-3 sentence summary of the business and its current operational stage",
  "overall_score": <integer 0-100>,
  "overall_rating": "<one of: Critical, Needs Work, Developing, Solid, Franchise-Grade>",
  "categories": [
    {
      "name": "<category name>",
      "score": <integer 0-100>,
      "rating": "<Critical | Needs Work | Developing | Solid | Franchise-Grade>",
      "gap_summary": "<1-2 sentence description of the specific gap>",
      "franchise_standard": "<What a franchise system would require in this area>",
      "top_action": "<The single most important thing to fix in this category>"
    }
  ],
  "priority_actions": [
    {
      "rank": 1,
      "category": "<category name>",
      "action": "<Specific, concrete action to take>",
      "why": "<Why this is the highest priority>",
      "time_estimate": "<Realistic time estimate to implement, e.g. '2-3 hours' or '1 week'>",
      "impact": "<high | medium | low>"
    }
  ],
  "ninety_day_roadmap": {
    "month_1": {
      "focus": "<Theme for month 1>",
      "actions": ["<action 1>", "<action 2>", "<action 3>"]
    },
    "month_2": {
      "focus": "<Theme for month 2>",
      "actions": ["<action 1>", "<action 2>", "<action 3>"]
    },
    "month_3": {
      "focus": "<Theme for month 3>",
      "actions": ["<action 1>", "<action 2>", "<action 3>"]
    }
  },
  "franchise_comparison": "<2-3 sentence analysis of how this business compares to franchise standards and what the biggest structural difference is>",
  "analyst_note": "<A direct, honest 2-3 sentence observation about the single most important thing this business owner needs to understand about their operational situation>"
}

Categories to score (use exactly these names):
1. Customer Experience
2. Financial Systems
3. Team and Hiring
4. Operations SOPs
5. Marketing Systems
6. Technology Stack
7. Quality Control
8. Growth Readiness

Include exactly 5 priority actions, ranked by impact and urgency. Be specific and actionable. Do not use generic advice. Tailor everything to the specific business type, industry, and inputs provided.

Respond with only valid JSON. No preamble, no explanation, no markdown code fences.`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    const rawText = message.content[0]?.text || '';

    let analysis;
    try {
      analysis = JSON.parse(rawText);
    } catch (parseErr) {
      // Attempt to extract JSON if wrapped in any extra content
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
      } else {
        throw new Error('Failed to parse analysis output');
      }
    }

    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    console.error('Gap analysis error:', err.message);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
};
