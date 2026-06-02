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
  commonErrorsAndFixes?: { error: string; cause: string; fix: string }[];
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
    frameworks: [
      'React',
      'Vue',
      'Svelte',
      'Angular',
      'Next.js',
      'Nuxt',
      'Astro',
      'Express',
      'Fastify',
      'Hono',
      'Remix',
      'SolidJS',
      'Qwik',
    ],
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
      'Top-level await in ESM modules',
    ],
    errorHandling: 'try/catch with Error subclasses, Promise.catch(), error boundaries in React',
    concurrency: 'Single-threaded event loop, Web Workers, async/await, Promises',
    deployTargets: [
      'Vercel',
      'Netlify',
      'Cloudflare Workers',
      'AWS Lambda',
      'Deno Deploy',
      'Node.js',
    ],
    commonErrorsAndFixes: [
      {
        error: "TypeError: Cannot read properties of undefined (reading 'map')",
        cause:
          'Attempting to render or loop over async-loaded/fetched array state inside a React or frontend component before the API call finishes loading and populates the variable.',
        fix: 'Initialize array states with empty arrays `useState([])`, or implement safe logical guards: `items?.map(...)` or `{items && items.map(...)}`.',
      },
      {
        error: 'Event Loop Block / UI execution freeze',
        cause:
          "Running heavy synchronous calculations or recursive functions directly on the browser's single thread, which prevents layout repaints and user interactions.",
        fix: 'Offload heavy computation to Web Workers, or slice large datasets dynamically using `requestAnimationFrame()` or microtask slicing (`setTimeout(..., 0)`).',
      },
      {
        error: 'Memory Leak: unremoved global event listeners in components',
        cause:
          "Attaching listeners on `window` or `document` inside a component's setup/lifecycle stage but forgetting to detach them, causing references to persist when the component is unmounted.",
        fix: "Always detach listeners in the cleanup function: `useEffect(() => { window.addEventListener('scroll', fn); return () => window.removeEventListener('scroll', fn); }, [])`.",
      },
      {
        error: 'Reactivity loss on direct state mutations',
        cause:
          'Modifying objects or arrays inside React/Vue state hierarchies directly (e.g., `state.list.push(item)`) instead of invoking immutable status setters, preventing component re-renders.',
        fix: 'Ensure all state mutations are immutable: in React, use spreads `setList(prev => [...prev, item])` or utilize deep freeze helpers / libraries like Immer.',
      },
    ],
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
    frameworks: [
      'React',
      'Next.js',
      'NestJS',
      'tRPC',
      'Fastify',
      'Hono',
      'Angular',
      'Astro',
      'SvelteKit',
    ],
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
      'Infer return types where possible, annotate parameters',
    ],
    errorHandling: 'Typed error classes, Result<T,E> patterns, discriminated union error types',
    concurrency: 'Same as JavaScript — async/await, Promises, Web Workers',
    deployTargets: ['Vercel', 'Cloudflare Workers', 'AWS Lambda', 'Deno Deploy', 'Bun', 'Node.js'],
    commonErrorsAndFixes: [
      {
        error: "TS7006: Parameter 'x' implicitly has any type",
        cause:
          'Declaring function arguments or closure parameters under strict compiler rules without providing static types, or missing contextual type inferences.',
        fix: 'Annotate the parameter explicitly: `function (x: string)` or set compile configs to relax context-free type derivations temporarily, though type assertion is preferred.',
      },
      {
        error: "TS2322: Type 'X' is not assignable to type 'Y'",
        cause:
          'Passing props or payloads to React component structures that do not match the expected interface, or assigning general unions to narrowed type constraints.',
        fix: "Ensure interface alignments or use discriminated unions `type Prop = { type: 'a'; val: string } | { type: 'b'; val: number }` for strict conditional safety.",
      },
      {
        error: "TS2345: Argument of type 'string | undefined' is not assignable to type 'string'",
        cause:
          'Attempting to feed a nullable or optional parameter directly into a function block that demands guaranteed strict non-nullable inputs.',
        fix: "Inject a strict nullish check guard: `if (!value) return;` or define safe fallback values `value ?? 'default'` before passing the argument.",
      },
      {
        error: 'Invalid Next.js Server Actions serialization',
        cause:
          'Passing complex objects (like databases connections, client instances, or custom classes with prototypes) across the server-client component execution boundary.',
        fix: 'Serialize all objects passing across the network boundary to plain objects: `JSON.parse(JSON.stringify(complexObj))` or use raw value spreads.',
      },
    ],
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
    frameworks: [
      'FastAPI',
      'Django',
      'Flask',
      'Starlette',
      'LangChain',
      'Pydantic',
      'SQLAlchemy',
      'Celery',
      'Streamlit',
      'Gradio',
    ],
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
      'Generators and itertools for memory efficiency',
    ],
    errorHandling: 'try/except/finally, custom Exception subclasses, contextlib.suppress',
    concurrency: 'asyncio, threading, multiprocessing, concurrent.futures, GIL limitations',
    deployTargets: ['Docker', 'AWS Lambda', 'GCP Cloud Run', 'Railway', 'Fly.io', 'Heroku'],
    commonErrorsAndFixes: [
      {
        error: "UnboundLocalError: local variable 'x' referenced before assignment",
        cause:
          'Attempting to modify a variable inside a local nested scope or function which shares its name with an outer global scope variable, without declaring scoping overrides.',
        fix: 'Declare `global x` or `nonlocal x` at the top of the function block to inform the interpreter of external scope modifications.',
      },
      {
        error: "TypeError: 'x' object is not callable",
        cause:
          'Reassigning variable names to overlap with standard library functions (e.g. `list = [1,2]`), or invoking function brackets on variables containing non-function data.',
        fix: 'Rename variables to avoid naming conflicts with built-ins, and ensure decorators or callable class instances implement `__call__()`.',
      },
      {
        error: 'ValueError: mutable default argument for field x is not allowed',
        cause:
          'Using a mutable type (like list or dict) directly as a default parameter in dataclasses or function parameters, which is shared globally across instances.',
        fix: 'Use `None` as the default and initialize the object dynamically within the function: `x = x or []`, or use `default_factory=list` in dataclasses.',
      },
      {
        error: 'RuntimeError: Task got Future attached to a different event loop',
        cause:
          'Attempting to dispatch or await asynchronous routines (like database transactions) inside a different OS thread or Celery worker without associating the loop.',
        fix: 'Use `asyncio.run_coroutine_threadsafe()` to run the task in the target loop, or ensure async functions run entirely within thread-bound event loops.',
      },
    ],
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
    frameworks: [
      'Actix-web',
      'Axum',
      'Rocket',
      'Tokio',
      'Bevy',
      'Tauri',
      'Leptos',
      'Yew',
      'wasm-bindgen',
    ],
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
      'Smart pointers: Box, Rc, Arc, RefCell',
    ],
    errorHandling:
      'Result<T, E>, Option<T>, thiserror/anyhow crates, ? operator, never panic in libraries',
    concurrency:
      'Fearless concurrency — Send/Sync traits, tokio async runtime, channels, Arc<Mutex<T>>',
    deployTargets: [
      'Native binary',
      'WASM',
      'Docker',
      'Embedded systems',
      'AWS Lambda (via cargo-lambda)',
    ],
    commonErrorsAndFixes: [
      {
        error: "error[E0382]: borrow of moved value: 'x'",
        cause:
          'Attempting to access or borrow a variable whose ownership has already been transferred (moved) to another variable, function, or scope closure.',
        fix: 'Borrow instead of move using reference syntax `&x` or `&mut x`, or implement the `Clone` trait and call `.clone()` to create a copy.',
      },
      {
        error:
          "error[E0502]: cannot borrow 'x' as mutable because it is also borrowed as immutable",
        cause:
          'Violating the core borrow checker invariant: you can have either one mutable reference or multiple immutable references in scope, but never both.',
        fix: 'Limit the scope of the references using block brackets `{ ... }`, or release the immutable borrows before requesting the mutable reference.',
      },
      {
        error: "Tokio runtime panic: 'Cannot start a runtime from within a runtime'",
        cause:
          'Invoking blocking runtime builders like `Runtime::new().unwrap().block_on(...)` from inside an active asynchronous block on the Tokio threads pool.',
        fix: 'Spawn nested async tasks using `tokio::spawn()` or use `tokio::task::spawn_blocking()` to offload synchronous tasks to a separate thread pool.',
      },
      {
        error: "error[E0277]: the trait bound 'X: Send' is not satisfied",
        cause:
          'Holding a non-thread-safe reference (like `Rc<T>` or raw pointers) across a suspension point (`.await` boundary) inside an asynchronous task spawned on thread pools.',
        fix: 'Use thread-safe wrappers like `Arc<T>` and `tokio::sync::Mutex<T>`, or ensure the non-Send scope is dropped before invoking the `.await` point.',
      },
    ],
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
      'Minimal and flat package structure',
    ],
    errorHandling:
      'Return error as last value, wrap with fmt.Errorf("%w"), errors.Is/As, sentinel errors',
    concurrency: 'Goroutines, channels, select, sync.WaitGroup, sync.Mutex, context.Context',
    deployTargets: ['Native binary', 'Docker', 'Kubernetes', 'AWS Lambda', 'GCP Cloud Run'],
    commonErrorsAndFixes: [
      {
        error: 'panic: runtime error: invalid memory address or nil pointer dereference',
        cause:
          'Attempting to invoke methods or write values to a struct, map, or interface variable that is currently uninitialized or points to `nil`.',
        fix: 'Ensure variables are initialized using `make()` or constructor functions `&MyStruct{}`, and verify pointers are non-nil before dereferencing.',
      },
      {
        error: 'Goroutine loop variable capture race condition',
        cause:
          'Spawning goroutines inside a loop using reference pointers of the loop index variables, causing all goroutines to read the final index value upon scheduling.',
        fix: 'In Go < 1.22, pass the loop variable as an argument: `go func(v int) { ... }(val)`, or redeclare the variable in the loop block: `val := val`.',
      },
      {
        error: 'panic: send on closed channel',
        cause:
          'Attempting to write data into a channel that has already been closed by a consumer or another thread in the pipeline.',
        fix: 'Design a single-producer coordinate model where only the sender closes the channel, or utilize `sync.Once` to ensure channels are closed once.',
      },
      {
        error: 'Go net/http: resource leak via unclosed Response Body',
        cause:
          'Failing to close the `Response.Body` stream after a successful HTTP call, which locks socket connections and leaks system file descriptors.',
        fix: 'Always call `defer resp.Body.Close()` immediately after checking the HTTP client return errors: `if err != nil { return }; defer resp.Body.Close()`.',
      },
    ],
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
    frameworks: [
      'Spring Boot',
      'Quarkus',
      'Micronaut',
      'Jakarta EE',
      'Vert.x',
      'Hibernate',
      'jOOQ',
    ],
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
      'Virtual threads (Project Loom, Java 21+)',
    ],
    errorHandling: 'Checked/unchecked exceptions, try-with-resources, Optional<T>',
    concurrency:
      'Virtual threads (21+), CompletableFuture, ExecutorService, synchronized, java.util.concurrent',
    deployTargets: [
      'Docker',
      'Kubernetes',
      'AWS Lambda',
      'Spring Boot JAR',
      'GraalVM native-image',
    ],
    commonErrorsAndFixes: [
      {
        error: 'java.lang.NullPointerException',
        cause:
          'Accessing instance variables or executing method calls on an object reference that holds a `null` reference.',
        fix: 'Wrap references inside `Optional<T>` structures, implement defensive assertions `Objects.requireNonNull()`, or apply modern null guards (`?` since Java 14+ patterns).',
      },
      {
        error: 'java.util.ConcurrentModificationException',
        cause:
          'Modifying a collections instance (e.g. `list.remove()`) directly inside a collection loop iterator instead of using the iterator interface.',
        fix: 'Utilize `Iterator.remove()`, apply filter-stream pipelines, or use thread-safe ConcurrentCollections like `CopyOnWriteArrayList`.',
      },
      {
        error: 'Spring Boot: LazyInitializationException',
        cause:
          'Accessing lazy-loaded Hibernate JPA relations on entity records outside the active Transaction or Persistence Session lifecycle.',
        fix: 'Annotate services with `@Transactional`, or fetch lazy records eagerly using JOIN FETCH queries: `SELECT e FROM Entity e JOIN FETCH e.relation`.',
      },
      {
        error: 'OutOfMemoryError: Java heap space / Metaspace leak',
        cause:
          'Holding onto unused object graphs through persistent static references or unclosed long-lived thread variables.',
        fix: 'Close database connections, clean up unused `ThreadLocal` variables inside HTTP filters, and check heap allocations with profilers like VisualVM.',
      },
    ],
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
      'Flow for reactive streams',
    ],
    errorHandling:
      'Result<T>, runCatching, sealed class error hierarchies, require/check preconditions',
    concurrency: 'Coroutines (launch, async, withContext), Flow, Channels, structured concurrency',
    deployTargets: ['Android', 'JVM', 'Kotlin/Native', 'Kotlin/JS', 'KMP multiplatform'],
    commonErrorsAndFixes: [
      {
        error: 'NullPointerException via unsafe !! force operator',
        cause:
          'Using the `!!` operator to forcefully bypass compiler null checks on a variable that is actually empty or holds a `null` reference.',
        fix: 'Always prefer safe calls with Elvis fallback: `val name = user?.name ?: "Guest"`, or use safe-let blocks: `user?.let { print(it.name) }`.',
      },
      {
        error: 'Coroutine Scope Cancellation Leak',
        cause:
          'Launching long-running pipelines inside `GlobalScope` instead of linking them to the parent structured lifecycle scope, causing memory leaks on components destroy.',
        fix: 'Launch coroutines within structured lifecycles using `coroutineScope {}` or class-bound scopes linked to cleanup states.',
      },
      {
        error: 'Jetpack Compose: Recomposition loop freeze',
        cause:
          'Declaring or calculating heavy states directly inside the composable rendering pipeline without wrapping them inside a `remember { }` lock.',
        fix: 'Wrap all state initializations inside a `remember { mutableStateOf(defaultValue) }` box so it survives recomposition cycles.',
      },
    ],
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
      'Use sizeof on variables, not types',
    ],
    errorHandling: 'Return codes (0=success, -1=error), errno, goto cleanup pattern',
    concurrency: 'pthreads, C11 threads, atomics, mutexes, condition variables',
    deployTargets: ['Native binary', 'Embedded systems', 'OS kernels', 'WASM (via Emscripten)'],
    commonErrorsAndFixes: [
      {
        error: 'Segmentation fault (invalid dereference)',
        cause:
          'Attempting to write, read, or pass an uninitialized, unmapped, or NULL pointer address inside a system function.',
        fix: 'Verify allocations: `if (ptr == NULL) { handle_error(); }`, and initialize all pointer variables: `char *str = NULL;`.',
      },
      {
        error: 'Memory leak (malloc without free)',
        cause:
          'Allocating blocks on the heap via `malloc` or `calloc` but leaving the references dangling without invoking `free` when scopes exit.',
        fix: 'Track every allocation, implement robust single-point exit blocks (`goto cleanup;`), and release pointers when they are no longer required.',
      },
      {
        error: 'Stack buffer overflow',
        cause:
          'Writing data to a fixed-size char array that exceeds its boundaries (e.g. via `strcpy` or `gets` instead of boundaries checks).',
        fix: 'Never use unsafe methods like `strcpy` or `gets`. Always use boundary-limited methods like `strncpy` or `snprintf`.',
      },
      {
        error: 'Dangling pointer to local stack variable',
        cause:
          'Returning a pointer of a local variable declared inside a function scope from that function block, which gets overwritten when the stack collapses.',
        fix: 'Allocate return structures on the heap via `malloc`, pass the target pointer as an input argument, or declare variables as `static`.',
      },
    ],
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
    frameworks: [
      'Qt',
      'Boost',
      'POCO',
      'Abseil',
      'gRPC',
      'Unreal Engine',
      'SDL2',
      'SFML',
      'Dear ImGui',
    ],
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
      'Concepts for template constraints (C++20)',
    ],
    errorHandling: 'Exceptions, std::expected (C++23), error codes, RAII for cleanup',
    concurrency: 'std::thread, std::async, std::mutex, atomics, coroutines (C++20), thread pools',
    deployTargets: ['Native binary', 'Game engines', 'Embedded', 'WASM', 'Desktop apps'],
    commonErrorsAndFixes: [
      {
        error: 'Double Free / Heap corruption panic',
        cause:
          'Invoking the `delete` operator twice on the same raw heap pointer address, usually caused by copy constructor bugs in classes.',
        fix: 'Implement smart pointer wrappers like `std::unique_ptr` or `std::shared_ptr` to completely avoid raw pointer lifecycle tracking.',
      },
      {
        error: 'Undetected thread race conditions in shared standard libraries',
        cause:
          'Writing to shared vectors or raw memory variables concurrently from multiple threads without applying proper mutex locks.',
        fix: 'Protect all multi-threaded access points using `std::mutex` and `std::lock_guard<std::mutex>`, or use atomic abstractions `std::atomic<T>`.',
      },
      {
        error: 'Vector iterator invalidation crash',
        cause:
          'Adding elements or resizing a `std::vector` inside a loop while iterating over it, causing the vector to reallocate its buffer in memory.',
        fix: 'Collect updates to apply after the loop iteration is complete, or update the iterator value using the return code of `vector.erase()`.',
      },
    ],
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
    frameworks: [
      'ASP.NET Core',
      'Entity Framework Core',
      'Blazor',
      'MAUI',
      '.NET Aspire',
      'MediatR',
      'SignalR',
      'Unity',
    ],
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
      'Source generators for compile-time codegen',
    ],
    errorHandling: 'Exceptions, Result pattern, FluentResults, IExceptionHandler in ASP.NET',
    concurrency: 'async/await, Task, ValueTask, Channels, System.Threading, Parallel.ForEach',
    deployTargets: ['.NET self-contained', 'Docker', 'Azure', 'AWS Lambda', 'IIS'],
    commonErrorsAndFixes: [
      {
        error: 'NullReferenceException',
        cause:
          'Accessing a method, indexer, or property of a variable holding a `null` reference, often due to disabling nullable reference warnings.',
        fix: 'Ensure `<Nullable>enable</Nullable>` is set in `.csproj`, and use the safe navigation operator: `var name = user?.Profile?.Name;`.',
      },
      {
        error: 'Entity Framework N+1 query performance bottleneck',
        cause:
          'Accessing related child entities in a collection inside a loop, triggering individual SQL queries for each child database lookup.',
        fix: 'Eagerly load relational fields using `.Include()` or `.ThenInclude()` on your initial DbContext query commands.',
      },
      {
        error: 'Memory leak via unsubscribed event handlers',
        cause:
          'Adding event handlers to a long-lived publisher object from a short-lived component, keeping the component alive in the heap.',
        fix: 'Implement `IDisposable` or `IAsyncDisposable` in components and explicitly unsubscribe using `publisher.Event -= OnEventHandler`.',
      },
    ],
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
      'Macro system (Swift 5.9+)',
    ],
    errorHandling: 'throws/try/catch, Result<Success, Failure>, Optional for absence',
    concurrency: 'Swift concurrency: async/await, actors, TaskGroup, AsyncSequence, Sendable',
    deployTargets: ['iOS', 'macOS', 'watchOS', 'tvOS', 'visionOS', 'Linux (Vapor)'],
    commonErrorsAndFixes: [
      {
        error: 'Thread Sanitizer: Data Race detected',
        cause:
          'Modifying variables, components state, or memory blocks concurrently from multiple async threads without Actor serialization.',
        fix: "Protect mutable state with Swift's built-in actors (`actor MyStateStore`) or ensure modifications run on the main thread via `@MainActor`.",
      },
      {
        error: 'Fatal error: Unexpectedly found nil while unwrapping an Optional value',
        cause:
          'Forcing an optional variable to unwrap using `!` when it holds a `nil` value, often on UI outlets or async payloads.',
        fix: 'Safely unwrap values using `guard let` or `if let` blocks, or provide a default value: `let val = optionalVal ?? defaultValue`.',
      },
      {
        error: 'Strong Retain Cycles (Memory Leak)',
        cause:
          'Two class instances holding strong references to each other (e.g. delegate patterns or closures capturing `self` strongly).',
        fix: 'Declare class delegates as `weak var delegate: DelegateType?` and capture references weakly inside closures: `[weak self] in`.',
      },
    ],
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
      'Mixin modules (include/extend/prepend)',
    ],
    errorHandling: 'begin/rescue/ensure, custom exception classes, raise',
    concurrency: 'Threads, Fibers, Ractors (3.0+), async gem, Sidekiq for background jobs',
    deployTargets: ['Heroku', 'Render', 'Docker', 'Fly.io', 'AWS'],
    commonErrorsAndFixes: [
      {
        error: "NoMethodError: undefined method 'x' for nil:NilClass",
        cause:
          'Attempting to invoke methods or fetch attributes on a variable that returned a `nil` object during an operation.',
        fix: 'Apply the safe navigation operator: `user&.profile&.name`, or set logical default values: `address = user || DEFAULT_ADDRESS`.',
      },
      {
        error: 'ActiveRecord N+1 query performance crash',
        cause:
          'Accessing database relationships directly inside view rendering loops instead of eager loading the relations in the controller.',
        fix: 'Load related tables eagerly using `.includes()`: `Post.includes(:comments).all`.',
      },
      {
        error: 'Thread-safety data race in puma / sidekiq processes',
        cause:
          'Mutating global class variables (`@@variable`) or shared class instance variables inside concurrent threaded processes.',
        fix: 'Avoid class-level mutable states. Use thread-safe abstractions, request-scoped stores, or thread-local variables.',
      },
    ],
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
      'Null-safe operator (?->)',
    ],
    errorHandling: 'try/catch, custom Exception classes, set_error_handler, Error hierarchy',
    concurrency: 'Fibers (8.1+), ReactPHP, Swoole, Amphp, message queues',
    deployTargets: [
      'Apache/Nginx',
      'Docker',
      'Laravel Forge',
      'Vapor (serverless)',
      'shared hosting',
    ],
    commonErrorsAndFixes: [
      {
        error: 'TypeError: Return value must be of type X, null returned',
        cause:
          'Declaring strict typing rules on a function signature, but returning an uninitialized variable or a nullable reference.',
        fix: 'Annotate union return types `?X` or use standard fallback blocks: `return $value ?? new X();`.',
      },
      {
        error: 'Laravel: MassAssignmentException',
        cause:
          'Attempting to pass an array of data dynamically into an Eloquent `create` command without declaring those fields in the model.',
        fix: "Define fields inside the `$fillable` array in the target Model: `protected $fillable = ['name', 'email'];`.",
      },
      {
        error: 'PDOException: MySQL server has gone away',
        cause:
          'Long-running CLI workers or command scripts keeping a database connection idle longer than the database wait timeout.',
        fix: 'Implement a connection check-and-reconnect mechanism, or configure short timeouts inside long loops using `DB::reconnect()`.',
      },
    ],
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
      'Cascade notation (..)',
    ],
    errorHandling: 'try/catch, custom Exception/Error classes, Result pattern, Zone error handling',
    concurrency: 'Single-threaded event loop, Isolates for parallelism, async/await, Streams',
    deployTargets: ['iOS', 'Android', 'Web', 'Desktop', 'Server (Dart AOT)'],
    commonErrorsAndFixes: [
      {
        error: 'Null check operator used on a null value',
        cause:
          'Bypassing compilation checks by using the `!` force operator on a variable that actually holds a `null` reference.',
        fix: "Safely access properties using optional navigation: `user?.name`, or define Elvis operators: `user?.name ?? 'Guest'`.",
      },
      {
        error: 'Flutter layout overflow (RenderFlex children overflowed)',
        cause:
          'Adding auto-expanding layout widgets (like `Row`, `Column`, or `ListView`) inside unbounded constraints without limits.',
        fix: 'Wrap expanding children in `Expanded` or `Flexible` widgets, or declare strict constraints using `SizedBox` bounds.',
      },
      {
        error: 'Flutter: State mutation after dispose() crash',
        cause:
          'An async API or timer callback completes and invokes `setState()` after the user has already navigated away and the widget is unmounted.',
        fix: 'Verify if the component is still active: `if (mounted) { setState(() { ... }); }` before calling state mutations.',
      },
    ],
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
      'Iterators with pairs/ipairs/next',
    ],
    errorHandling: 'pcall/xpcall, error(), assert()',
    concurrency: 'Coroutines (cooperative), LuaLanes (threads), OpenResty non-blocking I/O',
    deployTargets: ['Embedded in C/C++ apps', 'Game engines', 'Neovim plugins', 'Web (OpenResty)'],
    commonErrorsAndFixes: [
      {
        error: 'attempt to index a nil value',
        cause:
          'Accessing keys, variables, or functions inside a table that is uninitialized or has been set to `nil`.',
        fix: 'Verify tables exist before reading/writing: `if my_table then print(my_table.val) end`, or construct fallback maps.',
      },
      {
        error: 'Global variable leak inside modules',
        cause:
          'Forgetting to declare variables with the `local` keyword inside script blocks, leaking state globally across the Neovim/OpenResty system.',
        fix: 'Always prepend variables declarations with `local`: `local my_var = 12`, and check scopes using linters like `luacheck`.',
      },
      {
        error: "attempt to call a nil value (method '__index')",
        cause:
          "Calling a method on a table that doesn't have the expected metatable set, or the metatable's __index doesn't point to the correct prototype table.",
        fix: 'Verify the metatable chain: `setmetatable(obj, {__index = MyClass})` and ensure the prototype table defines the method before calling it.',
      },
      {
        error: 'cannot resume dead coroutine',
        cause:
          "Attempting to `coroutine.resume()` a coroutine that has already finished execution or errored out, returning it to 'dead' status.",
        fix: "Check coroutine status before resuming: `if coroutine.status(co) ~= 'dead' then coroutine.resume(co) end`.",
      },
    ],
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
    frameworks: [
      'Shiny',
      'tidyverse',
      'ggplot2',
      'dplyr',
      'tidyr',
      'Plumber',
      'R Markdown',
      'Quarto',
    ],
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
      'renv for reproducible environments',
    ],
    errorHandling: 'tryCatch, withCallingHandlers, stop(), warning(), message()',
    concurrency: 'future, furrr, parallel, foreach/doParallel',
    deployTargets: ['Shiny Server', 'Posit Connect', 'Docker', 'Plumber API'],
    commonErrorsAndFixes: [
      {
        error: "Error: object 'x' not found",
        cause:
          'Declaring variables inside local functions or scopes, and attempting to read them from global script scopes.',
        fix: 'Verify scope bounds, or return values from the function and assign them globally: `my_val <- run_calculations()`.',
      },
      {
        error: 'R: Loop memory overflow / execution freeze',
        cause:
          'Iterating through rows manually inside a large dataset loop instead of leveraging standard vectorized arrays operations.',
        fix: 'Leverage vectorized computations: `df$total <- df$a + df$b` instead of manual row-by-row loops, or apply `lapply()`.',
      },
      {
        error: "object 'variable_name' not found (in ggplot aes)",
        cause:
          "Referencing column names as bare symbols inside `aes()` that don't exist in the data frame, often due to typos or using the wrong dataset.",
        fix: 'Verify column names with `names(df)` before plotting, or use `.data$column` pronoun: `aes(x = .data$my_col)` for programmatic safety.',
      },
      {
        error: 'factor levels mismatch in merge/join',
        cause:
          'Merging two data frames where the join key is a factor with different level sets, causing silent NA rows or dropped observations.',
        fix: 'Convert factors to character before merging: `df$key <- as.character(df$key)`, or use `stringsAsFactors = FALSE` when reading data.',
      },
    ],
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
      'Algebraic data types via sealed traits/enums',
    ],
    errorHandling: 'Either[L, R], Try[T], Option[T], ZIO error channel, Cats ApplicativeError',
    concurrency: 'Akka actors, ZIO fibers, Cats Effect IO, Scala Futures, structured concurrency',
    deployTargets: ['JVM', 'Scala.js', 'Scala Native', 'Docker', 'Spark clusters'],
    commonErrorsAndFixes: [
      {
        error: 'scala.MatchError (exhaustive match violation)',
        cause:
          "Triggering a pattern match `x match { ... }` that doesn't cover all possible cases of a sealed class/trait/enum.",
        fix: 'Ensure all pattern cases are covered, add wildcard fallbacks `case _ =>`, or make patterns compile-verified using `sealed` traits.',
      },
      {
        error: 'ZIO / Cats Effect: Fiber leak',
        cause:
          'Spawning background fibers continuously in response to API requests without keeping track of their execution handles and cleaning up.',
        fix: 'Manage fiber lifecycles using structured concurrency operators like `.forkDaemon` and always arrange cleanup states inside `.ensuring` closures.',
      },
      {
        error: 'could not find implicit value for parameter',
        cause:
          'A method requires an implicit parameter (given/using in Scala 3) but no matching implicit instance is in scope at the call site.',
        fix: 'Import the required implicit: `import MyCodec.given` (Scala 3) or `import MyCodec._` (Scala 2), or define one explicitly in scope.',
      },
      {
        error: 'Future never completes (blocking inside Future)',
        cause:
          "Calling `Await.result()` or thread-blocking operations inside a `Future` body, exhausting the default execution context's thread pool.",
        fix: 'Never block inside Futures. Use `flatMap`/`for-comprehension` for composition, or provide a dedicated `ExecutionContext` for blocking I/O.',
      },
    ],
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
      'Sigils (~r, ~w, ~s) for literals',
    ],
    errorHandling:
      '{:ok, result} / {:error, reason} tuples, with/else, raise/rescue for truly exceptional cases',
    concurrency: 'BEAM VM processes, GenServer, Task, Agent, Registry, distributed Erlang',
    deployTargets: ['Fly.io', 'Docker', 'Gigalixir', 'Render', 'Mix releases'],
    commonErrorsAndFixes: [
      {
        error: '(MatchError) no match of right hand side value',
        cause:
          'A pattern match assertion fails (e.g. `{:ok, val} = some_func()`) because the function returned `{:error, reason}`.',
        fix: 'Handle responses gracefully using `with` pipelines: `with {:ok, val} <- some_func() do ... else ... end`.',
      },
      {
        error: 'Ecto: constraint error on database insert',
        cause:
          'Attempting to insert a duplicate record or invalid relationship directly into SQL without going through Ecto changesets validation.',
        fix: 'Convert database violations into clean errors using changesets: `|> unique_constraint(:email) |> foreign_key_constraint(:user_id)`.',
      },
      {
        error: '** (exit) exited in: GenServer.call(pid, msg, 5000) ** (EXIT) time out',
        cause:
          'A GenServer process is taking longer than the default 5-second timeout to handle a synchronous `call`, often due to blocking I/O in `handle_call`.',
        fix: 'Move heavy work to `handle_cast` (async) or `Task.async`, increase timeout with `GenServer.call(pid, msg, 30_000)`, or restructure to avoid blocking.',
      },
      {
        error: '** (Protocol.UndefinedError) protocol String.Chars not implemented for %MyStruct{}',
        cause:
          'Trying to interpolate or convert a custom struct to string without implementing the `String.Chars` protocol for that struct type.',
        fix: 'Implement the protocol: `defimpl String.Chars, for: MyStruct do def to_string(s), do: ... end`, or use `inspect/1` for debugging.',
      },
    ],
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
      'Lens/optics for nested data access',
    ],
    errorHandling: 'Maybe, Either e a, ExceptT transformer, custom error ADTs',
    concurrency: 'STM, async, MVar, forkIO, par/pseq, streaming libraries (conduit, pipes)',
    deployTargets: ['Native binary', 'Docker', 'Nix', 'Static linking'],
    commonErrorsAndFixes: [
      {
        error: 'Non-exhaustive patterns in function',
        cause:
          'Missing conditional implementation branches for certain structural states of algebraic data types.',
        fix: 'Ensure all constructors of an algebraic type are handled in the function blocks, or compile with `-Wincomplete-patterns`.',
      },
      {
        error: 'Space Leak / Memory exhaustion (unbound lazy thunks)',
        cause:
          'Accumulating a massive stack of lazy evaluation expressions (thunks) in loops, which exhausts the memory allocation limit.',
        fix: 'Enforce strict, eager evaluation inside critical accumulators using the strict application operator: `x $! y`, or define bang patterns.',
      },
      {
        error: "No instance for (Show MyType) arising from a use of 'print'",
        cause:
          "Attempting to print or show a custom data type that doesn't derive or implement the `Show` type class.",
        fix: 'Add `deriving (Show)` to your data type declaration: `data MyType = ... deriving (Show, Eq)`, or write a manual `Show` instance.',
      },
      {
        error: 'Stack overflow from foldl on large list',
        cause:
          "Using lazy `foldl` on a large list accumulates unevaluated thunks, eventually exhausting the stack when they're finally forced.",
        fix: "Use strict `Data.List.foldl'` instead of `foldl`, or switch to `foldr` with a lazy consumer function for streaming evaluation.",
      },
    ],
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
      'Parameter expansion (${var:-default})',
    ],
    errorHandling: 'set -e, trap EXIT, return codes, || and &&',
    concurrency: 'Background processes (&), wait, GNU parallel, xargs -P',
    deployTargets: ['Linux', 'macOS', 'Docker', 'CI/CD pipelines', 'cron'],
    commonErrorsAndFixes: [
      {
        error: 'SC2086: Double quote to prevent splitting and globbing',
        cause:
          'Referencing string variables directly without quotes (e.g. `rm $filename`), which fails or behaves unexpectedly if the string contains spaces.',
        fix: 'Double quote all variable references inside scripts: `rm "$filename"` or apply safe default assignments.',
      },
      {
        error: 'Script hangs indefinitely inside non-interactive CI/CD runners',
        cause:
          'Executing interactive commands that wait for keyboard inputs (like `apt install` without `-y` or custom scripts).',
        fix: 'Pass non-interactive arguments: `apt-get install -y --no-install-recommends` and redirect empty stdin using `</dev/null`.',
      },
      {
        error: 'command not found (despite script existing)',
        cause:
          "Missing shebang line (`#!/bin/bash`) at the top of the script, or the script's directory is not in the system PATH.",
        fix: 'Add the correct shebang: `#!/usr/bin/env bash`, make executable with `chmod +x script.sh`, and run with `./script.sh` or add directory to PATH.',
      },
      {
        error: 'Word splitting breaks filenames with spaces',
        cause:
          "Iterating over file paths without quoting, causing filenames like 'my file.txt' to split into separate arguments 'my' and 'file.txt'.",
        fix: 'Always double-quote variables: `for f in "$dir"/*; do ...`, and use `find ... -print0 | xargs -0` for safe file processing.',
      },
    ],
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
    frameworks: [
      'PostgreSQL',
      'MySQL',
      'SQLite',
      'SQL Server',
      'ClickHouse',
      'DuckDB',
      'CockroachDB',
    ],
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
      'Views and materialized views for abstraction',
    ],
    errorHandling: 'Transaction blocks (BEGIN/COMMIT/ROLLBACK), SAVEPOINT, constraint violations',
    concurrency: 'Transactions, isolation levels, advisory locks, row-level locking, MVCC',
    deployTargets: ['RDS', 'Cloud SQL', 'PlanetScale', 'Neon', 'Supabase', 'Turso'],
    commonErrorsAndFixes: [
      {
        error: 'Query timeout due to full table scans',
        cause:
          'Executing queries on massive database tables filter keys that lack proper index declarations.',
        fix: 'Execute `EXPLAIN ANALYZE` to locate tables scans, and create appropriate indexes: `CREATE INDEX idx_user_email ON users(email)`.',
      },
      {
        error: 'Deadlocks under concurrent write transactions',
        cause:
          'Updating relational tables in different execution orders across concurrent application transactions.',
        fix: 'Ensure all concurrent transactions acquire locks in the exact same table sequence, or implement transactional retries.',
      },
      {
        error: 'N+1 query performance degradation',
        cause:
          'Fetching a parent row then issuing individual SELECT queries for each related child row inside an application loop, instead of joining upfront.',
        fix: 'Use JOINs or subqueries to fetch all related data in a single query, or use `IN (...)` clauses: `SELECT * FROM orders WHERE user_id IN (...)`.',
      },
      {
        error: "ERROR: column 'x' must appear in GROUP BY clause",
        cause:
          'Selecting a non-aggregated column in a query that uses GROUP BY without including that column in the GROUP BY list.',
        fix: 'Add the column to GROUP BY, wrap it in an aggregate function (MAX, MIN, ANY_VALUE), or restructure the query with a subquery.',
      },
    ],
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
      'Open Graph and structured data (schema.org)',
    ],
    errorHandling: 'N/A (browser-tolerant parsing)',
    concurrency: 'N/A',
    deployTargets: ['Any web server', 'CDN', 'Static hosting (GitHub Pages, Netlify, Vercel)'],
    commonErrorsAndFixes: [
      {
        error: 'WCAG 2.2 accessibility failures: missing form labels',
        cause:
          'Rendering interactive input components without corresponding labels, which blocks screen reader users from navigating forms.',
        fix: 'Associate controls with labels: `<label for="email">Email</label><input id="email" ... />` or apply `<input aria-label="Email" ... />`.',
      },
      {
        error: 'Component layout break on nested structure markup',
        cause:
          'Forgetting to close tags inside dynamic templates generation, causing elements to render inside parent panels.',
        fix: 'Use automatic template syntax checking, validate layout using HTML validators, and construct semantic tag pairs.',
      },
      {
        error: 'Form submission does nothing (no response)',
        cause:
          "Missing `action` attribute or `method` attribute on the `<form>` element, or the submit button is `type='button'` instead of `type='submit'`.",
        fix: "Set proper form attributes: `<form action='/api/v1/submit' method='POST'>` and ensure the button is `<button type='submit'>Submit</button>`.",
      },
      {
        error: 'Access to fetch blocked by CORS policy',
        cause:
          "JavaScript `fetch()` or `XMLHttpRequest` to a different origin (domain/port) is blocked because the server doesn't include proper CORS headers.",
        fix: "Configure the server to send `Access-Control-Allow-Origin` headers, or use a proxy in development. For APIs you don't control, use a backend proxy.",
      },
    ],
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
    frameworks: [
      'Tailwind CSS',
      'Bootstrap',
      'Open Props',
      'Panda CSS',
      'vanilla-extract',
      'CSS Modules',
    ],
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
      'View transitions API',
    ],
    errorHandling: 'N/A (graceful degradation, @supports)',
    concurrency: 'N/A',
    deployTargets: ['Any web platform'],
    commonErrorsAndFixes: [
      {
        error: 'Flex/Grid element width blowout',
        cause:
          'Flex/Grid children containing long strings or large elements blowing past their constraints due to browser automatic min-width defaults.',
        fix: 'Override default min-widths on Flex/Grid children: set `min-width: 0;` or `min-height: 0;` to enable proper overflow wrapping.',
      },
      {
        error: 'Z-index stacking context mismatch',
        cause:
          'An element refuses to float on top of an overlay despite a massive `z-index: 9999` because its parent has a separate stacking context.',
        fix: 'Create a new stacking context on the parent using `position: relative; z-index: 1;`, or move the overlay to the root document level.',
      },
      {
        error: 'z-index has no effect on element',
        cause:
          'Applying `z-index` to an element that has `position: static` (the default), where z-index only works on positioned elements.',
        fix: 'Add `position: relative` (or absolute/fixed/sticky) to the element before setting z-index: `position: relative; z-index: 10;`.',
      },
      {
        error: 'Flexbox container content overflows without scrollbar',
        cause:
          'A flex child grows beyond the container bounds but `overflow: auto` is set on the wrong element, or `min-height: 0` is missing on the flex child.',
        fix: 'Set `min-height: 0` (or `min-width: 0`) on the flex child, and `overflow: auto` on the element that should scroll.',
      },
    ],
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
      'Assembly (Yul) for gas optimization',
    ],
    errorHandling: 'require, revert, assert, custom errors, try/catch for external calls',
    concurrency: 'N/A (single-threaded EVM execution)',
    deployTargets: ['Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'Base', 'Avalanche'],
    commonErrorsAndFixes: [
      {
        error: 'Reentrancy Vulnerability',
        cause:
          "Triggering a transfer of Ether/tokens to an untrusted external contract address before updating the sender's balance in state.",
        fix: "Apply the Checks-Effects-Interactions pattern: update balances first, then send funds. Or protect functions with OpenZeppelin's `nonReentrant` modifier.",
      },
      {
        error: 'Out of Gas during deployment (24KB Size limit exceeded)',
        cause:
          'Writing a massive smart contract that exceeds the Ethereum Max Contract Size limit of 24,576 bytes.',
        fix: 'Use libraries to modularize logic, enable optimization compilers inside Foundry/Hardhat, or implement the Diamond Proxy Pattern (ERC-2535).',
      },
      {
        error: 'Transaction reverted: out of gas',
        cause:
          'A function call consumes more gas than the block gas limit or the user-specified gas limit, often from unbounded loops over dynamic arrays.',
        fix: 'Avoid unbounded loops over storage arrays. Use pagination patterns, or process data in fixed-size batches. Optimize storage reads with local variable caching.',
      },
      {
        error: 'Front-running vulnerability in token swap',
        cause:
          'A pending transaction in the mempool is observed by a bot that submits the same trade with higher gas to execute first, extracting MEV.',
        fix: 'Implement slippage protection with `minAmountOut`, use commit-reveal schemes, or submit transactions through a private mempool (Flashbots Protect).',
      },
    ],
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
      'C ABI compatibility (drop-in C replacement)',
    ],
    errorHandling: 'Error unions (anyerror!T), try, catch, errdefer',
    concurrency: 'Async/await (stackless coroutines), event loop, threads',
    deployTargets: ['Native binary', 'WASM', 'Embedded', 'Cross-platform'],
    commonErrorsAndFixes: [
      {
        error: 'panic: reached unreachable code',
        cause:
          'Executing program paths that hit explicit compile unreachable assertions, indicating a logical validation failure.',
        fix: 'Address logical conditions, or use standard error handling loops instead of absolute compiler unreachable assertions.',
      },
      {
        error: 'Memory leak: dynamic allocator not freed',
        cause:
          'Allocating memory inside a function using a Zig allocator (like `std.heap.page_allocator`) and leaving it dangling.',
        fix: 'Utilize deferred statements to ensure release: `const buf = try allocator.alloc(u8, size); defer allocator.free(buf);`.',
      },
      {
        error: 'error.OutOfMemory from allocator',
        cause:
          'Requesting more memory than the allocator can provide, common with `FixedBufferAllocator` when the backing buffer is too small.',
        fix: 'Use a larger backing buffer, switch to `GeneralPurposeAllocator` for dynamic allocation, or reduce allocation sizes with buffer reuse patterns.',
      },
      {
        error: 'comptime evaluation failure: unable to evaluate comptime expression',
        cause:
          'Attempting to use runtime values in a `comptime` context, or calling functions with side effects during compile-time evaluation.',
        fix: 'Ensure all values used in comptime blocks are known at compile time. Separate comptime logic from runtime logic, or use `@as` for type coercion.',
      },
    ],
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
      'Interface types (WIT)',
    ],
    errorHandling: 'Traps, error codes through return values, host-defined error handling',
    concurrency: 'SharedArrayBuffer + Atomics, Web Workers, WASI threads proposal',
    deployTargets: ['Browsers', 'Edge computing', 'Serverless', 'Embedded runtimes'],
    commonErrorsAndFixes: [
      {
        error: 'RuntimeError: unreachable executed',
        cause:
          'Hitting compiler assertions, array out-of-bounds, or division-by-zero traps compiled down from Rust/C++ logic.',
        fix: 'Implement bounds-checking and explicit validation in the source code before compiling down to target WASM targets.',
      },
      {
        error: 'WASI preview version mismatch imports exception',
        cause:
          'Attempting to run a WebAssembly module compiled for a newer WASI specification on an older WASM runtime executor.',
        fix: 'Ensure compilation targets match the runtime specs, or update runtime packages (e.g. wasmtime) to the latest release.',
      },
      {
        error: 'RuntimeError: unreachable (trap in Rust-compiled WASM)',
        cause:
          'An `unreachable!()` macro, integer overflow, or out-of-bounds array access in the Rust source compiles to a WASM `unreachable` instruction that traps at runtime.',
        fix: 'Add bounds checking in Rust source, handle `Option`/`Result` instead of unwrapping, and use `wasm-opt` with debug info to locate the trap source.',
      },
      {
        error: 'Memory.grow() failed — cannot grow WebAssembly memory',
        cause:
          'The WASM module hit its maximum memory limit (defined at compile time) or the host environment refuses to allocate more pages.',
        fix: 'Increase the max memory in the module definition: `--max-memory=1073741824`, or optimize memory usage to stay within the initial allocation.',
      },
    ],
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
    frameworks: [
      'Arduino Core',
      'ESP-IDF',
      'STM32duino',
      'Adafruit libraries',
      'FastLED',
      'AccelStepper',
      'PubSubClient (MQTT)',
      'WiFi',
      'Wire (I2C)',
      'SPI',
    ],
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
      'PlatformIO for professional project management',
    ],
    errorHandling: 'Return codes, watchdog timer, assertion macros, Serial debug output',
    concurrency: 'Single-threaded loop, timer interrupts, FreeRTOS tasks on ESP32/STM32',
    deployTargets: [
      'Arduino Uno/Mega/Nano',
      'ESP32',
      'ESP8266',
      'STM32',
      'Teensy',
      'ATtiny',
      'RP2040',
    ],
    commonErrorsAndFixes: [
      {
        error: 'Blocking timings delay() freeze',
        cause:
          'Using `delay()` inside loops, which freezes execution threads completely, blocking crucial WiFi connectivity or sensor polling interrupts.',
        fix: 'Implement non-blocking timers using `millis()`: `if (millis() - prevTime >= interval) { prevTime = millis(); togglePin(); }`.',
      },
      {
        error: 'Random hardware crashes: SRAM exhaustion',
        cause:
          'Using dynamic C++ standard libraries or string arrays on lightweight AVR chips, fragmenting the limited 2KB SRAM memory.',
        fix: 'Store static string constants inside the Flash program memory using the `F()` macro: `Serial.println(F("Static string in flash!"));`.',
      },
      {
        error: 'Interrupt Service Routine race condition / state corruptions',
        cause:
          'Modifying variables inside hardware interrupts (`attachInterrupt`) without declaring them `volatile` or protecting access in main loop.',
        fix: 'Declare shared variables as `volatile`, and wrap loops access within critical blocks: `noInterrupts(); val = sharedVar; interrupts();`.',
      },
      {
        error: 'Servo jitter / PWM conflict',
        cause:
          'Attaching standard servo libraries which lock system timers (e.g. Timer1) that also drive PWM outputs, disrupting hardware controls.',
        fix: 'Re-assign PWM pins to channels controlled by separate hardware timers, or utilize software timing libraries.',
      },
    ],
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
    frameworks: [
      'machine module',
      'network module',
      'uasyncio',
      'Adafruit CircuitPython libraries',
      'lvgl bindings',
    ],
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
      'ujson/ubinascii for data serialization',
    ],
    errorHandling: 'try/except, machine.reset() for hard recovery, watchdog timer',
    concurrency:
      'Single-threaded, uasyncio (cooperative), timer callbacks, _thread module on ESP32',
    deployTargets: ['Raspberry Pi Pico/Pico W', 'ESP32', 'ESP8266', 'STM32', 'nRF52', 'SAMD21/51'],
    commonErrorsAndFixes: [
      {
        error: 'MemoryError: alloc failed',
        cause:
          'Accumulating massive string buffers or data lists in RAM on a microcontroller, causing SRAM heap fragmentation.',
        fix: 'Perform explicit garbage collection runs: `import gc; gc.collect()`, or pre-allocate static arrays buffers for inputs.',
      },
      {
        error: 'Hardware Pin leak / boot lockup',
        cause:
          'Re-configuring GPIO pins or I2C buses inside soft reboots without properly releasing old peripheral handles.',
        fix: 'Wrap setup loops in try/finally blocks and release hardware resources on script exits: `pin.deinit()`.',
      },
      {
        error: 'MemoryError on ESP8266 (not enough heap)',
        cause:
          'ESP8266 has only ~36KB of usable heap RAM; loading large modules, strings, or JSON payloads quickly exhausts available memory.',
        fix: 'Use `gc.collect()` frequently, process data in small chunks with streaming parsers, freeze modules into firmware, and avoid string concatenation.',
      },
      {
        error: 'I2C device not responding (OSError: [Errno 5] EIO)',
        cause:
          'The I2C device address is wrong, wiring is incorrect (missing pull-up resistors), or the bus frequency is too high for the device.',
        fix: 'Scan the bus first: `i2c.scan()` to verify the address. Add 4.7kΩ pull-up resistors on SDA/SCL. Reduce frequency: `I2C(freq=100000)`.',
      },
    ],
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
    frameworks: [
      'RPi.GPIO',
      'gpiozero',
      'pigpio',
      'libcamera',
      'picamera2',
      'Flask',
      'Node-RED',
      'Home Assistant',
      'OctoPrint',
    ],
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
      'GPIO cleanup on exit to prevent pin leaks',
    ],
    errorHandling: 'Linux error codes, Python exceptions, systemd journal logging',
    concurrency: 'Full Linux multithreading, multiprocessing, asyncio, systemd services',
    deployTargets: ['Raspberry Pi 5/4/3/Zero 2 W', 'Raspberry Pi OS', 'Ubuntu Server', 'DietPi'],
    commonErrorsAndFixes: [
      {
        error: 'RuntimeError: Active GPIO pin leak',
        cause:
          'Leaving hardware pins energized under high voltage states when scripts crash or close, which can damage hardware components.',
        fix: 'Ensure clean shutdowns inside Python scripts using try/finally blocks: `try: loop() finally: gpio.cleanup()`.',
      },
      {
        error: 'Systemd service boot loop',
        cause:
          'Setting a systemd script to start automatically upon boot, but having it fail because it accesses devices or networks that are not ready.',
        fix: 'Configure systemd dependencies properly in your service file: `After=network-online.target` or `After=local-fs.target`.',
      },
      {
        error: 'PermissionError: GPIO access denied (non-root user)',
        cause:
          'Trying to access GPIO pins without being in the `gpio` group, or running a script that requires root privileges as a normal user.',
        fix: 'Add user to gpio group: `sudo usermod -aG gpio $USER`, then log out and back in. Or use `gpiozero` which handles permissions automatically.',
      },
      {
        error: 'SPI device not found: /dev/spidev0.0 does not exist',
        cause:
          'The SPI kernel overlay is not enabled in the Raspberry Pi configuration, so the SPI device nodes are not created at boot.',
        fix: 'Enable SPI via `sudo raspi-config` → Interface Options → SPI, or add `dtparam=spi=on` to `/boot/config.txt` and reboot.',
      },
    ],
  },
  embedded: {
    name: 'Embedded Systems / RTOS',
    extensions: ['.c', '.h', '.cpp', '.s', '.ld'],
    typing: 'Static (C/C++)',
    paradigms: ['bare-metal', 'real-time', 'interrupt-driven', 'state-machine'],
    packageManager: 'vcpkg / conan / CMSIS-Pack / PlatformIO',
    buildTools: [
      'arm-none-eabi-gcc',
      'CMake',
      'Make',
      'Ninja',
      'IAR',
      'Keil MDK',
      'SEGGER Embedded Studio',
    ],
    testFrameworks: ['Unity (ThrowTheSwitch)', 'CppUTest', 'Google Test (host)', 'QEMU'],
    linters: ['PC-lint', 'cppcheck', 'MISRA-C checkers', 'Polyspace', 'clang-tidy'],
    frameworks: [
      'FreeRTOS',
      'Zephyr',
      'mbed OS',
      'RIOT OS',
      'NuttX',
      'ChibiOS',
      'ThreadX/Azure RTOS',
      'CMSIS',
      'HAL',
    ],
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
      'Watchdog timer for system reliability',
    ],
    errorHandling:
      'Error codes, assertion macros, fault handlers (HardFault, BusFault), watchdog reset',
    concurrency:
      'Preemptive RTOS scheduling, ISR + deferred processing, mutexes, semaphores, event flags',
    deployTargets: [
      'STM32',
      'nRF52/53',
      'ESP32',
      'SAMD',
      'RP2040',
      'TI MSP430/CC',
      'NXP i.MX',
      'Renesas RA',
    ],
    commonErrorsAndFixes: [
      {
        error: 'HardFault Handler lockup',
        cause:
          'Invoking illegal dereferences, parsing unaligned pointers, or corrupting stack frames inside bare-metal or RTOS contexts.',
        fix: 'Add compiler sanitizers, print the exception registers (`HFSR`, `CFSR`), and debug the calling frame pointer via GDB.',
      },
      {
        error: 'Task Stack Overflow under preemptive scheduler',
        cause:
          'Allocating heavy array buffers directly on an RTOS task stack instead of utilizing the static memory heap allocation guidelines.',
        fix: 'Increase task stack parameters in `xTaskCreate()`, or change allocations to static/global variables to protect stacks.',
      },
      {
        error: 'Stack overflow from deep recursion on MCU',
        cause:
          'Recursive function calls on a microcontroller with limited stack space (often 1-8KB per task), causing stack corruption and random crashes.',
        fix: 'Convert recursive algorithms to iterative versions with explicit stacks, or increase the task stack size and enable stack overflow detection in the RTOS config.',
      },
      {
        error: 'Watchdog timer reset (WDT triggered unexpected reboot)',
        cause:
          'A blocking operation or infinite loop prevents the main loop from feeding the watchdog timer within the configured timeout period.',
        fix: 'Feed the watchdog regularly in all code paths: `HAL_IWDG_Refresh(&hiwdg)`, avoid long blocking operations, and use interrupt-driven designs.',
      },
    ],
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
    frameworks: [
      'ROS 2 Humble/Iron/Jazzy',
      'MoveIt2',
      'Nav2',
      'Gazebo',
      'RViz2',
      'micro-ROS',
      'ros2_control',
      'tf2',
    ],
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
      'Custom message/service definitions (.msg/.srv)',
    ],
    errorHandling: 'ROS 2 logging (RCLCPP_ERROR), lifecycle node error states, exception handlers',
    concurrency: 'Multi-threaded executors, callback groups, async services, timers',
    deployTargets: [
      'Ubuntu 22.04/24.04',
      'Docker',
      'Raspberry Pi',
      'NVIDIA Jetson',
      'Industrial PCs',
    ],
    commonErrorsAndFixes: [
      {
        error: 'ROS 2 Executor Starvation',
        cause:
          "Running heavy, blocking synchronous calculations inside a ROS 2 node's subscriber callback, blocking incoming message processing.",
        fix: 'Move computations to a separate worker thread or utilize ROS 2 MultiThreadedExecutors with appropriate Callback Groups.',
      },
      {
        error: 'QoS settings mismatch (publishers/subscribers unconnected)',
        cause:
          "Configuring a publisher with 'reliable' quality of service, while the subscriber requests a 'best effort' protocol.",
        fix: 'Ensure all QoS reliability and durability profiles match up: use compatible settings for both publishers and subscribers.',
      },
      {
        error: "TF2 transform timeout: Could not find transform from 'base_link' to 'map'",
        cause:
          "The TF broadcaster node is not running, not publishing at a sufficient rate, or there's a frame name mismatch in the TF tree.",
        fix: 'Verify the TF tree with `ros2 run tf2_tools view_frames`, ensure the broadcaster node is active, and check frame_id strings for typos.',
      },
      {
        error: 'Action server goal REJECTED (no active server)',
        cause:
          'The action client sends a goal before the action server is fully initialized, or the server node has crashed without notification.',
        fix: 'Wait for the server: `client.wait_for_server(timeout_sec=10.0)` before sending goals, and add lifecycle monitoring for the server node.',
      },
    ],
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
      'Synthesis-aware coding vs simulation-only',
    ],
    errorHandling: 'Assertions, coverage, formal verification, waveform debugging',
    concurrency:
      'Inherently parallel — all always blocks run concurrently, fork/join for testbenches',
    deployTargets: ['Xilinx/AMD FPGAs', 'Intel/Altera FPGAs', 'Lattice FPGAs', 'ASIC tape-out'],
    commonErrorsAndFixes: [
      {
        error: 'Synthesis vs Simulation mismatch',
        cause:
          'Using incomplete sensitivity lists inside always blocks (e.g. `always @(a)`) causing simulation to mismatch physical synthesis.',
        fix: 'Always use modern SystemVerilog keywords: `always_comb` for combinational logic and `always_ff @(posedge clk)` for sequential blocks.',
      },
      {
        error: 'Inferred Latch Warning during synthesis',
        cause:
          'Failing to define default output assignments for all possible conditions inside complex combinational case statements.',
        fix: 'Provide default outputs at the top of the block, or complete all case conditions with a fallback `default` branch.',
      },
      {
        error: 'Inferred latch from incomplete if/case statement',
        cause:
          "A combinational `always_comb` block doesn't assign a value to an output in every possible branch, forcing the synthesizer to infer storage (latch).",
        fix: 'Assign default values at the top of the always block before any if/case, or ensure every branch explicitly assigns every output signal.',
      },
      {
        error: 'Clock domain crossing (CDC) metastability',
        cause:
          'Passing a signal directly from one clock domain to another without synchronization, causing unpredictable bit values at the receiving flip-flop.',
        fix: 'Use a 2-stage synchronizer (double flip-flop) for single-bit signals, or a dual-clock FIFO/handshake protocol for multi-bit data crossing.',
      },
    ],
  },
  matlab_simulink: {
    name: 'MATLAB / Simulink',
    extensions: ['.m', '.mlx', '.slx', '.mdl'],
    typing: 'Dynamic (matrix-oriented)',
    paradigms: [
      'numerical computing',
      'matrix programming',
      'model-based design',
      'signal processing',
    ],
    packageManager: 'MATLAB Add-Ons / File Exchange',
    buildTools: ['MATLAB', 'Simulink', 'MATLAB Compiler', 'MATLAB Coder'],
    testFrameworks: ['MATLAB Unit Testing Framework', 'Simulink Test'],
    linters: ['mlint', 'Code Analyzer'],
    frameworks: [
      'Simulink',
      'Stateflow',
      'Control System Toolbox',
      'Signal Processing Toolbox',
      'Image Processing Toolbox',
      'Deep Learning Toolbox',
      'Embedded Coder',
    ],
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
      'Parallel Computing Toolbox for HPC',
    ],
    errorHandling: 'try/catch, MException, error(), warning(), assert()',
    concurrency: 'Parallel Computing Toolbox (parfor, parfeval), GPU arrays, distributed arrays',
    deployTargets: [
      'Desktop',
      'MATLAB Online',
      'Simulink Real-Time',
      'Embedded targets (C code gen)',
    ],
    commonErrorsAndFixes: [
      {
        error: 'Simulink algebraic loop error',
        cause:
          'Creating a feedback loop where an output directly determines an input without any state delay or memory block in between.',
        fix: 'Break the direct feedback loop by introducing a Unit Delay (`1/z`) or Memory block, or configure the solver loop solver constraints.',
      },
      {
        error: 'Embedded Coder: Unsupported dynamic allocation failure',
        cause:
          'Attempting to generate native C/C++ code from a MATLAB model that uses dynamic memory sizing or unsupported object types.',
        fix: 'Pre-allocate all arrays to fixed dimensions, and use only C-compatible functions supported by MATLAB Coder.',
      },
      {
        error: 'Matrix dimensions must agree',
        cause:
          'Performing matrix operations (multiplication, addition) on matrices with incompatible dimensions, e.g., multiplying a 3x2 matrix by a 4x1 vector.',
        fix: "Check dimensions with `size(A)` and `size(B)` before operations. Use `.*` for element-wise ops, ensure inner dimensions match for `*`, and transpose with `.'`.",
      },
      {
        error: 'Simulink algebraic loop detected (circular dependency)',
        cause:
          'A feedback path in the model has no delay element, creating a circular dependency that the solver cannot resolve in a single time step.',
        fix: 'Insert a Unit Delay (`z^-1`) or Memory block to break the algebraic loop, or restructure the model to eliminate the direct feedthrough path.',
      },
    ],
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
    frameworks: [
      'KiCad',
      'EAGLE',
      'Altium',
      'SPICE (LTspice, ngspice)',
      'JLCPCB',
      'PCBWay',
      'OSH Park',
    ],
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
      'SPICE simulation before prototyping',
    ],
    errorHandling: 'DRC/ERC violations, net connectivity errors, clearance violations',
    concurrency: 'N/A',
    deployTargets: ['JLCPCB', 'PCBWay', 'OSH Park', 'Seeed Studio', 'custom fabrication'],
    commonErrorsAndFixes: [
      {
        error: 'Design Rule Check clearance violation',
        cause:
          'Placing signal copper traces, vias, or footprints closer together than the trace width constraints allowed by your manufacturer.',
        fix: 'Adjust clearance rules inside KiCad/Altium constraints, or manual route trace spacing to clear the DRC check.',
      },
      {
        error: 'High-frequency signal crosstalk',
        cause:
          'Routing parallel high-speed digital or analog lines close to each other without proper spacing, causing electromagnetic interference.',
        fix: "Apply the '3W rule' (spacing = 3x trace width) for signal routes, and place solid ground shielding planes between layers.",
      },
      {
        error: 'DRC: Unrouted net(s) remaining',
        cause:
          'One or more electrical connections defined in the schematic have not been physically routed as copper traces on the PCB layout.',
        fix: 'Run DRC to highlight unrouted nets, then manually route them or use the autorouter. Check for missing footprint pads or incorrect net assignments.',
      },
      {
        error: 'ERC: Power pin not driven',
        cause:
          "A component's power pin (VCC/GND) is not connected to any power source in the schematic, which would leave the chip unpowered.",
        fix: 'Connect all power pins to appropriate power symbols/nets. Add power flags where needed: use PWR_FLAG symbol in KiCad to mark intentional power sources.',
      },
    ],
  },
};

