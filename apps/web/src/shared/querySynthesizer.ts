/**
 * querySynthesizer.ts
 *
 * Domain-agnostic query distillation and search term synthesis.
 * Strips conversational filler, command imperatives, and artifact directives
 * (e.g. "create a pie chart for...", "and it should also show...")
 * to produce clean, high-precision search keywords for search engines.
 */

// Action verbs used when directing the assistant
const ACTION_VERBS = [
  'create',
  'generate',
  'build',
  'make',
  'draw',
  'plot',
  'render',
  'write',
  'code',
  'design',
  'craft',
  'develop',
  'produce',
  'show(?:\\s+me)?',
  'give(?:\\s+me)?',
  'tell(?:\\s+me)?(?:\\s+about)?',
  'explain(?:\\s+to\\s+me)?',
  'find(?:\\s+out)?(?:\\s+about)?',
  'look\\s*up',
  'search(?:\\s+(?:the\\s+)?(?:web|internet|online))?(?:\\s+for)?',
  'summarize',
  'compare',
  'analyze',
  'provide',
].join('|');

// Visual artifacts or document forms requested by the user
const ARTIFACT_TERMS = [
  '(?:a|an|the)?\\s*(?:pie\\s*chart|donut\\s*chart|bar\\s*(?:chart|graph)|line\\s*(?:chart|graph)|scatter\\s*plot|radar\\s*chart|quadrant\\s*chart|timeline|treemap)',
  '(?:a|an|the)?\\s*(?:architecture\\s*(?:diagram|map)|sequence\\s*diagram|flowchart|flow\\s*chart|diagram|schema|topology|visual|graphic|illustration|infographic)',
  '(?:a|an|the)?\\s*(?:presentation|slide\\s*deck|slides?|ppt|powerpoint|pitch\\s*deck)',
  '(?:a|an|the)?\\s*(?:comparison\\s*table|table|matrix|breakdown|overview|summary|report|whitepaper)',
  '(?:a|an|the)?\\s*(?:python\\s*script|script|code\\s*snippet|code|program|component|svg)',
].join('|');

// Subordinate conversational clauses and formatting instructions
const SUBORDINATE_CLAUSE_REGEX =
  /(?:\s+(?:and\s+)?(?:it\s+should|it\s+must|make\s+sure\s+to|be\s+sure\s+to|ensure\s+to|please\s+include|also\s+show|and\s+show|and\s+tell\s+me|and\s+also\s+how|and\s+how|and\s+explain|focusing\s+on|with\s+details\s+on|in\s+the\s+format\s+of|as\s+a\s+table|as\s+a\s+chart|in\s+detail|in\s+full\s+detail|step\s+by\s+step|for\s+me|with\s+images|with\s+photos)[\s\S]*)$/i;

// Leading conversational politeness and request phrasing
const LEADING_POLITENESS_REGEX =
  /^(?:(?:can|could|would)\s+you\s+(?:please\s+)?(?:help\s+me\s+)?(?:to\s+)?|please\s+|kindly\s+|i\s+want\s+you\s+to\s+|i\s+need\s+(?:you\s+to\s+)?|help\s+me\s+(?:to\s+)?)+/i;

// Direct command prefix combining action verb + artifact term
const COMMAND_ARTIFACT_PREFIX_REGEX = new RegExp(
  `^(?:${ACTION_VERBS})\\s+(?:${ARTIFACT_TERMS})\\s*(?:of|for|about|on|showing|depicting|illustrating|regarding|with)?\\s*`,
  'i'
);

// Generic action verb prefix (e.g. "search for ...", "tell me about ...", "explain ...")
const GENERIC_ACTION_PREFIX_REGEX = new RegExp(
  `^(?:${ACTION_VERBS})\\s+(?:(?:to|about|for|on|into)\\s+)?`,
  'i'
);

/**
 * Distills a raw user prompt into a concise, high-relevance search query.
 * Strips instructional noise, conversational pleasantries, and artifact requests.
 */
