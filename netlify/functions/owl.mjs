// Wise Owl: the customer chat on wisesprinklers.com.
// POST /owl-chat  { messages: [{role:'user'|'assistant', content:'...'}] }  ->  { reply, quote_saved }
// Needs ANTHROPIC_API_KEY in Netlify env. OWL_MODEL overrides the model.
import Anthropic from '@anthropic-ai/sdk';

export const config = { path: '/owl-chat' };

const MODEL = process.env.OWL_MODEL || 'claude-haiku-5-5';
const MAX_TURNS = 30;        // messages per conversation
const MAX_CHARS = 1200;      // per visitor message

const SYSTEM = `You are "Wise Owl", the friendly chat helper on the website of Wise Sprinklers & Lighting.

ABOUT THE BUSINESS
- Family-owned, 20+ years, led by a Texas Licensed Irrigator. Licensed & insured. Based in Friendswood, TX.
- Serves Brazoria, Galveston and Harris Counties (Texas Gulf Coast).
- Phone: 281-910-4283. Email: nathan@wisesprinklers.com. Owner contact: Nathan.
- Free on-site estimates. The team reaches out the same day after a request.

SERVICES
1. Sprinkler Installation & Upgrades: custom irrigation designed for full coverage, water efficiency and long-term reliability.
2. Sprinkler Repair & Diagnostics: broken heads, leaking valves, backflow, controller faults.
3. Engineered Drainage: French drains, channel drains, catch basins that end standing water.
4. Landscape Lighting: professional LED design and installation for curb appeal and safety.
5. Christmas Lighting: custom-fit C9 LED installs, with maintenance, takedown and storage included.
6. Wise Care Maintenance Plans: seasonal tune-ups, priority scheduling and inspections for sprinklers and/or landscape lighting. Bundle both (Wise Care Bundle) to save.

HOW TO BEHAVE
- Warm, plain-spoken, a little owl charm ("Hoo!") at most once per conversation. Keep replies short: 1-3 sentences, or a short list.
- Only talk about this business, its services and general yard care related to them. Politely steer anything else back.
- Never quote prices, discounts or specific appointment dates. Say pricing depends on the property and the free estimate covers it.
- Don't invent facts (hours, warranties, brands, permits). If unsure, offer the phone number or a free estimate.
- When someone wants an estimate, quote, visit or callback: ask for their name, a phone number or email, the service, and (optionally) their address or city and a short note. Ask only for what is missing, a question or two at a time. Once you have a name plus a phone or email, confirm the details back and call the request_quote tool. After it succeeds, tell them the team will reach out the same day.
- For emergencies (a burst line, flooding) tell them to call 281-910-4283 right away.`;

const TOOLS = [{
  name: 'request_quote',
  description: 'Send a free-estimate request to the Wise Sprinklers team. Call only after the visitor has given a name and a phone or email and confirmed they want to be contacted.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'phone', 'email', 'service', 'address', 'notes'],
    properties: {
      name: { type: 'string' },
      phone: { type: 'string', description: 'Empty string if not given' },
      email: { type: 'string', description: 'Empty string if not given' },
      service: { type: 'string', enum: ['Sprinkler Installation & Upgrades', 'Sprinkler Repair & Diagnostics', 'Engineered Drainage', 'Landscape Lighting', 'Christmas Lighting', 'Wise Care Maintenance Plan', 'Other'] },
      address: { type: 'string', description: 'Address or city, empty string if not given' },
      notes: { type: 'string', description: 'Short summary of what they need' },
    },
  },
}];


