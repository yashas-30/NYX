/**
 * @file patterns.ts
 * @description Language and framework detection patterns for prompt classification.
 */

import type { LanguagePattern, FrameworkPattern } from './types';

// ---------------------------------------------------------------------------
// Language detection patterns (with token multipliers for estimation)
// ---------------------------------------------------------------------------

export const LANGUAGE_PATTERNS: LanguagePattern[] = [
  { id: 'typescript', pattern: /\b(typescript|\.ts\b|tsx|interface|type\s+\w+\s*=|as\s+\w+)/i, tokenMultiplier: 3.5 },
  { id: 'javascript', pattern: /\b(javascript|\.js\b|jsx|const|let|var|=>|function\s*\()/i, tokenMultiplier: 3.5 },
  { id: 'python', pattern: /\b(python|\.py\b|def\s|class\s|import\s|from\s|pip\s|conda)/i, tokenMultiplier: 3.0 },
  { id: 'rust', pattern: /\b(rust|\.rs\b|fn\s|impl\s|struct\s|enum\s|cargo|crate)/i, tokenMultiplier: 2.5 },
  { id: 'go', pattern: /\b(golang|\.go\b|func\s|package\s|import\s*\(|go\s+mod)/i, tokenMultiplier: 3.0 },
  { id: 'java', pattern: /\b(java|\.java\b|public\s+class|void\s|Spring\s+Boot)/i, tokenMultiplier: 4.0 },
  { id: 'cpp', pattern: /\b(c\+\+|\.cpp\b|\.hpp\b|#include|std::|template\s*<)/i, tokenMultiplier: 3.5 },
  { id: 'csharp', pattern: /\b(c#|\.cs\b|using\s+|namespace|var\s|async\s|await\s)/i, tokenMultiplier: 3.5 },
  { id: 'sql', pattern: /\b(sql|SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE|ALTER|JOIN)/i, tokenMultiplier: 2.5 },
  { id: 'html', pattern: /\b(html|<div|<span|<section|<article|class=|id=)/i, tokenMultiplier: 2.0 },
  { id: 'css', pattern: /\b(css|scss|tailwind|flex|grid|margin|padding|border|color:)/i, tokenMultiplier: 2.0 },
  { id: 'shell', pattern: /\b(bash|shell|chmod|grep|awk|sed|curl|wget|sudo)/i, tokenMultiplier: 2.0 },
  { id: 'ruby', pattern: /\b(ruby|\.rb\b|Rails|RSpec|Gemfile|bundle)/i, tokenMultiplier: 3.5 },
  { id: 'php', pattern: /\b(php|\.php\b|Laravel|Composer|\$this|\$_)/i, tokenMultiplier: 3.5 },
  { id: 'swift', pattern: /\b(swift|\.swift\b|SwiftUI|struct\s+\w+\s*:\s*View)/i, tokenMultiplier: 3.5 },
  { id: 'kotlin', pattern: /\b(kotlin|\.kt\b|fun\s|val\s|var\s|suspend\s|coroutine)/i, tokenMultiplier: 3.5 },
  { id: 'dart', pattern: /\b(dart|\.dart\b|Flutter|Widget|StatelessWidget|StatefulWidget)/i, tokenMultiplier: 3.5 },
  { id: 'scala', pattern: /\b(scala|\.scala\b|val\s|def\s|object\s|trait\s|case\s+class)/i, tokenMultiplier: 3.0 },
  { id: 'elixir', pattern: /\b(elixir|\.ex\b|defmodule|def\s|pipe|@spec|defp)/i, tokenMultiplier: 3.0 },
  { id: 'solidity', pattern: /\b(solidity|\.sol\b|contract\s|function\s|mapping|pragma)/i, tokenMultiplier: 3.0 },
];

// ---------------------------------------------------------------------------
// Framework detection patterns
// ---------------------------------------------------------------------------

export const FRAMEWORK_PATTERNS: FrameworkPattern[] = [
  { id: 'react', pattern: /\b(react|jsx|tsx|useState|useEffect|component|props|children)/i, aliases: ['reactjs'], tokenMultiplier: 0 },
  { id: 'nextjs', pattern: /\b(next\.?js|getServerSideProps|getStaticProps|app\s+router|pages\s+router|server\s+component)/i, aliases: ['next'], tokenMultiplier: 0 },
  { id: 'vue', pattern: /\b(vue|\.vue\b|v-bind|v-if|v-for|ref\(|computed|watch)/i, aliases: ['vuejs'], tokenMultiplier: 0 },
  { id: 'svelte', pattern: /\b(svelte|\.svelte\b|\$:\s|on:click|\{#if|\{#each)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'angular', pattern: /\b(angular|@Component|@Injectable|ngOnInit|templateUrl)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'express', pattern: /\b(express|app\.(get|post|put|delete|use)|middleware|req\.|res\.)/i, aliases: ['expressjs'], tokenMultiplier: 0 },
  { id: 'fastapi', pattern: /\b(fastapi|@app\.(get|post)|Depends|HTTPException|Pydantic)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'django', pattern: /\b(django|models\.Model|views\.|urls\.py|settings\.|admin\.)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'flask', pattern: /\b(flask|@app\.route|render_template|request\.)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'spring', pattern: /\b(spring|@RestController|@Autowired|@Service|@Repository)/i, aliases: ['springboot'], tokenMultiplier: 0 },
  { id: 'rails', pattern: /\b(rails|ActiveRecord|has_many|belongs_to|before_action)/i, aliases: ['rubyonrails'], tokenMultiplier: 0 },
  { id: 'laravel', pattern: /\b(laravel|Eloquent|@Route|Route::|artisan)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'tailwind', pattern: /\b(tailwind|class="(flex|grid|bg-|text-|p-|m-|w-|h-))/i, aliases: ['tailwindcss'], tokenMultiplier: 0 },
  { id: 'prisma', pattern: /\b(prisma|schema\.prisma|@prisma|PrismaClient|\.findMany|\.create)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'drizzle', pattern: /\b(drizzle|drizzle-orm|pgTable|mysqlTable|sqliteTable|\.select|\.insert)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'docker', pattern: /\b(docker|Dockerfile|docker-compose|FROM\s|RUN\s|COPY\s|EXPOSE)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'kubernetes', pattern: /\b(kubernetes|k8s|kubectl|Deployment|Service|Pod|ConfigMap)/i, aliases: ['k8s'], tokenMultiplier: 0 },
  { id: 'terraform', pattern: /\b(terraform|\.tf\b|resource\s|variable\s|module\s|provider\s)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'git', pattern: /\b(git|commit|branch|merge|rebase|stash|pull|push|clone)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'graphql', pattern: /\b(graphql|query\s|mutation\s|subscription|resolver|schema\s*\{)/i, aliases: ['gql'], tokenMultiplier: 0 },
  { id: 'rest', pattern: /\b(rest|api|endpoint|GET|POST|PUT|DELETE|status\s+code|200|404|500)/i, aliases: ['restapi'], tokenMultiplier: 0 },
  { id: 'websocket', pattern: /\b(websocket|ws:|wss:|socket\.io|onmessage|send\()/i, aliases: ['ws'], tokenMultiplier: 0 },
  { id: 'redis', pattern: /\b(redis|REDIS|setex|getset|pub|sub|cache)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'postgres', pattern: /\b(postgres|postgresql|pg_|psql|CREATE\s+TABLE|ALTER\s+TABLE)/i, aliases: ['postgresql'], tokenMultiplier: 0 },
  { id: 'mysql', pattern: /\b(mysql|MySQL|InnoDB|AUTO_INCREMENT|ENGINE=)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'mongo', pattern: /\b(mongodb|mongo|\.findOne|\.find\(|aggregate|collection|Document)/i, aliases: ['mongodb'], tokenMultiplier: 0 },
  { id: 'supabase', pattern: /\b(supabase|@supabase|createClient|from\(|\.eq\(|\.select\()/i, aliases: [], tokenMultiplier: 0 },
  { id: 'firebase', pattern: /\b(firebase|firestore|getFirestore|collection|doc\(|addDoc)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'trpc', pattern: /\b(t\.|trpc|router\.|procedure|query\(|mutation\()/i, aliases: [], tokenMultiplier: 0 },
  { id: 'zod', pattern: /\b(zod|z\.|zod\.|schema\.parse|safeParse)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'shadcn', pattern: /\b(shadcn|shadcn-ui|@shadcn|npx\s+shadcn)/i, aliases: [], tokenMultiplier: 0 },
  { id: 'astro', pattern: /\b(astro|\.astro\b|frontmatter|---\s*\n)/i, aliases: [], tokenMultiplier: 0 },
];
