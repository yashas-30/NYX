/**
 * @file src/features/coder/utils/promptAnalyzer.ts
 * @description Client-side prompt analysis engine that detects programming languages,
 * classifies user intent, scores complexity, and gates non-code prompts.
 * Runs entirely client-side with zero API cost.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type PromptIntent =
  | 'generate'   // Build something from scratch
  | 'refactor'   // Improve/restructure existing code
  | 'debug'      // Fix a bug or error
  | 'explain'    // Explain a concept or code
  | 'convert'    // Translate between languages
  | 'optimize'   // Make faster or more efficient
  | 'review'     // Code review & best practices
  | 'integrate'  // Connect APIs, libraries, services
  | 'test'       // Write tests
  | 'deploy'     // Deployment, CI/CD, infrastructure
  | 'general';   // General code-related question

export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex' | 'enterprise';

export interface PromptAnalysis {
  detectedLanguages: string[];
  primaryLanguage: string | null;
  intent: PromptIntent;
  complexity: ComplexityLevel;
  frameworks: string[];
  keywords: string[];
  summary: string;
  isCodeRelated: boolean;
}

// ── Language Detection ───────────────────────────────────────────────────────

interface LangSignature {
  id: string;
  name: string;
  codeBlockTags: string[];
  extensions: RegExp[];
  keywords: RegExp[];
  frameworkHints: RegExp[];
}

const LANG_SIGNATURES: LangSignature[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    codeBlockTags: ['typescript', 'ts', 'tsx'],
    extensions: [/\.tsx?/i],
    keywords: [/\binterface\s+\w+/i, /\btype\s+\w+\s*=/i, /\benum\s+/i, /\bas\s+\w+/i, /:\s*(string|number|boolean|any|unknown|void|never)\b/i, /\bReadonly</i, /\bPartial</i, /\bRecord</i, /\bgenerics?\b/i],
    frameworkHints: [/\bnext\.?js\b/i, /\bangular\b/i, /\bnestjs\b/i, /\btrpc\b/i, /\bzod\b/i, /\bprisma\b/i, /\bdrizzle\b/i]
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    codeBlockTags: ['javascript', 'js', 'jsx', 'node'],
    extensions: [/\.jsx?/i, /\.mjs/i, /\.cjs/i],
    keywords: [/\bconst\s+\w+\s*=/i, /\blet\s+\w+\s*=/i, /\bfunction\s+\w+/i, /=>\s*[{(]/i, /\bconsole\.log/i, /\brequire\s*\(/i, /\bimport\s+/i, /\bexport\s+(default\s+)?/i, /\bdocument\.\w+/i],
    frameworkHints: [/\breact\b/i, /\bvue\b/i, /\bsvelte\b/i, /\bexpress\b/i, /\bfastify\b/i, /\bhono\b/i, /\bnode\.?js\b/i, /\bvite\b/i, /\bwebpack\b/i, /\bjquery\b/i, /\bd3\.?js\b/i, /\bthree\.?js\b/i]
  },
  {
    id: 'python',
    name: 'Python',
    codeBlockTags: ['python', 'py', 'python3'],
    extensions: [/\.py/i, /\.pyx/i],
    keywords: [/\bdef\s+\w+\s*\(/i, /\bclass\s+\w+/i, /\bimport\s+\w+/i, /\bfrom\s+\w+\s+import/i, /\bprint\s*\(/i, /\bself\.\w+/i, /\b__init__/i, /\bif\s+__name__/i, /\basync\s+def\b/i, /\bpip\s+install\b/i, /\bpython3?\b/i],
    frameworkHints: [/\bdjango\b/i, /\bflask\b/i, /\bfastapi\b/i, /\bpydantic\b/i, /\bpandas\b/i, /\bnumpy\b/i, /\bpytest\b/i, /\bcelery\b/i, /\btensorflow\b/i, /\bpytorch\b/i, /\bstreamlit\b/i, /\blangchain\b/i, /\bscikit[-_]learn\b/i]
  },
  {
    id: 'rust',
    name: 'Rust',
    codeBlockTags: ['rust', 'rs'],
    extensions: [/\.rs/i],
    keywords: [/\bfn\s+\w+/i, /\blet\s+mut\b/i, /\bimpl\s+/i, /\bstruct\s+\w+/i, /\benum\s+\w+/i, /\btrait\s+\w+/i, /\bpub\s+(fn|struct|enum|mod)\b/i, /\buse\s+\w+::/i, /\bmatch\s+\w+/i, /\bcargo\b/i, /\bResult</i, /\bOption</i, /::new\(\)/i],
    frameworkHints: [/\btokio\b/i, /\bactix[-_]?web\b/i, /\baxum\b/i, /\brooket\b/i, /\bserde\b/i, /\btauri\b/i, /\bbevy\b/i, /\bwasm[-_]?bindgen\b/i]
  },
  {
    id: 'go',
    name: 'Go',
    codeBlockTags: ['go', 'golang'],
    extensions: [/\.go/i],
    keywords: [/\bfunc\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/i, /\bpackage\s+\w+/i, /\bimport\s*\(/i, /\bgo\s+func/i, /\bchan\s+/i, /\bgoroutine/i, /\bdefer\s+/i, /\b:=\b/i, /\bfmt\.\w+/i, /\berr\s*!=\s*nil/i],
    frameworkHints: [/\bgin\b/i, /\becho\b/i, /\bfiber\b/i, /\bchi\b/i, /\bgrpc\b/i, /\bgorm\b/i]
  },
  {
    id: 'java',
    name: 'Java',
    codeBlockTags: ['java'],
    extensions: [/\.java/i],
    keywords: [/\bpublic\s+class\b/i, /\bprivate\s+\w+\s+\w+/i, /\bSystem\.out\.print/i, /\bString\[\]/i, /\bvoid\s+main/i, /\bnew\s+\w+\(/i, /\bimplements\s+/i, /\bextends\s+/i, /\b@Override\b/i, /\b@Autowired\b/i],
    frameworkHints: [/\bspring\s*boot\b/i, /\bhibernate\b/i, /\bmaven\b/i, /\bgradle\b/i, /\bquarkus\b/i, /\bmicronaut\b/i, /\bjunit\b/i]
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    codeBlockTags: ['kotlin', 'kt'],
    extensions: [/\.kt/i, /\.kts/i],
    keywords: [/\bfun\s+\w+\s*\(/i, /\bval\s+\w+/i, /\bvar\s+\w+/i, /\bdata\s+class\b/i, /\bsealed\s+class\b/i, /\bsuspend\s+fun\b/i, /\bobject\s+\w+/i, /\bcompanion\s+object\b/i, /\bwhen\s*\(/i],
    frameworkHints: [/\bktor\b/i, /\bjetpack\s*compose\b/i, /\bkoroutines?\b/i, /\bandroid\b/i, /\bkmm\b/i]
  },
  {
    id: 'c',
    name: 'C',
    codeBlockTags: ['c'],
    extensions: [/\.c$/i, /\.h$/i],
    keywords: [/\b#include\s*</i, /\bint\s+main\s*\(/i, /\bprintf\s*\(/i, /\bmalloc\s*\(/i, /\bfree\s*\(/i, /\bsizeof\s*\(/i, /\btypedef\s+struct\b/i, /\bvoid\s*\*/i, /\bstdio\.h\b/i, /\bstdlib\.h\b/i],
    frameworkHints: [/\bSDL2?\b/i, /\bOpenGL\b/i, /\bposix\b/i, /\bpthread/i]
  },
  {
    id: 'cpp',
    name: 'C++',
    codeBlockTags: ['cpp', 'c++', 'cxx'],
    extensions: [/\.cpp/i, /\.cxx/i, /\.cc/i, /\.hpp/i],
    keywords: [/\bstd::/i, /\bnamespace\s+\w+/i, /\bclass\s+\w+\s*[:{]/i, /\btemplate\s*</i, /\bcout\s*<</i, /\bvector</i, /\bunique_ptr</i, /\bshared_ptr</i, /\bauto\s+\w+\s*=/i, /\bconstexpr\b/i],
    frameworkHints: [/\bqt\b/i, /\bboost\b/i, /\bunreal\b/i, /\bsfml\b/i, /\bcmake\b/i, /\bimgui\b/i]
  },
  {
    id: 'csharp',
    name: 'C#',
    codeBlockTags: ['csharp', 'cs', 'c#'],
    extensions: [/\.cs$/i],
    keywords: [/\bnamespace\s+\w+/i, /\busing\s+\w+/i, /\bpublic\s+class\b/i, /\basync\s+Task</i, /\bawait\s+/i, /\bvar\s+\w+\s*=/i, /\bLINQ\b/i, /\b\[HttpGet\]/i, /\b\[ApiController\]/i, /\bConsole\.Write/i],
    frameworkHints: [/\basp\.?net\b/i, /\benzor\b/i, /\bentity\s*framework\b/i, /\bmaui\b/i, /\bunity\s+(engine|3d|game)?\b/i, /\bxamarin\b/i, /\.net\s*(core|8|9)?\b/i]
  },
  {
    id: 'swift',
    name: 'Swift',
    codeBlockTags: ['swift'],
    extensions: [/\.swift/i],
    keywords: [/\bfunc\s+\w+\s*\(/i, /\bvar\s+\w+\s*:\s*\w+/i, /\blet\s+\w+\s*:\s*\w+/i, /\bguard\s+let\b/i, /\bif\s+let\b/i, /\bstruct\s+\w+/i, /\bprotocol\s+\w+/i, /\b@State\b/i, /\b@Published\b/i, /\bimport\s+SwiftUI\b/i],
    frameworkHints: [/\bswiftui\b/i, /\buikit\b/i, /\bcombine\b/i, /\bvapor\b/i, /\bswiftdata\b/i, /\bcore\s*data\b/i]
  },
  {
    id: 'ruby',
    name: 'Ruby',
    codeBlockTags: ['ruby', 'rb'],
    extensions: [/\.rb/i, /\.rake/i, /Gemfile/i],
    keywords: [/\bdef\s+\w+/i, /\bclass\s+\w+\s*<?\s*\w*/i, /\brequire\s+['"]?\w+/i, /\battr_(accessor|reader|writer)\b/i, /\bputs\s+/i, /\bdo\s*\|/i, /\.each\s+do\b/i, /\bend\s*$/im, /\bmodule\s+\w+/i],
    frameworkHints: [/\brails\b/i, /\bsinatra\b/i, /\brspec\b/i, /\bsidekiq\b/i, /\bactive\s*record\b/i]
  },
  {
    id: 'php',
    name: 'PHP',
    codeBlockTags: ['php'],
    extensions: [/\.php/i],
    keywords: [/\b<\?php\b/i, /\$\w+\s*=/i, /\bfunction\s+\w+\s*\(/i, /\b->\w+\s*\(/i, /\bnew\s+\w+\(/i, /\becho\s+/i, /\bnamespace\s+\w+/i, /\buse\s+\w+\\/i, /\bpublic\s+function\b/i],
    frameworkHints: [/\blaravel\b/i, /\bsymfony\b/i, /\bcomposer\b/i, /\bwordpress\b/i, /\blivewire\b/i, /\bdrupal\b/i]
  },
  {
    id: 'dart',
    name: 'Dart',
    codeBlockTags: ['dart'],
    extensions: [/\.dart/i],
    keywords: [/\bvoid\s+main\s*\(/i, /\bWidget\s+build\b/i, /\bStatelessWidget\b/i, /\bStatefulWidget\b/i, /\bfinal\s+\w+\s*=/i, /\bclass\s+\w+\s+extends\b/i, /\b@override\b/i, /\bFuture</i],
    frameworkHints: [/\bflutter\b/i, /\bmaterial\s*design\b/i, /\briverpod\b/i, /\bbloc\b/i, /\bGetX\b/i]
  },
  {
    id: 'sql',
    name: 'SQL',
    codeBlockTags: ['sql', 'psql', 'mysql', 'sqlite'],
    extensions: [/\.sql/i],
    keywords: [/\bSELECT\s+/i, /\bFROM\s+\w+/i, /\bWHERE\s+/i, /\bJOIN\s+/i, /\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bCREATE\s+TABLE\b/i, /\bALTER\s+TABLE\b/i, /\bDELETE\s+FROM\b/i, /\bGROUP\s+BY\b/i],
    frameworkHints: [/\bpostgres(ql)?\b/i, /\bmysql\b/i, /\bsqlite\b/i, /\bsupabase\b/i, /\bprisma\b/i, /\bdrizzle\b/i]
  },
  {
    id: 'html',
    name: 'HTML',
    codeBlockTags: ['html', 'htm'],
    extensions: [/\.html?/i],
    keywords: [/\b<html\b/i, /\b<div\b/i, /\b<head\b/i, /\b<body\b/i, /\b<script\b/i, /\b<link\b/i, /\b<form\b/i, /\b<button\b/i, /\b<input\b/i, /\b<canvas\b/i, /\b<section\b/i, /\bclass="/i],
    frameworkHints: [/\bhtmx\b/i, /\balpine\.?js\b/i, /\bwebpack\b/i, /\btailwind\b/i, /\bbootstrap\b/i]
  },
  {
    id: 'css',
    name: 'CSS',
    codeBlockTags: ['css', 'scss', 'sass', 'less'],
    extensions: [/\.css/i, /\.scss/i, /\.sass/i, /\.less/i],
    keywords: [/\b\.\w+\s*\{/i, /\b#\w+\s*\{/i, /\bdisplay:\s*/i, /\bflex\b/i, /\bgrid\b/i, /\bmargin\b/i, /\bpadding\b/i, /\b@media\b/i, /\b@keyframes\b/i, /\b--\w+:/i, /\bbackground/i],
    frameworkHints: [/\btailwind\b/i, /\bbootstrap\b/i, /\bstyled[-_]?components\b/i, /\bcss\s*modules\b/i]
  },
  {
    id: 'shell',
    name: 'Shell/Bash',
    codeBlockTags: ['bash', 'sh', 'shell', 'zsh'],
    extensions: [/\.sh/i, /\.bash/i, /\.zsh/i],
    keywords: [/\b#!/i, /\becho\s+/i, /\bif\s+\[\[?\s*/i, /\bfor\s+\w+\s+in\b/i, /\bwhile\s+/i, /\bgrep\s+/i, /\bsed\s+/i, /\bawk\s+/i, /\bchmod\b/i, /\bsudo\b/i, /\bexport\s+\w+=/i, /\bcurl\s+/i],
    frameworkHints: [/\bdocker\b/i, /\bkubernetes\b/i, /\bterraform\b/i, /\bgithub\s*actions\b/i, /\bci\/cd\b/i]
  },
  {
    id: 'elixir',
    name: 'Elixir',
    codeBlockTags: ['elixir', 'ex'],
    extensions: [/\.ex/i, /\.exs/i],
    keywords: [/\bdefmodule\s+/i, /\bdef\s+\w+\s*\(/i, /\bdefp\s+/i, /\b\|>\s*/i, /\bcase\s+\w+\s+do\b/i, /\b:ok\b/i, /\b:error\b/i, /\bGenServer\b/i, /\b@moduledoc\b/i],
    frameworkHints: [/\bphoenix\b/i, /\bliveview\b/i, /\becto\b/i, /\bnerves\b/i]
  },
  {
    id: 'haskell',
    name: 'Haskell',
    codeBlockTags: ['haskell', 'hs'],
    extensions: [/\.hs/i],
    keywords: [/\bmodule\s+\w+\s+where\b/i, /\bimport\s+(qualified\s+)?\w+/i, /\b::\s*\w+/i, /\bdo\s*$/im, /\b<-\s*/i, /\bdata\s+\w+\s*=/i, /\bnewtype\s+/i, /\bclass\s+\w+\s+where\b/i, /\binstance\s+/i, /\bIO\s*\(/i],
    frameworkHints: [/\byesod\b/i, /\bservant\b/i, /\bscotty\b/i, /\bcabal\b/i, /\bstack\b/i]
  },
  {
    id: 'solidity',
    name: 'Solidity',
    codeBlockTags: ['solidity', 'sol'],
    extensions: [/\.sol/i],
    keywords: [/\bpragma\s+solidity\b/i, /\bcontract\s+\w+/i, /\bfunction\s+\w+\s*\(.*\)\s*(public|private|external|internal)/i, /\bmapping\s*\(/i, /\bevent\s+\w+/i, /\bmodifier\s+\w+/i, /\brequire\s*\(/i, /\bmsg\.sender\b/i, /\buint256\b/i],
    frameworkHints: [/\bopenzeppelin\b/i, /\bhardhat\b/i, /\bfoundry\b/i, /\bethers\.?js\b/i, /\bviem\b/i, /\bwagmi\b/i]
  },
  {
    id: 'lua',
    name: 'Lua',
    codeBlockTags: ['lua'],
    extensions: [/\.lua/i],
    keywords: [/\bfunction\s+\w+\s*\(/i, /\blocal\s+\w+\s*=/i, /\bthen\b/i, /\bend\b/i, /\brepeat\b/i, /\buntil\b/i, /\brequire\s*[("']/i, /\bprint\s*\(/i, /\bipairs\b/i, /\bpairs\b/i],
    frameworkHints: [/\bl[oö]ve\b/i, /\bneovim\b/i, /\broblox\b/i, /\bcoronasdk\b/i, /\bopenresty\b/i]
  },
  {
    id: 'r',
    name: 'R',
    codeBlockTags: ['r', 'rlang'],
    extensions: [/\.R$/i, /\.Rmd/i],
    keywords: [/\b<-\s*/i, /\blibrary\s*\(/i, /\bfunction\s*\(/i, /\bdata\.frame\b/i, /\bggplot\b/i, /\bmutate\b/i, /\bfilter\b/i, /\bsummarise\b/i, /\b%>%\b/i, /\b\|\>\s*/i],
    frameworkHints: [/\bshiny\b/i, /\btidyverse\b/i, /\bggplot2\b/i, /\bdplyr\b/i, /\bplumber\b/i]
  },
  {
    id: 'scala',
    name: 'Scala',
    codeBlockTags: ['scala'],
    extensions: [/\.scala/i, /\.sc/i],
    keywords: [/\bdef\s+\w+\s*[\[(]/i, /\bval\s+\w+/i, /\bvar\s+\w+/i, /\bobject\s+\w+/i, /\btrait\s+\w+/i, /\bcase\s+class\b/i, /\bsealed\s+trait\b/i, /\bimplicit\b/i, /\bfor\s*\{/i],
    frameworkHints: [/\bakka\b/i, /\bzio\b/i, /\bcats\b/i, /\bplay\s*framework\b/i, /\bspark\b/i, /\bsbt\b/i]
  },
  {
    id: 'zig',
    name: 'Zig',
    codeBlockTags: ['zig'],
    extensions: [/\.zig/i],
    keywords: [/\bpub\s+fn\b/i, /\bconst\s+\w+\s*=\s*struct\b/i, /\b@import\b/i, /\bcomptime\b/i, /\banyerror\b/i, /\borelse\b/i, /\bdefer\b/i, /\berrdefer\b/i, /\btry\s+/i, /\ballocator\b/i],
    frameworkHints: [/\bzig\s+build\b/i, /\bstd\.http\b/i]
  }
];

// ── Intent Detection ─────────────────────────────────────────────────────────

interface IntentPattern {
  intent: PromptIntent;
  patterns: RegExp[];
  weight: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'generate',
    patterns: [
      /\b(create|build|make|write|generate|develop|implement|scaffold|code|program|design|construct|produce|craft|set\s*up)\b/i,
      /\b(new|from\s+scratch|starter|boilerplate|template|skeleton)\b/i,
      /\b(webapp?|website|app|application|dashboard|page|component|api|server|cli|tool|game|bot|extension|plugin|script|function|library|module|service|microservice)\b/i
    ],
    weight: 3
  },
  {
    intent: 'debug',
    patterns: [
      /\b(debug|fix|solve|resolve|troubleshoot|diagnose|repair|patch)\b/i,
      /\b(error|bug|issue|crash|exception|fail|broken|wrong|incorrect|doesn'?t\s+work|not\s+working|unexpected)\b/i,
      /\b(stack\s*trace|traceback|segfault|panic|undefined|null\s*ref|type\s*error|syntax\s*error|runtime\s*error)\b/i
    ],
    weight: 4
  },
  {
    intent: 'refactor',
    patterns: [
      /\b(refactor|restructure|reorganize|clean\s*up|improve|rewrite|modernize|simplify|reduce|decouple)\b/i,
      /\b(code\s+smell|technical\s+debt|legacy|spaghetti|dry|solid|clean\s+code|maintainab)/i
    ],
    weight: 3
  },
  {
    intent: 'explain',
    patterns: [
      /\b(explain|describe|what\s+(is|are|does)|how\s+(does|do|is|are)|why\s+(does|do|is|are)|tell\s+me\s+about|understand|clarify|elaborate|break\s*down|walk\s+through|teach)\b/i,
      /\b(concept|meaning|difference|between|purpose|reason|logic|flow|algorithm)\b/i
    ],
    weight: 2
  },
  {
    intent: 'convert',
    patterns: [
      /\b(convert|translate|port|migrate|transform|transpile|rewrite\s+in|change\s+to)\b/i,
      /\bfrom\s+\w+\s+to\s+\w+/i,
      /\b(python\s+to|to\s+python|rust\s+to|to\s+rust|java\s+to|to\s+java|js\s+to|to\s+js|typescript\s+to|to\s+typescript)\b/i
    ],
    weight: 4
  },
  {
    intent: 'optimize',
    patterns: [
      /\b(optimize|optimise|speed\s*up|faster|performance|efficient|reduce\s+memory|minimize|cache|benchmark|profil|latency|throughput|bottleneck)\b/i
    ],
    weight: 3
  },
  {
    intent: 'review',
    patterns: [
      /\b(review|audit|analyze|assess|evaluate|check|inspect|critique|feedback|best\s+practice|anti[-\s]?pattern|code\s+quality)\b/i
    ],
    weight: 2
  },
  {
    intent: 'integrate',
    patterns: [
      /\b(integrate|connect|hook\s*up|wire|plug\s*in|api\s+call|fetch\s+data|webhook|auth|authentication|oauth|jwt|cors|endpoint|rest\s*api|graphql|sdk|third[-\s]?party)\b/i
    ],
    weight: 3
  },
  {
    intent: 'test',
    patterns: [
      /\b(test|spec|unit\s+test|e2e|end[-\s]to[-\s]end|integration\s+test|mock|stub|fixture|assertion|coverage|tdd|bdd|expect\s*\(|describe\s*\(|it\s*\()\b/i
    ],
    weight: 3
  },
  {
    intent: 'deploy',
    patterns: [
      /\b(deploy|deployment|ci\/?cd|docker|kubernetes|k8s|terraform|aws|azure|gcp|cloud|hosting|server\s+setup|nginx|production|pipeline|github\s+actions|vercel|netlify|heroku|fly\.io)\b/i
    ],
    weight: 3
  }
];

// ── Code-Relatedness Detection ───────────────────────────────────────────────

const CODE_RELATED_PATTERNS: RegExp[] = [
  // Code blocks
  /```\w*/i,
  // File extensions
  /\.\w{1,5}\b/i,
  // Programming language names
  /\b(javascript|typescript|python|rust|golang|java|kotlin|swift|ruby|php|dart|html|css|scss|sql|shell|bash|elixir|haskell|scala|solidity|lua|zig|wasm|c\+\+|c#|csharp|assembly|react|vue|angular|svelte|next\.?js|node\.?js|django|flask|fastapi|rails|laravel|spring|express)\b/i,
  // Technical keywords
  /\b(code|program|function|class|struct|interface|module|package|library|framework|api|sdk|database|server|client|frontend|backend|fullstack|algorithm|data\s*structure|variable|loop|array|object|component|repository|git|npm|pip|cargo|maven|gradle)\b/i,
  // Code-related actions
  /\b(implement|refactor|debug|compile|build|deploy|install|import|export|render|parse|serialize|encode|decode|encrypt|decrypt|hash|query|fetch|request|response|route|middleware|controller|model|view|template)\b/i,
  // Technical concepts
  /\b(async|await|promise|callback|closure|recursion|inheritance|polymorphism|encapsulation|abstraction|mutex|thread|process|memory|pointer|reference|generic|type|interface|protocol|trait|mixin|decorator|annotation|hook|state|prop|context|store|reducer|saga|middleware|pipeline|stream|buffer|socket|websocket|http|tcp|udp|rest|grpc|graphql|oauth|jwt|cors|csrf|xss|sql\s*injection|sanitize|validate)\b/i,
  // File/folder references
  /\b(index\.\w+|package\.json|tsconfig|webpack|vite\.config|dockerfile|makefile|cargo\.toml|go\.mod|requirements\.txt|gemfile|composer\.json|pubspec\.yaml|pom\.xml|build\.gradle)\b/i,
  // Error/debugging references
  /\b(error|exception|bug|stack\s*trace|traceback|segfault|null\s*pointer|undefined|type\s*error|syntax\s*error|runtime|compile|lint)\b/i,
  // DevOps
  /\b(docker|container|kubernetes|k8s|ci\/cd|pipeline|workflow|terraform|ansible|jenkins|github\s*actions|gitlab\s*ci)\b/i
];

const NON_CODE_PATTERNS: RegExp[] = [
  /\b(weather|recipe|cooking|sports|news|politics|movie|music|song|celebrity|gossip|horoscope|astrology|dating|relationship|love|poem|story|novel|fiction|essay|homework|geography|capital\s+of|president\s+of|history\s+of|who\s+is|how\s+old|what\s+time|joke|riddle|trivia)\b/i,
  /\b(how\s+to\s+cook|how\s+to\s+lose\s+weight|best\s+restaurants|travel\s+to|vacation|flight|hotel|recommendation|suggest\s+a\s+movie)\b/i,
  /\b(write\s+(?:a\s+)?(?:poem|essay|letter|email\s+to\s+(?:my|a)\s+(?:friend|boss|teacher)|story|song\s+lyrics))\b/i
];

// ── Framework Detection ──────────────────────────────────────────────────────

const ALL_FRAMEWORKS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'React', pattern: /\breact\b/i },
  { name: 'Next.js', pattern: /\bnext\.?js\b/i },
  { name: 'Vue', pattern: /\bvue(\.?js)?\b/i },
  { name: 'Angular', pattern: /\bangular\b/i },
  { name: 'Svelte', pattern: /\bsvelte(kit)?\b/i },
  { name: 'Express', pattern: /\bexpress(\.?js)?\b/i },
  { name: 'Fastify', pattern: /\bfastify\b/i },
  { name: 'NestJS', pattern: /\bnestjs\b/i },
  { name: 'Django', pattern: /\bdjango\b/i },
  { name: 'Flask', pattern: /\bflask\b/i },
  { name: 'FastAPI', pattern: /\bfastapi\b/i },
  { name: 'Spring Boot', pattern: /\bspring\s*boot\b/i },
  { name: 'Rails', pattern: /\brails\b/i },
  { name: 'Laravel', pattern: /\blaravel\b/i },
  { name: 'Flutter', pattern: /\bflutter\b/i },
  { name: 'SwiftUI', pattern: /\bswiftui\b/i },
  { name: 'Jetpack Compose', pattern: /\bjetpack\s*compose\b/i },
  { name: 'Tokio', pattern: /\btokio\b/i },
  { name: 'Axum', pattern: /\baxum\b/i },
  { name: 'Gin', pattern: /\bgin\b/i },
  { name: 'Phoenix', pattern: /\bphoenix\b/i },
  { name: 'Tailwind CSS', pattern: /\btailwind\b/i },
  { name: 'Prisma', pattern: /\bprisma\b/i },
  { name: 'Docker', pattern: /\bdocker\b/i },
  { name: 'Kubernetes', pattern: /\bkubernetes|k8s\b/i },
  { name: 'Terraform', pattern: /\bterraform\b/i },
  { name: 'TensorFlow', pattern: /\btensorflow\b/i },
  { name: 'PyTorch', pattern: /\bpytorch\b/i },
  { name: 'LangChain', pattern: /\blangchain\b/i },
  { name: 'Vite', pattern: /\bvite\b/i },
  { name: 'Astro', pattern: /\bastro\b/i },
  { name: 'Three.js', pattern: /\bthree\.?js\b/i },
  { name: 'Unity', pattern: /\bunity\b/i },
  { name: 'Unreal', pattern: /\bunreal\b/i },
  { name: 'OpenZeppelin', pattern: /\bopenzeppelin\b/i },
  { name: 'Hardhat', pattern: /\bhardhat\b/i },
  { name: 'Supabase', pattern: /\bsupabase\b/i },
  { name: 'Firebase', pattern: /\bfirebase\b/i },
  { name: 'Gemini API', pattern: /\bgemini\s*(api|sdk)?\b/i },
  { name: 'OpenAI API', pattern: /\bopenai\b/i },
];

// ── Main Analyzer ────────────────────────────────────────────────────────────

export function analyzePrompt(prompt: string): PromptAnalysis {
  const normalized = prompt.trim();
  const lower = normalized.toLowerCase();

  // 1. Detect languages
  const detectedLanguages = detectLanguages(normalized);

  // 2. Detect frameworks
  const frameworks = detectFrameworks(normalized);

  // 3. Classify intent
  const intent = classifyIntent(normalized);

  // 4. Score complexity
  const complexity = scoreComplexity(normalized, detectedLanguages, frameworks);

  // 5. Check if code-related
  const isCodeRelated = checkCodeRelated(normalized, detectedLanguages, frameworks, intent);

  // 6. Extract keywords
  const keywords = extractKeywords(lower);

  // 7. Generate summary
  const primaryLanguage = detectedLanguages.length > 0 ? detectedLanguages[0] : null;
  const summary = generateSummary(primaryLanguage, intent, complexity, frameworks, isCodeRelated);

  return {
    detectedLanguages,
    primaryLanguage,
    intent,
    complexity,
    frameworks,
    keywords,
    summary,
    isCodeRelated
  };
}

function detectLanguages(prompt: string): string[] {
  const scores: Record<string, number> = {};

  // Check code block tags (```language)
  const codeBlockMatch = prompt.matchAll(/```(\w+)/g);
  for (const m of codeBlockMatch) {
    const tag = m[1].toLowerCase();
    for (const sig of LANG_SIGNATURES) {
      if (sig.codeBlockTags.includes(tag)) {
        scores[sig.id] = (scores[sig.id] || 0) + 10;
      }
    }
  }

  // Check keywords and framework hints
  for (const sig of LANG_SIGNATURES) {
    for (const kw of sig.keywords) {
      if (kw.test(prompt)) {
        scores[sig.id] = (scores[sig.id] || 0) + 2;
      }
    }
    for (const fw of sig.frameworkHints) {
      if (fw.test(prompt)) {
        scores[sig.id] = (scores[sig.id] || 0) + 3;
      }
    }
    for (const ext of sig.extensions) {
      if (ext.test(prompt)) {
        scores[sig.id] = (scores[sig.id] || 0) + 4;
      }
    }
  }

  // Sort by score descending, filter to meaningful scores only
  return Object.entries(scores)
    .filter(([, score]) => score >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([lang]) => lang);
}

function detectFrameworks(prompt: string): string[] {
  return ALL_FRAMEWORKS
    .filter(fw => fw.pattern.test(prompt))
    .map(fw => fw.name);
}

function classifyIntent(prompt: string): PromptIntent {
  const scores: Record<PromptIntent, number> = {
    generate: 0, refactor: 0, debug: 0, explain: 0, convert: 0,
    optimize: 0, review: 0, integrate: 0, test: 0, deploy: 0, general: 0
  };

  for (const { intent, patterns, weight } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        scores[intent] += weight;
      }
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'general';

  const winner = (Object.entries(scores) as [PromptIntent, number][])
    .filter(([, score]) => score === maxScore)
    .map(([intent]) => intent)[0];

  return winner || 'general';
}

function scoreComplexity(prompt: string, languages: string[], frameworks: string[]): ComplexityLevel {
  let score = 0;

  const wordCount = prompt.split(/\s+/).length;
  if (wordCount < 15) score += 0;
  else if (wordCount < 40) score += 1;
  else if (wordCount < 100) score += 2;
  else if (wordCount < 250) score += 3;
  else score += 4;

  score += Math.min(languages.length, 3);
  score += Math.min(frameworks.length, 4);

  // Architectural keywords boost complexity
  const archKeywords = /\b(microservice|distributed|scalab|architecture|system\s+design|event[-\s]driven|cqrs|saga|monorepo|multi[-\s]tenant|load\s*balanc|cache\s*layer|message\s*queue|real[-\s]time|websocket|stream|pipeline|orchestrat|infrastructure)\b/i;
  if (archKeywords.test(prompt)) score += 3;

  // Multiple files mentioned
  const fileCount = (prompt.match(/\.\w{1,5}\b/g) || []).length;
  if (fileCount > 3) score += 2;
  else if (fileCount > 1) score += 1;

  if (score <= 1) return 'trivial';
  if (score <= 3) return 'simple';
  if (score <= 6) return 'moderate';
  if (score <= 10) return 'complex';
  return 'enterprise';
}

function checkCodeRelated(
  prompt: string,
  languages: string[],
  frameworks: string[],
  intent: PromptIntent
): boolean {
  // If languages or frameworks detected, it's code-related
  if (languages.length > 0 || frameworks.length > 0) return true;

  // If intent is clearly code-related
  if (['generate', 'refactor', 'debug', 'convert', 'optimize', 'review', 'integrate', 'test', 'deploy'].includes(intent)) {
    // Double-check with patterns
    if (CODE_RELATED_PATTERNS.some(p => p.test(prompt))) return true;
  }

  // Check for explicit non-code patterns
  if (NON_CODE_PATTERNS.some(p => p.test(prompt))) return false;

  // Check for code-related patterns as a final pass
  const codeMatches = CODE_RELATED_PATTERNS.filter(p => p.test(prompt)).length;
  return codeMatches >= 2;
}

function extractKeywords(lower: string): string[] {
  const keywords: string[] = [];
  const kwPatterns = [
    /\b(api|sdk|database|server|client|frontend|backend|fullstack|auth|oauth|jwt|cors|webpack|vite|docker|kubernetes|terraform|ci\/cd|graphql|rest|grpc|websocket|cache|queue|stream|pipeline)\b/gi
  ];
  for (const p of kwPatterns) {
    let m;
    while ((m = p.exec(lower)) !== null) {
      const kw = m[1].toLowerCase();
      if (!keywords.includes(kw)) keywords.push(kw);
    }
  }
  return keywords;
}

function generateSummary(
  primaryLanguage: string | null,
  intent: PromptIntent,
  complexity: ComplexityLevel,
  frameworks: string[],
  isCodeRelated: boolean
): string {
  if (!isCodeRelated) {
    return '⛔ Non-code prompt detected. NYX only accepts coding-related requests.';
  }

  const langStr = primaryLanguage
    ? LANG_SIGNATURES.find(s => s.id === primaryLanguage)?.name || primaryLanguage
    : 'general';
  const fwStr = frameworks.length > 0 ? ` using ${frameworks.slice(0, 3).join(', ')}` : '';
  const intentStr = intent === 'general' ? 'coding task' : intent;

  return `🧠 ${complexity.charAt(0).toUpperCase() + complexity.slice(1)} ${langStr} ${intentStr}${fwStr}`;
}

/**
 * Non-code prompt rejection message with helpful guidance
 */
export const NON_CODE_REJECTION = `I'm NYX, a specialized multi-agent coding system. I only handle programming and software development tasks.

**I can help you with:**
- 🏗️ Building applications, APIs, and websites
- 🐛 Debugging and fixing code issues
- ♻️ Refactoring and optimizing code
- 📝 Writing tests and documentation
- 🔌 Integrating APIs and services
- 🚀 Deployment and DevOps

Please rephrase your request as a coding task, and I'll deliver production-ready results!`;