// Demo mode: on preview builds with no API key, answer from a short script
// so the owl can be shown off. Never saves anything. Production never uses it.
const DEMO_ON = !process.env.ANTHROPIC_API_KEY && process.env.CONTEXT !== 'production';
const DEMO = [
  [/(estimate|quote|price|cost|how much|book|appointment|visit|schedule)/i, "Happy to set that up! Pricing depends on your property, so every job starts with a free on-site estimate. What's your name, and the best phone or email to reach you?"],
  [/(\d{3}\D?\d{3}\D?\d{4}|@)/, "Thanks! In the live version I'd send this straight to the Wise Sprinklers team, and they'd reach out the same day. (This is a demo, so nothing was sent.)"],
  [/(drain|water pool|standing water|flood|soggy|puddle)/i, "Hoo! Standing water usually means you need a French drain, channel drain or catch basin. Our engineered drainage fixes it for good. Want a free estimate?"],
  [/(repair|broken|leak|not working|head|valve|controller|backflow)/i, "We fix broken heads, leaking valves, backflow and controller problems, and we get it right the first time. Want me to set up a visit?"],
  [/(install|new system|upgrade|sprinkler|irrigation)/i, "We design custom sprinkler systems for full coverage and water savings, led by a Texas Licensed Irrigator. Want a free estimate?"],
  [/(christmas|holiday|xmas)/i, "Our Christmas lighting uses custom-fit C9 LEDs, and install, maintenance, takedown and storage are all included. Want to get on the schedule?"],
  [/(light|lighting|landscape light)/i, "Our LED landscape lighting adds curb appeal and safety after dark. We handle the design and the install. Want a free estimate?"],
  [/(wise care|maintenance|plan|tune)/i, "Wise Care plans include seasonal tune-ups and priority scheduling for your sprinklers, your lighting, or both. Bundling both saves more."],
  [/(area|serve|city|county|where|league city|pearland|friendswood|houston|galveston)/i, "We serve Brazoria, Galveston and Harris Counties from Friendswood, TX. Want a free estimate?"],
  [/(hi|hello|hey)\b/i, "Hoo! Hi there. I can answer questions about sprinklers, drainage, landscape lighting and Christmas lights, or set up a free estimate."],
];
function demoReply(text) {
  for (const [re, reply] of DEMO) if (re.test(text)) return reply;
  return "Good question! Our team can answer that best. Call 281-910-4283, or I can set up a free estimate for you.";
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const FALLBACK = "Sorry, I'm having trouble right now. Please call us at 281-910-4283 or use the estimate form on this page.";

async function saveQuote(input, origin) {
  if (!input.name || (!input.phone && !input.email)) return { ok: false, error: 'Need a name and a phone or email.' };
  const r = await fetch(new URL('/api/appointments', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: input.name, phone: input.phone || null, email: input.email || null,
      service: input.service, address: input.address || null,
      notes: `[Wise Owl chat] ${input.notes || ''}`.trim(),
    }),
  });
  return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (DEMO_ON) {
    const last = [...(body.messages || [])].reverse().find((m) => m && m.role === 'user');
    return json({ reply: demoReply(String(last?.content || '').slice(0, MAX_CHARS)), demo: true });
  }
  if (!process.env.ANTHROPIC_API_KEY) return json({ reply: FALLBACK, error: 'not configured' }, 503);
  const history = Array.isArray(body.messages) ? body.messages : [];
  if (!history.length || history.length > MAX_TURNS) return json({ reply: "We've covered a lot! For anything else, please call 281-910-4283." });

  // Keep only plain text turns, starting with the visitor.
  const messages = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'last message must be from user' }, 400);

  const client = new Anthropic();
  const origin = new URL(req.url).origin;
  let quoteSaved = false;

  try {
    for (let i = 0; i < 3; i++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
      });
      if (res.stop_reason === 'refusal') return json({ reply: "I can only help with questions about our sprinkler, drainage and lighting services. For anything else, call 281-910-4283." });

      const uses = res.content.filter((b) => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || !uses.length) {
        const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        return json({ reply: reply || FALLBACK, quote_saved: quoteSaved });
      }

      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const u of uses) {
        let out;
        try { out = u.name === 'request_quote' ? await saveQuote(u.input, origin) : { ok: false, error: 'unknown tool' }; }
        catch (e) { out = { ok: false, error: String(e?.message || e) }; }
        if (out.ok) quoteSaved = true;
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out), is_error: !out.ok });
      }
      messages.push({ role: 'user', content: results });
    }
    return json({ reply: FALLBACK, quote_saved: quoteSaved });
  } catch (e) {
    console.error('owl error', e?.status, e?.message);
    return json({ reply: FALLBACK, quote_saved: quoteSaved }, 502);
  }
};
