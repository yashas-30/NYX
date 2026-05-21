/**
 * @file src/config/codingKnowledge.ts
 * @description Comprehensive coding language knowledge base for the Nyx agent.
 * Contains expert-level references for 40+ languages and platforms covering ecosystems,
 * idioms, frameworks, build tools, and modern conventions.
 */

export interface LanguageProfile {
  name: string;
  extensions: string[];
  typing: string;
  paradigms: string[];
  packageManager: string;
  buildTools: string[];
  testFrameworks: string[];
  linters: string[];
  frameworks: string[];
  modernIdioms: string[];
  errorHandling: string;
  concurrency: string;
  deployTargets: string[];
}

export const LANGUAGE_PROFILES: Record<string, LanguageProfile> = {
  javascript: {
    name: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    typing: 'Dynamic, weakly-typed',
    paradigms: ['functional', 'object-oriented', 'event-driven', 'prototype-based'],
    packageManager: 'npm / yarn / pnpm / bun',
    buildTools: ['Vite', 'esbuild', 'webpack', 'Rollup', 'Parcel', 'Turbopack'],
    testFrameworks: ['Vitest', 'Jest', 'Mocha', 'Playwright', 'Cypress'],
    linters: ['ESLint', 'Biome', 'Prettier'],
    frameworks: ['React', 'Vue', 'Svelte', 'Angular', 'Next.js', 'Nuxt', 'Astro', 'Express', 'Fastify', 'Hono', 'Remix', 'SolidJS', 'Qwik'],
    modernIdioms: [
      'Use const/let, never var',
      'Arrow functions for callbacks',
      'Destructuring assignment',
      'Optional chaining (?.) and nullish coalescing (??)',
      'Promise.all / Promise.allSettled for parallel async',
      'Array methods (map, filter, reduce) over for-loops',
      'ES modules (import/export) over CommonJS (require)',
      'Template literals for string interpolation',
      'Spread/rest operators',
      'Top-level await in ESM modules'
    ],
    errorHandling: 'try/catch with Error subclasses, Promise.catch(), error boundaries in React',
    concurrency: 'Single-threaded event loop, Web Workers, async/await, Promises',
    deployTargets: ['Vercel', 'Netlify', 'Cloudflare Workers', 'AWS Lambda', 'Deno Deploy', 'Node.js']
  },

  typescript: {
    name: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    typing: 'Static, strongly-typed with structural typing',
    paradigms: ['functional', 'object-oriented', 'generic programming'],
    packageManager: 'npm / yarn / pnpm / bun',
    buildTools: ['tsc', 'Vite', 'esbuild', 'SWC', 'tsup', 'tsx'],
    testFrameworks: ['Vitest', 'Jest', 'Playwright', 'Cypress'],
    linters: ['ESLint + typescript-eslint', 'Biome', 'Prettier'],
    frameworks: ['React', 'Next.js', 'NestJS', 'tRPC', 'Fastify', 'Hono', 'Angular', 'Astro', 'SvelteKit'],
    modernIdioms: [
      'Strict mode (strict: true in tsconfig)',
      'Discriminated unions over type assertions',
      'Zod/Valibot for runtime validation',
      'Generic types for reusable components',
      'satisfies operator for type narrowing',
      'const assertions (as const)',
      'Template literal types',
      'Mapped and conditional types',
      'Never use `any` — use `unknown` with type guards',
      'Infer return types where possible, annotate parameters'
    ],
    errorHandling: 'Typed error classes, Result<T,E> patterns, discriminated union error types',
    concurrency: 'Same as JavaScript — async/await, Promises, Web Workers',
    deployTargets: ['Vercel', 'Cloudflare Workers', 'AWS Lambda', 'Deno Deploy', 'Bun', 'Node.js']
  },

  python: {
    name: 'Python',
    extensions: ['.py', '.pyx', '.pyi'],
    typing: 'Dynamic, strongly-typed (optional type hints)',
    paradigms: ['object-oriented', 'functional', 'procedural', 'scripting'],
    packageManager: 'pip / uv / poetry / conda / pdm',
    buildTools: ['setuptools', 'hatch', 'maturin', 'pyproject.toml', 'uv'],
    testFrameworks: ['pytest', 'unittest', 'hypothesis'],
    linters: ['ruff', 'mypy', 'pyright', 'black', 'isort'],
    frameworks: ['FastAPI', 'Django', 'Flask', 'Starlette', 'LangChain', 'Pydantic', 'SQLAlchemy', 'Celery', 'Streamlit', 'Gradio'],
    modernIdioms: [
      'Type hints on all function signatures (PEP 484/526)',
      'f-strings for formatting',
      'dataclasses and Pydantic models over raw dicts',
      'match/case (structural pattern matching, 3.10+)',
      'Walrus operator (:=)',
      'List/dict/set comprehensions',
      'Context managers (with statement)',
      'pathlib.Path over os.path',
      'asyncio for async I/O',
      'Generators and itertools for memory efficiency'
    ],
    errorHandling: 'try/except/finally, custom Exception subclasses, contextlib.suppress',
    concurrency: 'asyncio, threading, multiprocessing, concurrent.futures, GIL limitations',
    deployTargets: ['Docker', 'AWS Lambda', 'GCP Cloud Run', 'Railway', 'Fly.io', 'Heroku']
  },

  rust: {
    name: 'Rust',
    extensions: ['.rs'],
    typing: 'Static, strongly-typed with ownership system',
    paradigms: ['systems programming', 'functional', 'concurrent', 'zero-cost abstractions'],
    packageManager: 'cargo (crates.io)',
    buildTools: ['cargo', 'rustc', 'miri', 'clippy'],
    testFrameworks: ['built-in #[test]', 'criterion (benchmarks)', 'proptest'],
    linters: ['clippy', 'rustfmt'],
    frameworks: ['Actix-web', 'Axum', 'Rocket', 'Tokio', 'Bevy', 'Tauri', 'Leptos', 'Yew', 'wasm-bindgen'],
    modernIdioms: [
      'Ownership, borrowing, and lifetimes',
      'Result<T, E> and Option<T> over null/exceptions',
      'The ? operator for error propagation',
      'Pattern matching with match and if let',
      'Traits over inheritance',
      'Iterator combinators (map, filter, collect)',
      'derive macros for common traits',
      'impl blocks for methods',
      'Module system with mod and use',
      'Smart pointers: Box, Rc, Arc, RefCell'
    ],
    errorHandling: 'Result<T, E>, Option<T>, thiserror/anyhow crates, ? operator, never panic in libraries',
    concurrency: 'Fearless concurrency — Send/Sync traits, tokio async runtime, channels, Arc<Mutex<T>>',
    deployTargets: ['Native binary', 'WASM', 'Docker', 'Embedded systems', 'AWS Lambda (via cargo-lambda)']
  },

  go: {
    name: 'Go (Golang)',
    extensions: ['.go'],
    typing: 'Static, strongly-typed with interfaces',
    paradigms: ['concurrent', 'procedural', 'interface-based'],
    packageManager: 'go modules (go.mod)',
    buildTools: ['go build', 'go run', 'go generate', 'GoReleaser'],
    testFrameworks: ['built-in testing package', 'testify', 'gomock'],
    linters: ['golangci-lint', 'gofmt', 'go vet', 'staticcheck'],
    frameworks: ['Gin', 'Echo', 'Fiber', 'Chi', 'net/http stdlib', 'gRPC', 'GORM', 'Ent'],
    modernIdioms: [
      'Error values over exceptions (err != nil pattern)',
      'Interfaces are implicit (structural typing)',
      'Goroutines and channels for concurrency',
      'Defer for cleanup',
      'Table-driven tests',
      'Context propagation for cancellation',
      'errors.Is/errors.As for error wrapping (Go 1.13+)',
      'Generics (Go 1.18+)',
      'Embed directive for static assets',
      'Minimal and flat package structure'
    ],
    errorHandling: 'Return error as last value, wrap with fmt.Errorf("%w"), errors.Is/As, sentinel errors',
    concurrency: 'Goroutines, channels, select, sync.WaitGroup, sync.Mutex, context.Context',
    deployTargets: ['Native binary', 'Docker', 'Kubernetes', 'AWS Lambda', 'GCP Cloud Run']
  },

  java: {
    name: 'Java',
    extensions: ['.java'],
    typing: 'Static, strongly-typed with generics',
    paradigms: ['object-oriented', 'functional (since Java 8)', 'generic'],
    packageManager: 'Maven / Gradle',
    buildTools: ['Maven', 'Gradle', 'javac', 'jlink'],
    testFrameworks: ['JUnit 5', 'Mockito', 'AssertJ', 'TestContainers'],
    linters: ['Checkstyle', 'SpotBugs', 'PMD', 'SonarQube'],
    frameworks: ['Spring Boot', 'Quarkus', 'Micronaut', 'Jakarta EE', 'Vert.x', 'Hibernate', 'jOOQ'],
    modernIdioms: [
      'Records for data classes (Java 14+)',
      'Sealed classes and interfaces (Java 17+)',
      'Pattern matching for instanceof (Java 16+)',
      'Switch expressions (Java 14+)',
      'Text blocks (Java 13+)',
      'var for local type inference (Java 10+)',
      'Streams API for functional collection processing',
      'Optional<T> over null returns',
      'CompletableFuture for async',
      'Virtual threads (Project Loom, Java 21+)'
    ],
    errorHandling: 'Checked/unchecked exceptions, try-with-resources, Optional<T>',
    concurrency: 'Virtual threads (21+), CompletableFuture, ExecutorService, synchronized, java.util.concurrent',
    deployTargets: ['Docker', 'Kubernetes', 'AWS Lambda', 'Spring Boot JAR', 'GraalVM native-image']
  },

  kotlin: {
    name: 'Kotlin',
    extensions: ['.kt', '.kts'],
    typing: 'Static, strongly-typed with null safety',
    paradigms: ['object-oriented', 'functional', 'coroutine-based concurrency'],
    packageManager: 'Gradle / Maven',
    buildTools: ['Gradle (Kotlin DSL)', 'Maven', 'kotlinc'],
    testFrameworks: ['JUnit 5', 'Kotest', 'MockK'],
    linters: ['ktlint', 'detekt'],
    frameworks: ['Ktor', 'Spring Boot', 'Jetpack Compose', 'Exposed', 'Arrow', 'KMM'],
    modernIdioms: [
      'Null safety (?, !!, let, Elvis operator ?:)',
      'Data classes for value types',
      'Sealed classes for restricted hierarchies',
      'Extension functions',
      'Coroutines for structured concurrency',
      'Scope functions (let, run, with, apply, also)',
      'String templates',
      'when expression (exhaustive matching)',
      'Delegation pattern (by keyword)',
      'Flow for reactive streams'
    ],
    errorHandling: 'Result<T>, runCatching, sealed class error hierarchies, require/check preconditions',
    concurrency: 'Coroutines (launch, async, withContext), Flow, Channels, structured concurrency',
    deployTargets: ['Android', 'JVM', 'Kotlin/Native', 'Kotlin/JS', 'KMP multiplatform']
  },

  c: {
    name: 'C',
    extensions: ['.c', '.h'],
    typing: 'Static, weakly-typed',
    paradigms: ['procedural', 'systems programming'],
    packageManager: 'vcpkg / conan / system packages',
    buildTools: ['gcc', 'clang', 'CMake', 'Make', 'Meson', 'Ninja'],
    testFrameworks: ['Unity', 'CMocka', 'Check', 'CUnit'],
    linters: ['clang-tidy', 'cppcheck', 'Valgrind', 'AddressSanitizer'],
    frameworks: ['POSIX', 'SDL2', 'GTK', 'libuv', 'OpenSSL'],
    modernIdioms: [
      'C11/C17/C23 standards',
      'Static assertions (_Static_assert)',
      'Designated initializers',
      'Compound literals',
      'Flexible array members',
      'Restrict pointers for optimization hints',
      'Inline functions over macros when possible',
      '_Atomic types for lock-free programming',
      'Always check return values and handle errors',
      'Use sizeof on variables, not types'
    ],
    errorHandling: 'Return codes (0=success, -1=error), errno, goto cleanup pattern',
    concurrency: 'pthreads, C11 threads, atomics, mutexes, condition variables',
    deployTargets: ['Native binary', 'Embedded systems', 'OS kernels', 'WASM (via Emscripten)']
  },

  cpp: {
    name: 'C++',
    extensions: ['.cpp', '.cxx', '.cc', '.hpp', '.hxx', '.h'],
    typing: 'Static, strongly-typed with templates',
    paradigms: ['multi-paradigm', 'object-oriented', 'generic', 'functional'],
    packageManager: 'vcpkg / conan / CPM.cmake',
    buildTools: ['CMake', 'Make', 'Meson', 'Bazel', 'xmake', 'g++', 'clang++'],
    testFrameworks: ['Google Test', 'Catch2', 'doctest', 'Google Benchmark'],
    linters: ['clang-tidy', 'cppcheck', 'cpplint', 'AddressSanitizer'],
    frameworks: ['Qt', 'Boost', 'POCO', 'Abseil', 'gRPC', 'Unreal Engine', 'SDL2', 'SFML', 'Dear ImGui'],
    modernIdioms: [
      'C++20/23 features (concepts, ranges, modules, coroutines)',
      'Smart pointers (unique_ptr, shared_ptr) — never raw new/delete',
      'RAII for resource management',
      'std::optional, std::variant, std::expected',
      'Structured bindings (auto [a, b] = ...)',
      'Range-based for loops',
      'constexpr for compile-time computation',
      'Move semantics and perfect forwarding',
      'std::string_view over const std::string&',
      'Concepts for template constraints (C++20)'
    ],
    errorHandling: 'Exceptions, std::expected (C++23), error codes, RAII for cleanup',
    concurrency: 'std::thread, std::async, std::mutex, atomics, coroutines (C++20), thread pools',
    deployTargets: ['Native binary', 'Game engines', 'Embedded', 'WASM', 'Desktop apps']
  },

  csharp: {
    name: 'C#',
    extensions: ['.cs'],
    typing: 'Static, strongly-typed with nullable reference types',
    paradigms: ['object-oriented', 'functional', 'generic', 'async'],
    packageManager: 'NuGet',
    buildTools: ['dotnet CLI', 'MSBuild', 'Visual Studio'],
    testFrameworks: ['xUnit', 'NUnit', 'MSTest', 'FluentAssertions'],
    linters: ['Roslyn analyzers', 'StyleCop', 'SonarAnalyzer'],
    frameworks: ['ASP.NET Core', 'Entity Framework Core', 'Blazor', 'MAUI', '.NET Aspire', 'MediatR', 'SignalR', 'Unity'],
    modernIdioms: [
      'Nullable reference types (enable nullable)',
      'Records for immutable data types',
      'Pattern matching (is, switch expressions)',
      'Top-level statements (minimal APIs)',
      'LINQ for data queries',
      'async/await throughout',
      'Primary constructors (C# 12)',
      'Collection expressions (C# 12)',
      'Global usings and file-scoped namespaces',
      'Source generators for compile-time codegen'
    ],
    errorHandling: 'Exceptions, Result pattern, FluentResults, IExceptionHandler in ASP.NET',
    concurrency: 'async/await, Task, ValueTask, Channels, System.Threading, Parallel.ForEach',
    deployTargets: ['.NET self-contained', 'Docker', 'Azure', 'AWS Lambda', 'IIS']
  },

  swift: {
    name: 'Swift',
    extensions: ['.swift'],
    typing: 'Static, strongly-typed with optionals',
    paradigms: ['protocol-oriented', 'object-oriented', 'functional'],
    packageManager: 'Swift Package Manager (SPM)',
    buildTools: ['swift build', 'xcodebuild', 'Tuist'],
    testFrameworks: ['XCTest', 'Swift Testing', 'Quick/Nimble'],
    linters: ['SwiftLint', 'SwiftFormat'],
    frameworks: ['SwiftUI', 'UIKit', 'Combine', 'Vapor', 'SwiftData', 'Core Data', 'ARKit'],
    modernIdioms: [
      'Optionals and optional binding (if let, guard let)',
      'Structured concurrency (async/await, actors)',
      'Property wrappers (@State, @Binding, @Published)',
      'Result builders',
      'Protocols with default implementations',
      'Value types (structs) over reference types (classes) by default',
      'Codable for serialization',
      'Enums with associated values',
      'Closures with trailing syntax',
      'Macro system (Swift 5.9+)'
    ],
    errorHandling: 'throws/try/catch, Result<Success, Failure>, Optional for absence',
    concurrency: 'Swift concurrency: async/await, actors, TaskGroup, AsyncSequence, Sendable',
    deployTargets: ['iOS', 'macOS', 'watchOS', 'tvOS', 'visionOS', 'Linux (Vapor)']
  },

  ruby: {
    name: 'Ruby',
    extensions: ['.rb', '.rake', '.gemspec'],
    typing: 'Dynamic, strongly-typed (duck typing)',
    paradigms: ['object-oriented', 'functional', 'metaprogramming'],
    packageManager: 'Bundler (RubyGems)',
    buildTools: ['Rake', 'Bundler'],
    testFrameworks: ['RSpec', 'Minitest', 'FactoryBot'],
    linters: ['RuboCop', 'Sorbet (types)', 'Standard'],
    frameworks: ['Ruby on Rails', 'Sinatra', 'Hanami', 'Sidekiq', 'ActiveRecord', 'Dry-rb'],
    modernIdioms: [
      'Blocks, procs, and lambdas',
      'Symbols over strings for identifiers',
      'Keyword arguments',
      'Pattern matching (case/in, Ruby 3.0+)',
      'Ractors for parallelism (Ruby 3.0+)',
      'Frozen string literals',
      'Enumerable methods (map, select, reduce)',
      'Struct and Data classes',
      'Convention over configuration (Rails)',
      'Mixin modules (include/extend/prepend)'
    ],
    errorHandling: 'begin/rescue/ensure, custom exception classes, raise',
    concurrency: 'Threads, Fibers, Ractors (3.0+), async gem, Sidekiq for background jobs',
    deployTargets: ['Heroku', 'Render', 'Docker', 'Fly.io', 'AWS']
  },

  php: {
    name: 'PHP',
    extensions: ['.php'],
    typing: 'Dynamic (with type declarations since PHP 7+)',
    paradigms: ['object-oriented', 'procedural', 'functional'],
    packageManager: 'Composer',
    buildTools: ['Composer', 'PHP CLI'],
    testFrameworks: ['PHPUnit', 'Pest', 'Codeception'],
    linters: ['PHPStan', 'Psalm', 'PHP_CodeSniffer', 'PHP-CS-Fixer'],
    frameworks: ['Laravel', 'Symfony', 'Slim', 'Livewire', 'Filament', 'WordPress', 'Drupal'],
    modernIdioms: [
      'Typed properties and return types (PHP 8+)',
      'Enums (PHP 8.1+)',
      'Named arguments',
      'Match expressions',
      'Fibers for async (PHP 8.1+)',
      'Readonly properties and classes (PHP 8.2+)',
      'Attributes (PHP 8+)',
      'Arrow functions (fn =>)',
      'Union and intersection types',
      'Null-safe operator (?->)'
    ],
    errorHandling: 'try/catch, custom Exception classes, set_error_handler, Error hierarchy',
    concurrency: 'Fibers (8.1+), ReactPHP, Swoole, Amphp, message queues',
    deployTargets: ['Apache/Nginx', 'Docker', 'Laravel Forge', 'Vapor (serverless)', 'shared hosting']
  },

  dart: {
    name: 'Dart',
    extensions: ['.dart'],
    typing: 'Static, strongly-typed with sound null safety',
    paradigms: ['object-oriented', 'functional', 'reactive'],
    packageManager: 'pub (pub.dev)',
    buildTools: ['dart compile', 'flutter build', 'build_runner'],
    testFrameworks: ['test package', 'flutter_test', 'integration_test', 'mockito'],
    linters: ['dart analyze', 'dart fix', 'custom_lint'],
    frameworks: ['Flutter', 'Dart Frog', 'Serverpod', 'Angel3'],
    modernIdioms: [
      'Sound null safety (required since Dart 3)',
      'Sealed classes and class modifiers (Dart 3)',
      'Pattern matching and switch expressions (Dart 3)',
      'Records for tuples',
      'Extension methods and types',
      'Isolates for parallelism',
      'Streams and Futures for async',
      'Mixins for code reuse',
      'Named constructors and factory constructors',
      'Cascade notation (..)'
    ],
    errorHandling: 'try/catch, custom Exception/Error classes, Result pattern, Zone error handling',
    concurrency: 'Single-threaded event loop, Isolates for parallelism, async/await, Streams',
    deployTargets: ['iOS', 'Android', 'Web', 'Desktop', 'Server (Dart AOT)']
  },

  lua: {
    name: 'Lua',
    extensions: ['.lua'],
    typing: 'Dynamic, weakly-typed',
    paradigms: ['procedural', 'functional', 'prototype-based OOP', 'scripting'],
    packageManager: 'LuaRocks',
    buildTools: ['lua', 'luac', 'LuaJIT'],
    testFrameworks: ['busted', 'luaunit'],
    linters: ['luacheck', 'selene'],
    frameworks: ['LÖVE (game dev)', 'OpenResty', 'Neovim API', 'Roblox Luau', 'Corona SDK'],
    modernIdioms: [
      'Tables as the universal data structure',
      'Metatables and metamethods for OOP',
      'Coroutines for cooperative multitasking',
      'Multiple return values',
      'Closures and upvalues',
      'String patterns (Lua regex)',
      'Module pattern with return table',
      'Varargs with ...',
      'Local variables (always use local)',
      'Iterators with pairs/ipairs/next'
    ],
    errorHandling: 'pcall/xpcall, error(), assert()',
    concurrency: 'Coroutines (cooperative), LuaLanes (threads), OpenResty non-blocking I/O',
    deployTargets: ['Embedded in C/C++ apps', 'Game engines', 'Neovim plugins', 'Web (OpenResty)']
  },

  r: {
    name: 'R',
    extensions: ['.R', '.r', '.Rmd'],
    typing: 'Dynamic',
    paradigms: ['functional', 'statistical computing', 'vectorized'],
    packageManager: 'CRAN / renv',
    buildTools: ['R CMD', 'devtools', 'renv'],
    testFrameworks: ['testthat', 'tinytest'],
    linters: ['lintr', 'styler'],
    frameworks: ['Shiny', 'tidyverse', 'ggplot2', 'dplyr', 'tidyr', 'Plumber', 'R Markdown', 'Quarto'],
    modernIdioms: [
      'Tidyverse pipe (|> or %>%)',
      'Vectorized operations over loops',
      'Tibbles over data.frames',
      'dplyr verbs (mutate, filter, summarize)',
      'ggplot2 grammar of graphics',
      'Functional programming with purrr',
      'Tidy evaluation ({{ }})',
      'R Markdown / Quarto for reproducible reports',
      'Package development with usethis/devtools',
      'renv for reproducible environments'
    ],
    errorHandling: 'tryCatch, withCallingHandlers, stop(), warning(), message()',
    concurrency: 'future, furrr, parallel, foreach/doParallel',
    deployTargets: ['Shiny Server', 'Posit Connect', 'Docker', 'Plumber API']
  },

  scala: {
    name: 'Scala',
    extensions: ['.scala', '.sc'],
    typing: 'Static, strongly-typed with type inference',
    paradigms: ['functional', 'object-oriented', 'concurrent'],
    packageManager: 'sbt / Mill / Coursier',
    buildTools: ['sbt', 'Mill', 'Gradle'],
    testFrameworks: ['ScalaTest', 'MUnit', 'Specs2', 'ScalaCheck'],
    linters: ['Scalafix', 'Wartremover', 'scalafmt'],
    frameworks: ['Akka/Pekko', 'ZIO', 'Cats Effect', 'Play Framework', 'http4s', 'Spark'],
    modernIdioms: [
      'Scala 3 syntax (given/using, extension methods, enums)',
      'For-comprehensions for monadic composition',
      'Pattern matching everywhere',
      'Opaque types',
      'Immutable by default (val, immutable collections)',
      'Type classes and implicits',
      'Higher-kinded types',
      'Effect systems (ZIO, Cats Effect)',
      'Case classes for value objects',
      'Algebraic data types via sealed traits/enums'
    ],
    errorHandling: 'Either[L, R], Try[T], Option[T], ZIO error channel, Cats ApplicativeError',
    concurrency: 'Akka actors, ZIO fibers, Cats Effect IO, Scala Futures, structured concurrency',
    deployTargets: ['JVM', 'Scala.js', 'Scala Native', 'Docker', 'Spark clusters']
  },

  elixir: {
    name: 'Elixir',
    extensions: ['.ex', '.exs'],
    typing: 'Dynamic, strongly-typed',
    paradigms: ['functional', 'concurrent', 'distributed', 'fault-tolerant'],
    packageManager: 'Hex (hex.pm)',
    buildTools: ['mix', 'rebar3 (Erlang)'],
    testFrameworks: ['ExUnit', 'StreamData'],
    linters: ['Credo', 'Dialyxir'],
    frameworks: ['Phoenix', 'LiveView', 'Ecto', 'Nerves', 'Nx', 'Ash'],
    modernIdioms: [
      'Pattern matching in function heads',
      'Pipe operator |> for data transformation',
      'GenServer for stateful processes',
      'Supervisors for fault tolerance (let it crash)',
      'Protocols for polymorphism',
      'Comprehensions (for)',
      'With expression for happy path',
      'Behaviours for contracts',
      'Structs and maps',
      'Sigils (~r, ~w, ~s) for literals'
    ],
    errorHandling: '{:ok, result} / {:error, reason} tuples, with/else, raise/rescue for truly exceptional cases',
    concurrency: 'BEAM VM processes, GenServer, Task, Agent, Registry, distributed Erlang',
    deployTargets: ['Fly.io', 'Docker', 'Gigalixir', 'Render', 'Mix releases']
  },

  haskell: {
    name: 'Haskell',
    extensions: ['.hs', '.lhs'],
    typing: 'Static, strongly-typed with type inference (Hindley-Milner)',
    paradigms: ['purely functional', 'lazy evaluation', 'type-driven'],
    packageManager: 'Cabal / Stack (Hackage)',
    buildTools: ['cabal-install', 'Stack', 'GHC'],
    testFrameworks: ['HUnit', 'QuickCheck', 'Hspec', 'Tasty'],
    linters: ['HLint', 'ormolu', 'fourmolu'],
    frameworks: ['Servant', 'Yesod', 'Scotty', 'IHP', 'Brick', 'Pandoc'],
    modernIdioms: [
      'Monads (IO, Maybe, Either, State, Reader)',
      'Type classes for ad-hoc polymorphism',
      'Algebraic data types',
      'Pattern matching',
      'Higher-order functions',
      'Lazy evaluation by default',
      'do-notation for monadic sequencing',
      'Deriving strategies (stock, newtype, via)',
      'GHC extensions (OverloadedStrings, TypeFamilies)',
      'Lens/optics for nested data access'
    ],
    errorHandling: 'Maybe, Either e a, ExceptT transformer, custom error ADTs',
    concurrency: 'STM, async, MVar, forkIO, par/pseq, streaming libraries (conduit, pipes)',
    deployTargets: ['Native binary', 'Docker', 'Nix', 'Static linking']
  },

  shell: {
    name: 'Shell / Bash',
    extensions: ['.sh', '.bash', '.zsh', '.fish'],
    typing: 'Untyped (everything is a string)',
    paradigms: ['scripting', 'pipeline-oriented', 'process control'],
    packageManager: 'System package managers (apt, brew, dnf)',
    buildTools: ['Make', 'Just', 'Task'],
    testFrameworks: ['bats', 'shunit2', 'shellspec'],
    linters: ['shellcheck', 'shfmt'],
    frameworks: ['coreutils', 'GNU tools', 'awk', 'sed', 'jq', 'curl'],
    modernIdioms: [
      'set -euo pipefail at script start',
      'Shellcheck compliance',
      'Double-quote all variable expansions',
      'Use [[ ]] over [ ] for tests',
      'Functions for reusable logic',
      'Here documents for multi-line strings',
      'Process substitution <(cmd)',
      'Arrays for lists',
      'trap for cleanup on exit',
      'Parameter expansion (${var:-default})'
    ],
    errorHandling: 'set -e, trap EXIT, return codes, || and &&',
    concurrency: 'Background processes (&), wait, GNU parallel, xargs -P',
    deployTargets: ['Linux', 'macOS', 'Docker', 'CI/CD pipelines', 'cron']
  },

  sql: {
    name: 'SQL',
    extensions: ['.sql'],
    typing: 'Static (column types)',
    paradigms: ['declarative', 'set-based', 'relational'],
    packageManager: 'N/A',
    buildTools: ['psql', 'mysql', 'sqlite3', 'Flyway', 'Liquibase', 'dbmate'],
    testFrameworks: ['pgTAP', 'utSQL', 'tSQLt'],
    linters: ['sqlfluff', 'sql-lint', 'SonarQube'],
    frameworks: ['PostgreSQL', 'MySQL', 'SQLite', 'SQL Server', 'ClickHouse', 'DuckDB', 'CockroachDB'],
    modernIdioms: [
      'CTEs (WITH clause) for readable queries',
      'Window functions (ROW_NUMBER, LAG, LEAD)',
      'LATERAL joins',
      'JSONB operations (PostgreSQL)',
      'Upsert (INSERT ON CONFLICT / MERGE)',
      'Parameterized queries (never string concat)',
      'Proper indexing strategy',
      'EXPLAIN ANALYZE for query planning',
      'Migrations as versioned files',
      'Views and materialized views for abstraction'
    ],
    errorHandling: 'Transaction blocks (BEGIN/COMMIT/ROLLBACK), SAVEPOINT, constraint violations',
    concurrency: 'Transactions, isolation levels, advisory locks, row-level locking, MVCC',
    deployTargets: ['RDS', 'Cloud SQL', 'PlanetScale', 'Neon', 'Supabase', 'Turso']
  },

  html: {
    name: 'HTML',
    extensions: ['.html', '.htm'],
    typing: 'N/A (markup)',
    paradigms: ['declarative', 'document structure'],
    packageManager: 'N/A',
    buildTools: ['Vite', 'Parcel', 'Astro', 'Eleventy'],
    testFrameworks: ['Playwright', 'Cypress', 'Axe (a11y)'],
    linters: ['HTMLHint', 'html-validate', 'W3C validator'],
    frameworks: ['Astro', 'Eleventy', 'HTMX', 'Alpine.js', 'Web Components'],
    modernIdioms: [
      'Semantic elements (main, article, section, aside, nav, header, footer)',
      'ARIA attributes for accessibility',
      'Loading and fetchpriority attributes',
      'Dialog element for modals',
      'Details/summary for disclosure widgets',
      'Picture element with srcset for responsive images',
      'Form validation attributes (required, pattern, min/max)',
      'Custom data attributes (data-*)',
      'Meta tags for SEO',
      'Open Graph and structured data (schema.org)'
    ],
    errorHandling: 'N/A (browser-tolerant parsing)',
    concurrency: 'N/A',
    deployTargets: ['Any web server', 'CDN', 'Static hosting (GitHub Pages, Netlify, Vercel)']
  },

  css: {
    name: 'CSS / SCSS / SASS',
    extensions: ['.css', '.scss', '.sass', '.less'],
    typing: 'N/A (styling)',
    paradigms: ['declarative', 'cascading', 'component-scoped'],
    packageManager: 'npm (PostCSS plugins)',
    buildTools: ['PostCSS', 'Lightning CSS', 'Sass', 'Tailwind CSS'],
    testFrameworks: ['BackstopJS', 'Percy', 'Chromatic'],
    linters: ['Stylelint', 'Prettier'],
    frameworks: ['Tailwind CSS', 'Bootstrap', 'Open Props', 'Panda CSS', 'vanilla-extract', 'CSS Modules'],
    modernIdioms: [
      'CSS Custom Properties (variables)',
      'Container queries (@container)',
      'CSS Nesting (native)',
      ':has() selector',
      'CSS Grid and Flexbox for layout',
      'Logical properties (inline, block)',
      'color-mix() and oklch/oklab color spaces',
      'Scroll-driven animations',
      '@layer for cascade management',
      'View transitions API'
    ],
    errorHandling: 'N/A (graceful degradation, @supports)',
    concurrency: 'N/A',
    deployTargets: ['Any web platform']
  },

  solidity: {
    name: 'Solidity',
    extensions: ['.sol'],
    typing: 'Static, strongly-typed',
    paradigms: ['contract-oriented', 'event-driven'],
    packageManager: 'npm / Foundry',
    buildTools: ['Foundry (forge)', 'Hardhat', 'Truffle', 'solc'],
    testFrameworks: ['Foundry tests', 'Hardhat + Mocha', 'Waffle'],
    linters: ['Slither', 'Solhint', 'Aderyn'],
    frameworks: ['OpenZeppelin', 'Foundry', 'Hardhat', 'Ethers.js', 'Viem/Wagmi'],
    modernIdioms: [
      'Checks-Effects-Interactions pattern',
      'Custom errors over require strings (gas efficient)',
      'Immutable and constant for gas savings',
      'Events for off-chain data indexing',
      'Access control (Ownable, Roles)',
      'Proxy patterns for upgradeability (UUPS, Transparent)',
      'Reentrancy guards',
      'Safe math (built-in since 0.8)',
      'NatSpec documentation',
      'Assembly (Yul) for gas optimization'
    ],
    errorHandling: 'require, revert, assert, custom errors, try/catch for external calls',
    concurrency: 'N/A (single-threaded EVM execution)',
    deployTargets: ['Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'Base', 'Avalanche']
  },

  zig: {
    name: 'Zig',
    extensions: ['.zig'],
    typing: 'Static, strongly-typed with comptime',
    paradigms: ['systems programming', 'manual memory management', 'comptime metaprogramming'],
    packageManager: 'zig build system / gyro',
    buildTools: ['zig build', 'zig cc'],
    testFrameworks: ['Built-in test blocks'],
    linters: ['zig fmt'],
    frameworks: ['std.http', 'std.io', 'zls (language server)'],
    modernIdioms: [
      'comptime for compile-time evaluation',
      'Error unions for error handling',
      'Optional types (?T)',
      'Slices over pointers',
      'defer and errdefer for cleanup',
      'Allocator-aware APIs',
      'No hidden control flow',
      'Packed structs for systems programming',
      'Cross-compilation built-in',
      'C ABI compatibility (drop-in C replacement)'
    ],
    errorHandling: 'Error unions (anyerror!T), try, catch, errdefer',
    concurrency: 'Async/await (stackless coroutines), event loop, threads',
    deployTargets: ['Native binary', 'WASM', 'Embedded', 'Cross-platform']
  },

  wasm: {
    name: 'WebAssembly',
    extensions: ['.wasm', '.wat'],
    typing: 'Static (i32, i64, f32, f64)',
    paradigms: ['stack-based', 'compilation target'],
    packageManager: 'N/A (compiled from source languages)',
    buildTools: ['wasm-pack', 'Emscripten', 'WASI SDK', 'wasm-tools'],
    testFrameworks: ['wasm-bindgen-test', 'wasmtime'],
    linters: ['wasm-validate'],
    frameworks: ['wasm-bindgen', 'Emscripten', 'WASI', 'wasmtime', 'wasmer'],
    modernIdioms: [
      'Compile from Rust/C/C++/Go/Zig',
      'Linear memory model',
      'Import/export functions',
      'Component model (WASI P2)',
      'WASI for system interface',
      'Streaming compilation',
      'Shared memory for threads',
      'Reference types',
      'SIMD instructions',
      'Interface types (WIT)'
    ],
    errorHandling: 'Traps, error codes through return values, host-defined error handling',
    concurrency: 'SharedArrayBuffer + Atomics, Web Workers, WASI threads proposal',
    deployTargets: ['Browsers', 'Edge computing', 'Serverless', 'Embedded runtimes']
  },

  arduino: {
    name: 'Arduino / Embedded C++',
    extensions: ['.ino', '.pde'],
    typing: 'Static (C/C++ based)',
    paradigms: ['procedural', 'hardware programming', 'event-loop', 'embedded systems'],
    packageManager: 'Arduino Library Manager / PlatformIO',
    buildTools: ['Arduino IDE', 'Arduino CLI', 'PlatformIO', 'avr-gcc', 'arm-gcc'],
    testFrameworks: ['AUnit', 'ArduinoUnit', 'PlatformIO Unity'],
    linters: ['cppcheck', 'PlatformIO check'],
    frameworks: ['Arduino Core', 'ESP-IDF', 'STM32duino', 'Adafruit libraries', 'FastLED', 'AccelStepper', 'PubSubClient (MQTT)', 'WiFi', 'Wire (I2C)', 'SPI'],
    modernIdioms: [
      'setup()/loop() pattern for main program flow',
      'Use const and constexpr over #define macros',
      'Use millis() instead of delay() for non-blocking timing',
      'State machines for complex control flow',
      'Interrupt service routines (ISR) for real-time events',
      'Use PROGMEM for flash-stored constants on AVR',
      'EEPROM for persistent settings',
      'Watchdog timer for crash recovery',
      'Hardware abstraction layers for portability',
      'PlatformIO for professional project management'
    ],
    errorHandling: 'Return codes, watchdog timer, assertion macros, Serial debug output',
    concurrency: 'Single-threaded loop, timer interrupts, FreeRTOS tasks on ESP32/STM32',
    deployTargets: ['Arduino Uno/Mega/Nano', 'ESP32', 'ESP8266', 'STM32', 'Teensy', 'ATtiny', 'RP2040']
  },

  micropython: {
    name: 'MicroPython / CircuitPython',
    extensions: ['.py'],
    typing: 'Dynamic (Python subset)',
    paradigms: ['procedural', 'object-oriented', 'scripting', 'embedded'],
    packageManager: 'upip / mip / circup',
    buildTools: ['Thonny', 'mpremote', 'esptool', 'ampy', 'rshell'],
    testFrameworks: ['micropython-unittest'],
    linters: ['pylint', 'ruff (limited)'],
    frameworks: ['machine module', 'network module', 'uasyncio', 'Adafruit CircuitPython libraries', 'lvgl bindings'],
    modernIdioms: [
      'from machine import Pin, I2C, SPI, PWM, ADC',
      'uasyncio for cooperative multitasking',
      'Memory management with gc.collect()',
      'Use const() for ROM-optimized constants',
      'Frozen modules for faster boot',
      'WebREPL for wireless debugging',
      'Use memoryview for zero-copy buffer ops',
      'Pin interrupts for real-time response',
      'Network.WLAN for WiFi connectivity',
      'ujson/ubinascii for data serialization'
    ],
    errorHandling: 'try/except, machine.reset() for hard recovery, watchdog timer',
    concurrency: 'Single-threaded, uasyncio (cooperative), timer callbacks, _thread module on ESP32',
    deployTargets: ['Raspberry Pi Pico/Pico W', 'ESP32', 'ESP8266', 'STM32', 'nRF52', 'SAMD21/51']
  },

  raspberrypi: {
    name: 'Raspberry Pi (Linux SBC)',
    extensions: ['.py', '.sh', '.c', '.cpp', '.js'],
    typing: 'Varies by language',
    paradigms: ['systems programming', 'scripting', 'IoT', 'edge computing', 'server'],
    packageManager: 'apt / pip / npm / cargo',
    buildTools: ['gcc', 'cmake', 'make', 'python3', 'node', 'rustc'],
    testFrameworks: ['pytest', 'jest', 'googletest'],
    linters: ['shellcheck', 'pylint', 'eslint', 'cppcheck'],
    frameworks: ['RPi.GPIO', 'gpiozero', 'pigpio', 'libcamera', 'picamera2', 'Flask', 'Node-RED', 'Home Assistant', 'OctoPrint'],
    modernIdioms: [
      'gpiozero for Pythonic GPIO control',
      'systemd services for auto-start daemons',
      'raspi-config for system configuration',
      'Use /boot/config.txt for hardware overlays',
      'picamera2 for camera module (libcamera-based)',
      'I2C/SPI via smbus2 or spidev',
      'Docker containers for isolated services',
      'SSH + VS Code Remote for development',
      'cron and systemd timers for scheduling',
      'GPIO cleanup on exit to prevent pin leaks'
    ],
    errorHandling: 'Linux error codes, Python exceptions, systemd journal logging',
    concurrency: 'Full Linux multithreading, multiprocessing, asyncio, systemd services',
    deployTargets: ['Raspberry Pi 5/4/3/Zero 2 W', 'Raspberry Pi OS', 'Ubuntu Server', 'DietPi']
  },

  embedded: {
    name: 'Embedded Systems / RTOS',
    extensions: ['.c', '.h', '.cpp', '.s', '.ld'],
    typing: 'Static (C/C++)',
    paradigms: ['bare-metal', 'real-time', 'interrupt-driven', 'state-machine'],
    packageManager: 'vcpkg / conan / CMSIS-Pack / PlatformIO',
    buildTools: ['arm-none-eabi-gcc', 'CMake', 'Make', 'Ninja', 'IAR', 'Keil MDK', 'SEGGER Embedded Studio'],
    testFrameworks: ['Unity (ThrowTheSwitch)', 'CppUTest', 'Google Test (host)', 'QEMU'],
    linters: ['PC-lint', 'cppcheck', 'MISRA-C checkers', 'Polyspace', 'clang-tidy'],
    frameworks: ['FreeRTOS', 'Zephyr', 'mbed OS', 'RIOT OS', 'NuttX', 'ChibiOS', 'ThreadX/Azure RTOS', 'CMSIS', 'HAL'],
    modernIdioms: [
      'CMSIS-compliant peripheral access',
      'FreeRTOS tasks, queues, semaphores, mutexes',
      'Interrupt priority grouping (NVIC)',
      'DMA for high-speed data transfers',
      'Linker scripts for memory layout control',
      'Startup code and vector table',
      'Volatile for hardware registers',
      'Static allocation over dynamic (no heap fragmentation)',
      'Circular buffers for UART/SPI data',
      'Watchdog timer for system reliability'
    ],
    errorHandling: 'Error codes, assertion macros, fault handlers (HardFault, BusFault), watchdog reset',
    concurrency: 'Preemptive RTOS scheduling, ISR + deferred processing, mutexes, semaphores, event flags',
    deployTargets: ['STM32', 'nRF52/53', 'ESP32', 'SAMD', 'RP2040', 'TI MSP430/CC', 'NXP i.MX', 'Renesas RA']
  },

  robotics: {
    name: 'Robotics (ROS/ROS2)',
    extensions: ['.py', '.cpp', '.launch', '.yaml', '.urdf', '.xacro'],
    typing: 'Static (C++) / Dynamic (Python)',
    paradigms: ['publish-subscribe', 'service-oriented', 'action-based', 'real-time'],
    packageManager: 'rosdep / apt / pip / vcpkg',
    buildTools: ['colcon', 'catkin', 'cmake', 'ament'],
    testFrameworks: ['pytest', 'gtest', 'launch_testing', 'ros2 test'],
    linters: ['ament_lint', 'clang-tidy', 'pylint', 'flake8'],
    frameworks: ['ROS 2 Humble/Iron/Jazzy', 'MoveIt2', 'Nav2', 'Gazebo', 'RViz2', 'micro-ROS', 'ros2_control', 'tf2'],
    modernIdioms: [
      'ROS 2 node lifecycle (configure, activate, deactivate)',
      'Topics for streaming, services for request-reply, actions for long tasks',
      'URDF/Xacro for robot description',
      'Launch files in Python for complex startup',
      'QoS profiles for reliable/best-effort comms',
      'TF2 for coordinate frame transformations',
      'Parameter server for runtime configuration',
      'Component-based nodes for zero-copy IPC',
      'colcon build with cmake args',
      'Custom message/service definitions (.msg/.srv)'
    ],
    errorHandling: 'ROS 2 logging (RCLCPP_ERROR), lifecycle node error states, exception handlers',
    concurrency: 'Multi-threaded executors, callback groups, async services, timers',
    deployTargets: ['Ubuntu 22.04/24.04', 'Docker', 'Raspberry Pi', 'NVIDIA Jetson', 'Industrial PCs']
  },

  verilog: {
    name: 'Verilog / SystemVerilog / VHDL',
    extensions: ['.v', '.sv', '.vhd', '.vhdl'],
    typing: 'Static (hardware description)',
    paradigms: ['hardware description', 'register-transfer level', 'dataflow', 'behavioral'],
    packageManager: 'FuseSoC / VLNV',
    buildTools: ['Vivado', 'Quartus', 'Yosys', 'Verilator', 'Icarus Verilog', 'GHDL', 'ModelSim'],
    testFrameworks: ['cocotb', 'UVM', 'SVUnit', 'OSVVM', 'VUnit'],
    linters: ['Verilator --lint-only', 'Verible', 'svlint'],
    frameworks: ['AXI', 'Wishbone', 'AMBA', 'LiteX', 'SpinalHDL', 'Chisel', 'Amaranth'],
    modernIdioms: [
      'SystemVerilog for modern design and verification',
      'Always_ff for sequential, always_comb for combinational',
      'Parameterized modules for reusability',
      'Interfaces for port grouping',
      'Assertions (SVA) for formal verification',
      'Constrained random verification with UVM',
      'Clock domain crossing (CDC) techniques',
      'FSM coding styles (one-hot, binary)',
      'Testbench with cocotb (Python) for simulation',
      'Synthesis-aware coding vs simulation-only'
    ],
    errorHandling: 'Assertions, coverage, formal verification, waveform debugging',
    concurrency: 'Inherently parallel — all always blocks run concurrently, fork/join for testbenches',
    deployTargets: ['Xilinx/AMD FPGAs', 'Intel/Altera FPGAs', 'Lattice FPGAs', 'ASIC tape-out']
  },

  matlabSimulink: {
    name: 'MATLAB / Simulink',
    extensions: ['.m', '.mlx', '.slx', '.mdl'],
    typing: 'Dynamic (matrix-oriented)',
    paradigms: ['numerical computing', 'matrix programming', 'model-based design', 'signal processing'],
    packageManager: 'MATLAB Add-Ons / File Exchange',
    buildTools: ['MATLAB', 'Simulink', 'MATLAB Compiler', 'MATLAB Coder'],
    testFrameworks: ['MATLAB Unit Testing Framework', 'Simulink Test'],
    linters: ['mlint', 'Code Analyzer'],
    frameworks: ['Simulink', 'Stateflow', 'Control System Toolbox', 'Signal Processing Toolbox', 'Image Processing Toolbox', 'Deep Learning Toolbox', 'Embedded Coder'],
    modernIdioms: [
      'Vectorized operations over loops',
      'Live scripts (.mlx) for literate programming',
      'App Designer for GUIs',
      'String arrays over character arrays',
      'Tables for heterogeneous data',
      'Object-oriented MATLAB (classdef)',
      'Embedded Coder for C/C++ code generation',
      'Simulink for model-based design',
      'GPU computing with gpuArray',
      'Parallel Computing Toolbox for HPC'
    ],
    errorHandling: 'try/catch, MException, error(), warning(), assert()',
    concurrency: 'Parallel Computing Toolbox (parfor, parfeval), GPU arrays, distributed arrays',
    deployTargets: ['Desktop', 'MATLAB Online', 'Simulink Real-Time', 'Embedded targets (C code gen)']
  },

  pcb: {
    name: 'PCB Design & EDA',
    extensions: ['.kicad_pcb', '.kicad_sch', '.brd', '.sch', '.gbr', '.drl'],
    typing: 'N/A (schematic/layout)',
    paradigms: ['schematic capture', 'PCB layout', 'manufacturing', 'signal integrity'],
    packageManager: 'KiCad Plugin Manager / EAGLE Libraries',
    buildTools: ['KiCad', 'EAGLE', 'Altium Designer', 'EasyEDA', 'Fusion 360 Electronics', 'OrCAD'],
    testFrameworks: ['Design Rule Check (DRC)', 'Electrical Rule Check (ERC)', 'SPICE simulation'],
    linters: ['DRC', 'ERC', 'LVS (Layout vs Schematic)'],
    frameworks: ['KiCad', 'EAGLE', 'Altium', 'SPICE (LTspice, ngspice)', 'JLCPCB', 'PCBWay', 'OSH Park'],
    modernIdioms: [
      'Hierarchical schematic design',
      'Custom footprint/symbol libraries',
      'Copper pour for ground planes',
      'Controlled impedance traces for high-speed',
      'Design for manufacturing (DFM) guidelines',
      'Gerber/drill file generation for fabrication',
      'BOM and CPL for assembly',
      'Version control for KiCad projects',
      '3D viewer for mechanical fit check',
      'SPICE simulation before prototyping'
    ],
    errorHandling: 'DRC/ERC violations, net connectivity errors, clearance violations',
    concurrency: 'N/A',
    deployTargets: ['JLCPCB', 'PCBWay', 'OSH Park', 'Seeed Studio', 'custom fabrication']
  }
};

/**
 * Generate a compact, injectable knowledge reference string
 * for a specific set of detected languages.
 */
export function getLanguageKnowledge(languages: string[]): string {
  if (languages.length === 0) return '';

  const sections = languages
    .map(lang => {
      const profile = LANGUAGE_PROFILES[lang.toLowerCase()];
      if (!profile) return null;
      return `### ${profile.name}
- **Typing**: ${profile.typing}
- **Package Manager**: ${profile.packageManager}
- **Build Tools**: ${profile.buildTools.join(', ')}
- **Frameworks**: ${profile.frameworks.join(', ')}
- **Test Frameworks**: ${profile.testFrameworks.join(', ')}
- **Modern Idioms**: ${profile.modernIdioms.slice(0, 6).join('; ')}
- **Error Handling**: ${profile.errorHandling}
- **Concurrency**: ${profile.concurrency}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return sections ? `\n[LANGUAGE KNOWLEDGE BASE]\n${sections}\n[END LANGUAGE KNOWLEDGE]` : '';
}

/**
 * Full knowledge reference as a compact summary string
 * injected into the base NYX system prompt for general awareness.
 */
export const CODING_KNOWLEDGE_SUMMARY = `You have expert-level knowledge of 40+ programming languages, platforms, and their ecosystems:
JavaScript/TypeScript (React, Next.js, Node, Vite, ESLint, Vitest), Python (FastAPI, Django, pytest, ruff, uv), Rust (Cargo, Tokio, Axum, ownership/borrowing), Go (goroutines, channels, gin, go modules), Java (Spring Boot, Maven/Gradle, virtual threads), Kotlin (coroutines, Ktor, Jetpack Compose), C/C++ (CMake, RAII, smart pointers, C++20/23), C# (ASP.NET Core, EF Core, Blazor, LINQ), Swift (SwiftUI, async/await, actors, SPM), Ruby (Rails, RSpec, Bundler), PHP (Laravel, Composer, PHP 8+), Dart (Flutter, sound null safety), Scala (ZIO, Cats, Akka), Elixir (Phoenix, OTP, BEAM), Haskell (monads, type classes, Servant), Shell/Bash (shellcheck, set -euo pipefail), SQL (CTEs, window functions, indexing), HTML/CSS (semantic elements, Grid, Container Queries, View Transitions), Solidity (OpenZeppelin, Foundry, Hardhat), Zig (comptime, error unions, allocators), WebAssembly (WASI, wasm-bindgen), Arduino/Embedded C++ (PlatformIO, ESP32, ESP8266, STM32, sensors, actuators, servo, I2C/SPI/UART), MicroPython/CircuitPython (Raspberry Pi Pico, ESP32, uasyncio, machine module), Raspberry Pi (gpiozero, GPIO, systemd, picamera2, Node-RED), Embedded Systems/RTOS (FreeRTOS, Zephyr, mbed OS, CMSIS, bare-metal, DMA, interrupts), Robotics (ROS 2, MoveIt2, Nav2, Gazebo, SLAM, PID control), Verilog/SystemVerilog/VHDL (FPGA, Yosys, Verilator, cocotb, UVM), MATLAB/Simulink (Embedded Coder, control systems, signal processing), PCB Design/EDA (KiCad, EAGLE, Altium, SPICE, Gerber), Lua, R, Nim, V, Perl, and more.

For each language/platform you know: modern idioms, package managers, build systems, test frameworks, linters, deployment targets, error handling patterns, concurrency models, hardware interfaces, and the most popular frameworks.`;