export function distillSearchQuery(rawPrompt: string): string {
  if (!rawPrompt || typeof rawPrompt !== 'string') return '';

  let text = rawPrompt.trim();

  // 1. Strip common slash commands
  text = text.replace(/^\/(?:web|search|deep|image|img|research)\s+/i, '');

  // 2. Strip leading greetings
  text = text.replace(
    /^(?:hello|hi|hey|greetings|good\s+(?:morning|afternoon|evening)|yo|sup)[\s,!.:\-]+/i,
    ''
  );

  // 3. Strip leading politeness phrasing ("can you please", "i want you to", etc.)
  text = text.replace(LEADING_POLITENESS_REGEX, '').trim();

  // 4. Strip command + artifact directives (e.g. "create a pie chart for", "draw a diagram of")
  text = text.replace(COMMAND_ARTIFACT_PREFIX_REGEX, '').trim();

  // 5. If still starts with generic action verb ("search for", "find out about", etc.)
  text = text.replace(GENERIC_ACTION_PREFIX_REGEX, '').trim();

  // 6. Strip subordinate instructional clauses attached at the end
  // E.g. "and it should also show on each country what are the majority religions" -> extract the core topic if present
  const clauseMatch = text.match(SUBORDINATE_CLAUSE_REGEX);
  if (clauseMatch && clauseMatch.index !== undefined) {
    const mainPart = text.substring(0, clauseMatch.index).trim();
    const clausePart = clauseMatch[0].trim();

    // Check if the subordinate clause contains valuable topical keywords
    const extractedClauseTopic = clausePart
      .replace(
        /^(?:and\s+)?(?:it\s+should|it\s+must|make\s+sure\s+to|be\s+sure\s+to|ensure\s+to|please\s+include|also\s+show|and\s+show|and\s+tell\s+me|and\s+also\s+how|and\s+how|and\s+explain)\s+(?:also\s+)?(?:show|include|tell|explain)?\s*(?:on|about|for)?\s*/i,
        ''
      )
      .replace(
        /\s*(?:in\s+detail|in\s+full\s+detail|step\s+by\s+step|for\s+me|with\s+images|with\s+photos)[?.!]*$/i,
        ''
      )
      .replace(/^(?:what\s+are\s+the|what\s+is\s+the|how\s+are\s+the)\s+/i, '')
      .trim();

    if (mainPart.length >= 8) {
      if (
        extractedClauseTopic.length > 5 &&
        extractedClauseTopic.length < 50 &&
        !mainPart.toLowerCase().includes(extractedClauseTopic.toLowerCase())
      ) {
        text = `${mainPart} ${extractedClauseTopic}`.trim();
      } else {
        text = mainPart;
      }
    } else if (extractedClauseTopic.length >= 5) {
      text = extractedClauseTopic;
    }
  }

  // 7. Strip dangling prepositions or filler at start/end
  text = text
    .replace(/^(?:of|for|about|on|regarding|showing)\s+/i, '')
    .replace(/\s+(?:in\s+detail|in\s+full\s+detail|please|for\s+me)[?.!]*$/i, '')
    .replace(/[?.!]+$/g, '')
    .trim();

  // 8. Fallback: if all text was stripped or remaining text is trivial (< 3 chars)
  if (!text || text.length < 3) {
    const sanitizedRaw = rawPrompt
      .replace(/^\/(?:web|search|deep|image|img|research)\s+/i, '')
      .replace(
        /^(?:hello|hi|hey|greetings|good\s+(?:morning|afternoon|evening)|yo|sup)[\s,!.:\-]+/i,
        ''
      )
      .replace(LEADING_POLITENESS_REGEX, '')
      .trim();
    text = sanitizedRaw;
  }

  // 9. Cap length: search engines perform best with <= 12 terms (max ~120 characters)
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length > 12) {
    text = tokens.slice(0, 12).join(' ');
  }
  if (text.length > 120) {
    text = text
      .substring(0, 120)
      .replace(/\s+\S*$/, '')
      .trim();
  }

  return text;
}