export function getLanguageKnowledge(languages: string[]): string {
  if (languages.length === 0) return '';

  const sections = languages
    .map((lang) => {
      const profile = LANGUAGE_PROFILES[lang.toLowerCase()];
      if (!profile) return null;
      let content = `### ${profile.name}
- **Typing**: ${profile.typing}
- **Package Manager**: ${profile.packageManager}
- **Build Tools**: ${profile.buildTools.join(', ')}
- **Frameworks**: ${profile.frameworks.join(', ')}
- **Test Frameworks**: ${profile.testFrameworks.join(', ')}
- **Modern Idioms**: ${profile.modernIdioms.slice(0, 6).join('; ')}
- **Error Handling**: ${profile.errorHandling}
- **Concurrency**: ${profile.concurrency}`;

      if (profile.commonErrorsAndFixes && profile.commonErrorsAndFixes.length > 0) {
        const errsStr = profile.commonErrorsAndFixes
          .map(
            (ef) =>
              `  * **Error**: \`${ef.error}\`\n    * *Cause*: ${ef.cause}\n    * *Fix*: ${ef.fix}`
          )
          .join('\n');
        content += `\n- **Common Errors & Component Fixes**:\n${errsStr}`;
      }
      return content;
    })
    .filter(Boolean)
    .join('\n\n');

  return sections ? `\n[LANGUAGE KNOWLEDGE BASE]\n${sections}\n[END LANGUAGE KNOWLEDGE]` : '';
}

export { CODING_KNOWLEDGE_SUMMARY } from '@shared/config/codingKnowledge';
