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

export interface HardwareAnalysis {
  isHardware: boolean;
  detectedPlatforms: string[];
  detectedComponents: string[];
  detectedProtocols: string[];
  gaps: string[];
  safetyHazards: string[];
  optimizations: string[];
}

export interface PromptAnalysis {
  detectedLanguages: string[];
  primaryLanguage: string | null;
  intent: PromptIntent;
  complexity: ComplexityLevel;
  frameworks: string[];
  keywords: string[];
  summary: string;
  isCodeRelated: boolean;
  hardware?: HardwareAnalysis;
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
  },
  {
    id: 'arduino',
    name: 'Arduino / Embedded C++',
    codeBlockTags: ['arduino', 'ino'],
    extensions: [/\.ino/i, /\.pde/i],
    keywords: [/\bvoid\s+setup\s*\(/i, /\bvoid\s+loop\s*\(/i, /\bdigitalWrite\b/i, /\bdigitalRead\b/i, /\banalogRead\b/i, /\banalogWrite\b/i, /\bpinMode\b/i, /\bSerial\.begin/i, /\bSerial\.print/i, /\bdelay\s*\(/i, /\b#include\s*<Arduino/i],
    frameworkHints: [/\barduino\b/i, /\besp32\b/i, /\besp8266\b/i, /\bplatformio\b/i, /\bteensy\b/i, /\badafruit\b/i, /\bsparkfun\b/i, /\bstm32\b/i, /\bavr\b/i, /\bneopixel\b/i, /\bservo\b/i]
  },
  {
    id: 'micropython',
    name: 'MicroPython / CircuitPython',
    codeBlockTags: ['micropython', 'circuitpython'],
    extensions: [/\.py/i],
    keywords: [/\bfrom\s+machine\s+import/i, /\bimport\s+machine\b/i, /\bPin\s*\(/i, /\bmachine\.Pin/i, /\bnetwork\.WLAN/i, /\busocket\b/i, /\butime\b/i, /\bboard\./i, /\bdigitalio\./i, /\banalogio\./i],
    frameworkHints: [/\bmicropython\b/i, /\bcircuitpython\b/i, /\braspberry\s*pi\s*pico\b/i, /\brp2040\b/i, /\badafruit\b/i, /\bthonny\b/i]
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

/**
 * If a prompt mentions ANY programming language name or coding technology,
 * it is ALWAYS code-related — regardless of phrasing.
 * This is the nuclear-option check: no question-word prefix required.
 * Catches: "HTML", "learn python", "CSS tricks", "what is JavaScript", "tell me HTML", etc.
 */
const MENTIONS_CODE_TECH: RegExp =
  /\b(javascript|typescript|python|rust|golang|go\s+lang|java|kotlin|swift|ruby|php|dart|html|css|scss|sass|less|sql|shell|bash|zsh|powershell|elixir|erlang|haskell|scala|clojure|solidity|lua|zig|nim|crystal|ocaml|fsharp|f#|perl|r\s+lang|matlab|fortran|cobol|lisp|scheme|prolog|groovy|objective[-\s]?c|wasm|webassembly|c\+\+|cpp|c#|csharp|assembly|asm|vhdl|verilog|systemverilog|react|vue|angular|svelte|next\.?js|nuxt\.?js|node\.?js|deno|bun|django|flask|fastapi|rails|laravel|symfony|spring|express|fastify|hono|nestjs|gin|fiber|axum|actix|rocket|phoenix|ktor|vapor|sinatra|vite|webpack|rollup|esbuild|parcel|turbopack|docker|kubernetes|k8s|terraform|ansible|puppet|chef|jenkins|travis|circleci|pulumi|git|github|gitlab|bitbucket|npm|yarn|pnpm|pip|conda|cargo|maven|gradle|sbt|cabal|stack|composer|bundler|cocoapods|carthage|graphql|trpc|rest\s*api|grpc|protobuf|thrift|openapi|swagger|postman|insomnia|mongodb|postgres|postgresql|mysql|mariadb|sqlite|redis|memcached|cassandra|dynamodb|couchdb|neo4j|influxdb|timescaledb|cockroachdb|supabase|firebase|appwrite|pocketbase|neon|planetscale|aws|azure|gcp|vercel|netlify|heroku|railway|render|fly\.io|cloudflare|digitalocean|linode|tailwind|bootstrap|material\s*ui|chakra\s*ui|mantine|radix|shadcn|ant\s*design|bulma|foundation|styled[-\s]?components|emotion|stitches|jsx|tsx|dom|virtual\s*dom|shadow\s*dom|json|xml|yaml|toml|protobuf|avro|csv|markdown|mdx|regex|regexp|http|https|tcp|udp|websocket|webrtc|sse|oauth|jwt|cors|csrf|xss|sql\s*injection|oop|mvc|mvvm|mvp|clean\s*architecture|hexagonal|onion|cqrs|event\s*sourcing|ddd|crud|cicd|ci\/cd|tdd|bdd|ddd|agile|scrum|kanban|devops|devsecops|sre|mlops|dataops|gitops|microservice|monolith|serverless|lambda|edge\s*computing|cdn|dns|ssl|tls|ssh|ftp|smtp|imap|ide|vscode|visual\s*studio|intellij|webstorm|pycharm|xcode|android\s*studio|vim|neovim|emacs|sublime|atom|cursor|windsurf|compiler|interpreter|debugger|linter|formatter|transpiler|bundler|minifier|uglifier|runtime|framework|library|package|module|component|widget|hook|state|prop|context|store|reducer|saga|thunk|observable|signal|ref|reactive|promise|callback|closure|recursion|iteration|inheritance|polymorphism|encapsulation|abstraction|composition|mixin|trait|protocol|interface|generic|template|decorator|annotation|middleware|router|controller|model|view|presenter|viewmodel|schema|migration|seed|orm|odm|query\s*builder|active\s*record|data\s*mapper|index|cache|memoiz|buffer|stream|pipe|channel|thread|process|mutex|semaphore|lock|deadlock|race\s*condition|async|await|coroutine|goroutine|green\s*thread|actor|fiber|event\s*loop|reactor|proactor|heap|stack|queue|deque|priority\s*queue|tree|trie|graph|hash\s*map|hash\s*table|hash\s*set|linked\s*list|doubly\s*linked|skip\s*list|bloom\s*filter|b[-\s]?tree|red[-\s]?black|avl|binary\s*search|depth\s*first|breadth\s*first|dijkstra|dynamic\s*programming|greedy|backtracking|divide\s*and\s*conquer|sorting|searching|traversal|pointer|reference|smart\s*pointer|ownership|borrowing|lifetime|move\s*semantics|raii|memory\s*management|garbage\s*collection|gc|arc|reference\s*counting|jit|aot|bytecode|opcode|ir|llvm|abi|ffi|wasi|napi|binding|interop|marshalling|ssr|ssg|isr|spa|pwa|csr|hydration|islands|partial\s*hydration|bundling|minification|tree\s*shaking|code\s*splitting|lazy\s*loading|hot\s*reload|hmr|live\s*reload|fast\s*refresh|repl|sandbox|container|pod|namespace|ingress|service\s*mesh|sidecar|istio|envoy|linkerd|load\s*balanc|reverse\s*proxy|api\s*gateway|rate\s*limit|circuit\s*breaker|retry|backoff|bulkhead|saga|choreography|orchestration|webhook|endpoint|payload|serializ|deserializ|marshal|unmarshal|encode|decode|encrypt|decrypt|hash|digest|hmac|token|session|cookie|header|request|response|status\s*code|middleware|interceptor|guard|pipe|filter|resolver|plugin|extension|addon|snippet|boilerplate|scaffold|seed|skeleton|starter|archetype|refactor|lint|format|prettify|test|spec|suite|mock|stub|spy|fake|fixture|factory|assertion|expectation|matcher|coverage|lcov|istanbul|nyc|benchmark|profil|flame\s*graph|debug|breakpoint|watchpoint|trace|log|structured\s*log|monitor|alert|incident|dashboard|metric|counter|gauge|histogram|percentile|p99|p95|latency|throughput|bandwidth|iops|uptime|availability|durability|sla|slo|sli|error\s*budget|observability|telemetry|tracing|distributed\s*tracing|opentelemetry|otel|sampling|span|jaeger|zipkin|tempo|prometheus|grafana|kibana|elasticsearch|logstash|fluentd|fluentbit|vector|datadog|newrelic|sentry|pagerduty|rollbar|bugsnag|amplitude|mixpanel|segment|posthog|plausible|analytics|tensorboard|wandb|mlflow|jupyter|notebook|colab|kaggle|huggingface|transformers|langchain|llamaindex|autogen|crewai|semantic\s*kernel|embeddings?|vector\s*db|pinecone|chroma|weaviate|qdrant|milvus|faiss|rag|fine[-\s]?tun|lora|qlora|quantiz|onnx|tensorrt|triton|vllm|ollama|llama|mistral|gemma|gpt|claude|gemini|openai|anthropic|cohere|replicate|hugging\s*face|diffusion|stable\s*diffusion|comfyui|sdxl|flux|dall[-\s]?e|midjourney|coding|programming|software|developer|development|engineer|engineering|syntax|semantic|lexer|parser|tokenizer|ast|abstract\s*syntax|cst|ir|cfg|ssa|data\s*flow|control\s*flow|type\s*system|type\s*check|type\s*inference|static\s*analysis|linting|code\s*review|pull\s*request|merge\s*request|branch|commit|rebase|cherry[-\s]?pick|stash|tag|release|deploy|rollback|canary|blue[-\s]?green|rolling\s*update|feature\s*flag|a\/b\s*test|chaos\s*engineering|load\s*test|stress\s*test|fuzz|penetration\s*test|vulnerability|exploit|injection|sanitiz|escap|validat|authentication|authorization|rbac|abac|acl|saml|oidc|sso|mfa|2fa|totp|passkey|webauthn|bcrypt|argon2|scrypt|pbkdf2|aes|rsa|ecdsa|ed25519|diffie[-\s]?hellman|tls|mtls|certificate|pki|vault|secrets?\s*management|arduino|raspberry\s*pi|raspi|rpi|esp32|esp8266|nodemcu|stm32|pic\s*microcontroller|avr|atmega|attiny|teensy|adafruit|sparkfun|beaglebone|beagleboard|jetson\s*nano|jetson\s*orin|jetson|nvidia\s*jetson|intel\s*edison|particle\s*photon|particle\s*argon|mbed|nrf52|nrf53|pico|pico\s*w|rp2040|rp2350|risc[-\s]?v|fpga|asic|soc|mcu|microcontroller|single\s*board\s*computer|sbc|development\s*board|dev\s*board|breakout\s*board|shield|hat\s*module|grove\s*sensor|qwiic|stemma|mqtt|coap|zigbee|z[-\s]?wave|lorawan|lora\s*wan|ble|bluetooth\s*low\s*energy|bluetooth|wifi\s*module|nfc|rfid|i2c|spi\s*bus|uart|serial\s*port|gpio|pwm|adc|dac|can\s*bus|modbus|onewire|one[-\s]?wire|dma|jtag|swd|openocd|platformio|esphome|home\s*assistant|node[-\s]?red|thingsboard|blynk|cayenne|thingspeak|aws\s*iot|azure\s*iot|google\s*cloud\s*iot|iot\s*hub|iot\s*core|matter\s*protocol|thread\s*protocol|embedded\s*system|embedded\s*c|embedded\s*linux|rtos|freertos|zephyr\s*os|zephyr\s*rtos|zephyr|riot\s*os|contiki|mynewt|nuttx|chibios|mbed\s*os|threadx|vxworks|qnx|yocto|buildroot|openwrt|tasmota|micropython|circuitpython|tinygo|rust\s*embedded|embassy[-\s]?rs|probe[-\s]?rs|svd2rust|cortex[-\s]?m|arm\s*cortex|thumb|armv7|armv8|aarch64|xtensa|mips|avr[-\s]?gcc|arm[-\s]?gcc|cross[-\s]?compil|toolchain|bootloader|firmware|flash\s*memory|eeprom|sram|dram|rom|nvram|bare[-\s]?metal|hal|bsp|device\s*driver|kernel\s*module|device\s*tree|dtb|dts|u[-\s]?boot|grub|sensor|actuator|servo|stepper\s*motor|dc\s*motor|relay|led\s*strip|neopixel|ws2812|oled|lcd\s*display|tft\s*display|e[-\s]?ink|epaper|accelerometer|gyroscope|imu|magnetometer|barometer|temperature\s*sensor|humidity\s*sensor|ultrasonic|pir\s*sensor|lidar|ir\s*sensor|potentiometer|encoder|rotary\s*encoder|touch\s*sensor|pressure\s*sensor|gas\s*sensor|gps\s*module|rtc|real\s*time\s*clock|robot|robotics|ros|ros2|gazebo|moveit|slam|odometry|pid\s*control|kalman\s*filter|inverse\s*kinematics|drone|quadcopter|uav|ardupilot|px4|betaflight|mavlink|dronekit|autonomous\s*vehicle|self[-\s]?driving|opencv|yolo|object\s*detection|image\s*recognition|point\s*cloud|computer\s*vision|3d\s*print|additive\s*manufacturing|gcode|g[-\s]?code|slicer|cura|prusaslicer|octoprint|klipper|marlin|openscad|freecad|fusion\s*360|solidworks|autocad|cad|cam|cnc|laser\s*cut|pcb\s*design|pcb|kicad|eagle|altium|gerber|schematic|breadboard|soldering|oscilloscope|logic\s*analyzer|multimeter|power\s*supply|godot|pygame|phaser|pixi\.?js|love2d|monogame|raylib|opengl|vulkan|directx|metal\s*api|webgpu|webgl|shader|glsl|hlsl|spirv|compute\s*shader|ray\s*tracing|rasteriz|game\s*engine|game\s*loop|physics\s*engine|collision\s*detection|sprite|tilemap|particle\s*system|ecs\s*pattern|entity\s*component|react\s*native|expo|ionic|capacitor|cordova|xamarin|maui|kotlin\s*multiplatform|kmp|compose\s*multiplatform|tauri|electron|progressive\s*web\s*app|native\s*app|hybrid\s*app|webview|deep\s*link|push\s*notification|app\s*store|play\s*store|testflight|fastlane|android\s*sdk|ios\s*sdk|numpy|pandas|scipy|scikit[-\s]?learn|matplotlib|seaborn|plotly|bokeh|altair|dask|polars|xgboost|lightgbm|catboost|random\s*forest|neural\s*network|deep\s*learning|machine\s*learning|reinforcement\s*learning|supervised\s*learning|unsupervised\s*learning|transfer\s*learning|feature\s*engineering|data\s*preprocessing|data\s*augmentation|batch\s*normalization|dropout|regularization|overfitting|underfitting|cross\s*validation|hyperparameter|automl|keras|jax|flax|mxnet|caffe|paddle|mindspore|serverless\s*framework|sam\s*cli|cdk|cloudformation|arm\s*template|bicep|crossplane|helm|kustomize|argocd|fluxcd|tekton|spinnaker|consul|nomad|packer|vagrant|proxmox|vmware|virtualbox|hyper[-\s]?v|libvirt|qemu|kvm|openstack|openshift|rancher|portainer|traefik|caddy|haproxy|kong|apisix|ethereum|bitcoin|blockchain|smart\s*contract|defi|dao|nft|erc[-\s]?20|erc[-\s]?721|web3\.?js|ethers\.?js|web3\.?py|brownie|foundry|remix\s*ide|metamask|ganache|anvil|polygon|arbitrum|optimism|avalanche|solana|near|cosmos|polkadot|substrate|aptos|sui|ton|hyperledger|chainlink|ipfs|filecoin|wireshark|tcpdump|nmap|netcat|iptables|nftables|nginx|apache|openvpn|wireguard|tailscale|zerotier|ngrok|vpn|firewall|waf|siem|malware|ghidra|ida\s*pro|radare2|gdb|lldb|strace|valgrind|fuzzing|afl|zapier|n8n|power\s*automate|appsmith|retool|nocodb|strapi|payload\s*cms|sanity|contentful|ghost|twilio|sendgrid|pusher|nats|rabbitmq|kafka|pulsar|temporal|inngest|bull|bullmq|simulink|labview|matlab|octave|gnuplot|wolfram|mathematica)\b/i;

const CODE_RELATED_PATTERNS: RegExp[] = [
  // Code blocks
  /```\w*/i,
  // File extensions
  /\.\w{1,5}\b/i,
  // Programming language names (compact subset for scoring)
  /\b(javascript|typescript|python|rust|golang|java|kotlin|swift|ruby|php|dart|html|css|scss|sql|shell|bash|elixir|haskell|scala|solidity|lua|zig|wasm|c\+\+|c#|csharp|assembly|react|vue|angular|svelte|next\.?js|node\.?js|django|flask|fastapi|rails|laravel|spring|express)\b/i,
  // Technical keywords
  /\b(code|program|function|class|struct|interface|module|package|library|framework|api|sdk|database|server|client|frontend|backend|fullstack|algorithm|data\s*structure|variable|loop|array|object|component|repository|git|npm|pip|cargo|maven|gradle|coding|programming|software|developer|development|engineer|engineering|syntax|semantic|compiler|interpreter|runtime|execution|script|scripting)\b/i,
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
  /\b(weather|recipe|cooking|sports|news|politics|movie|music|song|celebrity|gossip|horoscope|astrology|dating|relationship|love|poem|story|novel|fiction|essay|homework|geography|capital\s+of|president\s+of|history\s+of|how\s+old|what\s+time|joke|riddle|trivia)\b/i,
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
  { name: 'Arduino', pattern: /\barduino\b/i },
  { name: 'Raspberry Pi', pattern: /\braspberry\s*pi\b/i },
  { name: 'ESP32', pattern: /\besp32\b/i },
  { name: 'ESP8266', pattern: /\besp8266\b/i },
  { name: 'STM32', pattern: /\bstm32\b/i },
  { name: 'PlatformIO', pattern: /\bplatformio\b/i },
  { name: 'FreeRTOS', pattern: /\bfreertos\b/i },
  { name: 'Zephyr RTOS', pattern: /\bzephyr\b/i },
  { name: 'ROS/ROS2', pattern: /\bros2?\b/i },
  { name: 'MicroPython', pattern: /\bmicropython\b/i },
  { name: 'CircuitPython', pattern: /\bcircuitpython\b/i },
  { name: 'OpenCV', pattern: /\bopencv\b/i },
  { name: 'Godot', pattern: /\bgodot\b/i },
  { name: 'Pygame', pattern: /\bpygame\b/i },
  { name: 'Electron', pattern: /\belectron\b/i },
  { name: 'React Native', pattern: /\breact\s*native\b/i },
  { name: 'Expo', pattern: /\bexpo\b/i },
  { name: 'MATLAB', pattern: /\bmatlab\b/i },
  { name: 'Simulink', pattern: /\bsimulink\b/i },
  { name: 'KiCad', pattern: /\bkicad\b/i },
  { name: 'Home Assistant', pattern: /\bhome\s*assistant\b/i },
  { name: 'Node-RED', pattern: /\bnode[-\s]?red\b/i },
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

  // 8. Run Hardware Analyzer
  const hardware = detectHardware(normalized);

  return {
    detectedLanguages,
    primaryLanguage,
    intent,
    complexity,
    frameworks,
    keywords,
    summary,
    isCodeRelated,
    hardware
  };
}

export function detectHardware(prompt: string): HardwareAnalysis {
  const lower = prompt.toLowerCase();
  
  // 1. Boards/Platforms
  const platformRules = [
    { id: 'arduino', name: 'Arduino', patterns: [/\barduino\b/i, /\buno\b/i, /\bnano\b/i, /\bmega\b/i, /\batmega\b/i, /\bavr\b/i, /\.ino\b/i] },
    { id: 'esp32', name: 'ESP32', patterns: [/\besp32\b/i, /\besp8266\b/i, /\bnodemcu\b/i, /\bfreertos\b/i] },
    { id: 'raspberrypi', name: 'Raspberry Pi', patterns: [/\braspberry\s*pi\b/i, /\braspi\b/i, /\brpi\b/i, /\bpi\s*3\b/i, /\bpi\s*4\b/i, /\bpi\s*5\b/i] },
    { id: 'pico', name: 'Pi Pico', patterns: [/\bpico\b/i, /\brp2040\b/i, /\brp2350\b/i] }
  ];
  
  const detectedPlatforms: string[] = [];
  for (const rule of platformRules) {
    if (rule.patterns.some(p => p.test(prompt))) {
      detectedPlatforms.push(rule.name);
    }
  }

  // 2. Components
  const componentRules = [
    { name: 'OLED Display', patterns: [/\boled\b/i, /\bsh1106\b/i, /\bssd1306\b/i, /\b128x64\b/i] },
    { name: 'LCD Display', patterns: [/\blcd\b/i, /\b16x2\b/i, /\b20x4\b/i, /\bliquidcrystal\b/i] },
    { name: 'DHT Temperature/Humidity Sensor', patterns: [/\bdht11\b/i, /\bdht22\b/i, /\bdht\b/i] },
    { name: 'Servo Motor', patterns: [/\bservo\b/i, /\bsg90\b/i, /\bmg90\b/i] },
    { name: 'Stepper Motor', patterns: [/\bstepper\b/i, /\b28byj\b/i, /\buln2003\b/i, /\ba4988\b/i] },
    { name: 'DC Motor / Driver', patterns: [/\bdc\s*motor\b/i, /\bl298n\b/i, /\bh-bridge\b/i, /\bmotor\s+driver\b/i] },
    { name: 'NeoPixel LED Strip', patterns: [/\bneopixel\b/i, /\bws2812\b/i, /\bws2812b\b/i, /\bled\s*strip\b/i, /\badaddressable\s+led\b/i] },
    { name: 'Relay Module', patterns: [/\brelay\b/i, /\brelays\b/i] },
    { name: 'Ultrasonic Sensor', patterns: [/\bultrasonic\b/i, /\bhc-sr04\b/i, /\bdistance\s+sensor\b/i] },
    { name: 'PIR Motion Sensor', patterns: [/\bpir\b/i, /\bmotion\s+sensor\b/i, /\bhc-sr501\b/i] },
    { name: 'LDR Light Sensor', patterns: [/\bldr\b/i, /\blight\s+sensor\b/i, /\bphotoresistor\b/i] },
    { name: 'Potentiometer', patterns: [/\bpotentiometer\b/i, /\bpot\b/i, /\banalog\s+dial\b/i] },
    { name: 'IMU / Gyroscope', patterns: [/\bimu\b/i, /\bmpu6050\b/i, /\bmpu9250\b/i, /\bgyro\b/i, /\baccelerometer\b/i] },
    { name: 'RTC Real Time Clock', patterns: [/\brtc\b/i, /\bds3231\b/i, /\bds1307\b/i, /\bclock\s+module\b/i] }
  ];

  const detectedComponents: string[] = [];
  for (const rule of componentRules) {
    if (rule.patterns.some(p => p.test(prompt))) {
      detectedComponents.push(rule.name);
    }
  }

  // 3. Protocols
  const protocolRules = [
    { name: 'I2C', patterns: [/\bi2c\b/i, /\bsda\b/i, /\bscl\b/i, /\bwire\.h\b/i] },
    { name: 'SPI', patterns: [/\bspi\b/i, /\bmiso\b/i, /\bmosi\b/i, /\bsck\b/i, /\bcs\s+pin\b/i, /\bspi\.h\b/i] },
    { name: 'UART / Serial', patterns: [/\buart\b/i, /\btx\b/i, /\brx\b/i, /\bserial\b/i, /\bsoftware\s*serial\b/i] },
    { name: 'PWM', patterns: [/\bpwm\b/i, /\bpulse\s*width\b/i, /\banalogwrite\b/i] },
    { name: 'One-Wire', patterns: [/\bonewire\b/i, /\b1-wire\b/i, /\bdallas\b/i, /\bds18b20\b/i] }
  ];

  const detectedProtocols: string[] = [];
  for (const rule of protocolRules) {
    if (rule.patterns.some(p => p.test(prompt))) {
      detectedProtocols.push(rule.name);
    }
  }

  // Add implicit protocol mapping (e.g. OLED/LCD and RTC usually imply I2C)
  if (detectedComponents.some(c => c.includes('OLED') || c.includes('LCD') || c.includes('RTC')) && !detectedProtocols.includes('I2C')) {
    detectedProtocols.push('I2C');
  }
  if (detectedComponents.some(c => c.includes('NeoPixel') || c.includes('Servo') || c.includes('Stepper') || c.includes('DC Motor')) && !detectedProtocols.includes('PWM') && !lower.includes('i2c')) {
    detectedProtocols.push('PWM / Timing');
  }

  const isHardware = detectedPlatforms.length > 0 || detectedComponents.length > 0 || detectedProtocols.length > 0 || lower.includes('microcontroller') || lower.includes('sensor') || lower.includes('actuator') || lower.includes('gpio');

  const gaps: string[] = [];
  const safetyHazards: string[] = [];
  const optimizations: string[] = [];

  if (isHardware) {
    // Determine the host platform for targeting advice
    const isArduinoHost = detectedPlatforms.includes('Arduino') || (!detectedPlatforms.includes('Raspberry Pi') && !detectedPlatforms.includes('Pi Pico') && !detectedPlatforms.includes('ESP32'));
    const isESP32Host = detectedPlatforms.includes('ESP32');
    const isPiHost = detectedPlatforms.includes('Raspberry Pi');
    const isPicoHost = detectedPlatforms.includes('Pi Pico');

    // ── Ambiguity & Gaps ───────────────────────────────────────────────────
    // Check if pins are specified in the prompt (e.g., D2, pin 5, GPIO 4)
    const pinRegex = /\b(pin\s*\d+|gpio\s*\d+|d\d+|a\d+)\b/i;
    const hasPins = pinRegex.test(prompt);

    if (detectedComponents.some(c => c.includes('DHT') || c.includes('Servo') || c.includes('NeoPixel') || c.includes('Relay') || c.includes('Ultrasonic'))) {
      if (!hasPins) {
        let suggestedPin = 'D2';
        if (isPiHost) suggestedPin = 'GPIO 4';
        else if (isESP32Host) suggestedPin = 'GPIO 4 / D4';
        else if (isPicoHost) suggestedPin = 'GP15';
        gaps.push(`Pin assignment undefined. We will default to a standard GPIO pin (${suggestedPin}). Make sure to specify your exact wiring if it differs.`);
      }
    }

    // Check if I2C address is defined for LCD/OLED
    if (detectedComponents.some(c => c.includes('LCD') || c.includes('OLED'))) {
      const hexAddrRegex = /\b0x[0-9a-f]{2}\b/i;
      const hasHexAddr = hexAddrRegex.test(prompt);
      if (!hasHexAddr) {
        const isLCD = detectedComponents.some(c => c.includes('LCD'));
        const defaultAddr = isLCD ? '0x27' : '0x3C';
        const componentName = isLCD ? 'I2C LCD' : 'SSD1306 OLED';
        gaps.push(`I2C address is missing. The ${componentName} typically defaults to '${defaultAddr}'. We will initialize it with this address, but verify your hardware configuration.`);
      }
    }

    // Identify required context libraries
    const libraries: string[] = [];
    if (detectedComponents.some(c => c.includes('LCD'))) {
      libraries.push(isArduinoHost ? 'LiquidCrystal_I2C' : 'smbus2 (Python)');
    }
    if (detectedComponents.some(c => c.includes('OLED'))) {
      libraries.push(isArduinoHost ? 'Adafruit_SSD1306 and Adafruit_GFX' : 'luma.oled (Python)');
    }
    if (detectedComponents.some(c => c.includes('DHT'))) {
      libraries.push(isArduinoHost ? 'DHT sensor library (Adafruit)' : 'Adafruit_DHT (Python)');
    }
    if (detectedComponents.some(c => c.includes('NeoPixel'))) {
      libraries.push(isArduinoHost ? 'Adafruit_NeoPixel' : 'rpi_ws281x (Python)');
    }
    if (libraries.length > 0) {
      gaps.push(`Missing library context. The following library headers must be included: ${libraries.join(', ')}.`);
    }

    // ── Electrical & Logic Safety ──────────────────────────────────────────
    // VCC / Voltage Level Shift Warning
    // Arduino Uno/Mega operate at 5V logic. ESP32, Raspberry Pi, Pi Pico operate at 3.3V logic.
    // If user mixes 3.3V host with components that output 5V or require 5V signals, alert.
    const is33VHost = isESP32Host || isPiHost || isPicoHost;
    if (is33VHost) {
      // Common 5V components
      const has5VComponents = detectedComponents.some(c => c.includes('Ultrasonic') || c.includes('LCD') || c.includes('Relay'));
      if (has5VComponents || lower.includes('5v')) {
        safetyHazards.push(`Voltage Level Mismatch (3.3V vs 5V): Your selected host (${detectedPlatforms.join('/') || '3.3V MCU'}) operates at 3.3V logic levels. Connecting a 5V sensor output directly to a 3.3V GPIO will damage the pin. Recommend using a bidirectional logic level shifter (like TXS0108E) or a voltage divider for signals going from sensor to MCU.`);
      }
    }

    // High frequency sensor reading with blocking delay()
    const isHighFrequency = lower.includes('continuous') || lower.includes('realtime') || lower.includes('every second') || lower.includes('real-time') || lower.includes('fast') || lower.includes('constantly');
    const hasDelayKeywords = lower.includes('delay') || lower.includes('sleep') || lower.includes('wait');
    if (isHighFrequency && hasDelayKeywords) {
      safetyHazards.push(`Blocking execution delay() hazard: High-frequency tasks or sensor polling should avoid blocking delays. Using delay() freezes execution and blocks interrupts, network events, or button presses. Recommend implementing a non-blocking millis() or timer interrupt cycle instead.`);
    }

    // ── Code Optimizations ─────────────────────────────────────────────────
    // AVR memory constraints
    const isAVR = lower.includes('uno') || lower.includes('nano') || lower.includes('mega') || lower.includes('atmega328') || lower.includes('avr');
    if (isAVR && (lower.includes('string') || lower.includes('json') || lower.includes('web') || lower.includes('server') || detectedComponents.some(c => c.includes('OLED')))) {
      optimizations.push(`AVR RAM Constraint (2KB SRAM limit): Arduino Uno/Nano are highly memory-constrained. Using the dynamic 'String' class or allocating large display buffers leads to rapid heap fragmentation and silent crashes. Use static character arrays (char[]), avoid dynamic allocation, and wrap serial string literals in the F() macro (e.g. Serial.println(F("Hello"))).`);
    }

    // Low power deep sleep advice
    const isBatteryPowered = lower.includes('battery') || lower.includes('solar') || lower.includes('low power') || lower.includes('power saving') || lower.includes('lipo') || lower.includes('power-saving');
    if (isBatteryPowered) {
      optimizations.push(`Battery/Low-Power Mode detected: To maximize battery life, avoid active loop polling which consumes high power (~15-80mA). Recommend putting the MCU into deep sleep mode, configuring a timer or external GPIO interrupt to wake the board up, performing the reading, and immediately going back to sleep.`);
    }
  }

  return {
    isHardware,
    detectedPlatforms,
    detectedComponents,
    detectedProtocols,
    gaps,
    safetyHazards,
    optimizations
  };
}

export function optimizePromptText(prompt: string, analysis: PromptAnalysis): string {
  const normalized = prompt.trim();
  
  if (analysis.hardware && analysis.hardware.isHardware) {
    const hw = analysis.hardware;
    const host = hw.detectedPlatforms.length > 0 ? hw.detectedPlatforms.join('/') : 'Microcontroller (e.g. Arduino Nano / ESP32)';
    
    // Construct components list
    const componentsList = hw.detectedComponents.length > 0 
      ? hw.detectedComponents.map(c => `  - ${c}`).join('\n')
      : '  - [Specify sensor/actuator model here]';
      
    // Construct protocols list
    const protocolsList = hw.detectedProtocols.length > 0
      ? hw.detectedProtocols.map(p => `  - ${p}`).join('\n')
      : '  - GPIO / Digital Signals';

    // Construct pins list
    const pinsList = hw.detectedComponents.length > 0
      ? hw.detectedComponents.map((c, i) => {
          let pin = `D${2 + i}`;
          if (host.includes('Raspberry Pi') && !host.includes('Pico')) pin = `GPIO ${4 + i}`;
          if (host.includes('Pico')) pin = `GP${15 + i}`;
          return `  - ${c}: connected to ${pin}`;
        }).join('\n')
      : '  - [Map your components to specific GPIO pins]';

    let optimized = `[SYSTEM: HARDWARE ENGINEERING SPECIFICATION]
# Target Platform & Board
- **Host Controller:** ${host}
- **Operating Environment:** Bare metal loop, non-blocking timing

# Bill of Materials & Interfaces
- **Detected Components:**
${componentsList}
- **Communication Protocols:**
${protocolsList}

# Physical Connections & Pinout
${pinsList}

# Safety & Logic Hardening
- **Voltage Requirements:** Use proper logic level shifts (e.g. 5V sensors interfacing with 3.3V ESP32/Pi require a level shifter).
- **Execution Mode:** Zero blocking delays. Implement high-frequency loops using non-blocking \`millis()\` timing or hardware interrupts.

# Memory & Performance Tuning
- Avoid dynamic memory allocations (\`String\` class). Use fixed-size buffers and static character arrays.
- Implement low-power deep sleep cycles if powered by battery or solar.

# Original User Intent
"${normalized}"
`;
    return optimized;
  } else {
    // Software/General prompt improver
    const lang = analysis.primaryLanguage 
      ? LANG_SIGNATURES.find(s => s.id === analysis.primaryLanguage)?.name || analysis.primaryLanguage
      : 'General Programming';
    const fw = analysis.frameworks.length > 0 ? analysis.frameworks.join(', ') : 'Vanilla / Standard Libraries';
    
    let optimized = `[SYSTEM: SOFTWARE ENGINEERING SPECIFICATION]
# Language & Architecture
- **Primary Language:** ${lang}
- **Frameworks / Ecosystem:** ${fw}
- **Implementation Strategy:** Clean Code, modular design, complete error handling

# Key Engineering Goals
- **Robust Error Gates:** Wrap operations in safe try-catch blocks or monadic error values. Check parameters before execution.
- **Complexity Tuning:** Keep methods clean and DRY (Don't Repeat Yourself). Implement proper type structures and interfaces.
- **Resource Management:** Ensure open streams, handles, or network sockets are correctly closed/disposed.

# Original User Request
"${normalized}"
`;
    return optimized;
  }
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
  // Allow greetings and common introductory inputs or identity queries
  const GREETINGS = /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up)\b/i;
  const IDENTITY = /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx)\b/i;
  if (GREETINGS.test(prompt.trim()) || IDENTITY.test(prompt.trim())) return true;

  // If languages or frameworks detected, it's code-related
  if (languages.length > 0 || frameworks.length > 0) return true;

  // ★ PRIMARY GATE: If the prompt mentions ANY programming language, framework,
  // coding tool, or tech concept — it's code-related. No question format required.
  // This is the catch-all that ensures "HTML", "learn python", "CSS tricks",
  // "what is JavaScript", "tell me about React", etc. are NEVER rejected.
  if (MENTIONS_CODE_TECH.test(prompt)) return true;

  // If intent is clearly code-related (including 'explain' for coding Q&A)
  if (['generate', 'refactor', 'debug', 'convert', 'optimize', 'review', 'integrate', 'test', 'deploy', 'explain', 'general'].includes(intent)) {
    // Single pattern match is enough when intent already suggests code context
    if (CODE_RELATED_PATTERNS.some(p => p.test(prompt))) return true;
  }

  // Check for explicit non-code patterns
  if (NON_CODE_PATTERNS.some(p => p.test(prompt))) return false;

  // Check for code-related patterns as a final pass (reduced threshold)
  const codeMatches = CODE_RELATED_PATTERNS.filter(p => p.test(prompt)).length;
  return codeMatches >= 1;
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
    return '💬 General Conversation';
  }

  const langStr = primaryLanguage
    ? LANG_SIGNATURES.find(s => s.id === primaryLanguage)?.name || primaryLanguage
    : 'general';
  const fwStr = frameworks.length > 0 ? ` using ${frameworks.slice(0, 3).join(', ')}` : '';
  const intentStr = intent === 'general' ? 'coding task' : intent;

  return `🧠 ${complexity.charAt(0).toUpperCase() + complexity.slice(1)} ${langStr} ${intentStr}${fwStr}`;
}

export const NON_CODE_REJECTION = `I am NYX, your premium AI developer assistant. I specialize in software development and embedded hardware systems.

To keep my outputs high-performance and focused, I only handle programming, debugging, architecture, and developer-related tasks.

**I can help you with:**
- 🏗️ Building applications, APIs, and websites
- 🐛 Debugging and fixing code issues
- ♻️ Refactoring and optimizing code
- 📝 Writing tests and documentation
- 🔌 Integrating APIs and services
- 🚀 Deployment and DevOps

Please describe your coding task, and I'll deliver production-ready results!`;

/**
 * Checks if a user is asking to debug/fix an error or compile failure, but has omitted
 * both the code snippet and the specific error logs.
 */
export function isMissingDebugDetails(prompt: string, intent: string): boolean {
  const lower = prompt.toLowerCase();
  
  // Check if user is asking to debug/fix an error/bug
  const hasErrorKeywords = /\b(error|bug|crash|exception|compile\s+error|not\s+compiling|fails?\s+to\s+compile|getting\s+an?\s+error|got\s+an?\s+error|cannot\s+compile|wont\s+compile|won't\s+compile|how\s+to\s+fix|what\s+can\s+be\s+the\s+problem|why\s+is\s+it\s+failing)\b/i.test(lower);
  
  if (!hasErrorKeywords && intent !== 'debug') return false;
  
  // Check if there is NO code block or visible code keywords (e.g. semicolons, curly braces, code blocks)
  const hasCodeBlock = prompt.includes('```') || prompt.includes('    ') || (prompt.match(/[{}();]/g) || []).length > 6;
  if (hasCodeBlock) return false;
  
  // Check if the prompt doesn't actually provide any specific error details.
  const isVagueErrorQuery = 
    /error\s+message/i.test(lower) || 
    /getting\s+an?\s+error/i.test(lower) || 
    /fails?\s+to\s+compile/i.test(lower) || 
    /won't\s+compile/i.test(lower) || 
    /not\s+compiling/i.test(lower) || 
    /code\s+not\s+working/i.test(lower) ||
    /problem\s+compiling/i.test(lower) ||
    /error\s+when\s+i\s+try\s+to\s+compile/i.test(lower) ||
    /cannot\s+compile/i.test(lower) ||
    /what\s+can\s+be\s+the\s+problem/i.test(lower);
    
  // If the prompt is short (under 45 words) and lacks code/error snippets, it is almost certainly a request without actual context.
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount < 45 && isVagueErrorQuery) {
    return true;
  }
  
  return false;
}

/**
 * High-end Gemini-style response politely requesting the user to paste their code and compiler outputs.
 */
export const MISSING_DEBUG_DETAILS_RESPONSE = `I would love to help you analyze and fix your compilation or code error! 

However, it looks like you haven't shared your code snippet or the specific error message yet. 

**To help me diagnose and fix the issue accurately, please provide:**
1. 💻 **Your Code**: Paste the code snippet you are trying to run or compile.
2. 📋 **The Error Message**: Paste the exact error logs or compiler output you are seeing in your IDE (such as the Arduino IDE output window).

Once you share those details, I will instantly analyze the logic, pinpoint the exact cause of the crash or compile failure, and provide a clean, optimized, and ready-to-use fix!`;
