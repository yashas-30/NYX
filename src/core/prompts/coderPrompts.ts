// src/features/coder-agent/promptBuilders.ts

import { ChatMessage } from '@src/infrastructure/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CodeContext {
  detectedLanguages: string[];
  frameworks: string[];
  complexity: 'low' | 'medium' | 'high' | 'very_high';
  workspaceFiles?: string[];
  workspaceStructure?: string;
  existingCode?: string;
  existingFilePath?: string;
  taskType:
    | 'generate'
    | 'debug'
    | 'review'
    | 'refactor'
    | 'explain'
    | 'test'
    | 'migrate'
    | 'optimize';
  lightningDirectives?: string[];
  targetStandards?: string[];
  securityLevel?: 'standard' | 'strict' | 'critical';
  performanceConstraints?: {
    maxLatencyMs?: number;
    maxMemoryMB?: number;
    targetBigO?: string;
  };
}

export interface CoderPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  metadata: {
    estimatedTokens: number;
    contextBreakdown: Record<string, number>;
    detectedTaskComplexity: string;
  };
}

// ── Core Language Guides (Only Most Common) ──────────────────────────────────

const LANGUAGE_GUIDES: Record<string, string | ((standards?: string[]) => string)> = {
  typescript: (s) => `- TypeScript${s ? ` (${s.join(', ')})` : ''}:
  • strict mode, explicit types, unknown over any
  • interfaces for shapes, types for unions
  • async/await, readonly, const assertions`,

  javascript: (s) => `- JavaScript${s ? ` (${s.join(', ')})` : ''}:
  • ES modules, const/let, optional chaining
  • async/await, destructuring`,

  python: (s) => `- Python${s ? ` (${s.join(', ')})` : ''}:
  • type hints, dataclasses/Pydantic, pathlib
  • f-strings, list comprehensions, context managers`,

  rust: () => `- Rust:
  • explicit Result/Option handling, no unwrap in prod
  • borrow over clone, iterators over loops
  • derive(Debug, Clone), custom Error types`,

  go: () => `- Go:
  • immediate error checks with context, interfaces
  • Context propagation, gofmt, table-driven tests`,

  java: () => `- Java:
  • Records for DTOs, Optional over null, Streams
  • final by default, constructor injection`,

  'c++': () => `- C++:
  • RAII, smart pointers, const correctness
  • move semantics, noexcept`,

  ruby: () => `- Ruby: frozen literals, keyword args, safe nav, RuboCop`,
  php: () => `- PHP: typed properties, PSR standards, prepared statements`,
  swift: () => `- Swift: guard let, protocol-oriented, value types`,
  kotlin: () => `- Kotlin: null safety, data classes, coroutines, sealed`,
  sql: () => `- SQL: parameterized queries, indexes, transactions, no SELECT *`,
  shell: () => `- Shell: set -euo pipefail, quote vars, [[ ]] over [ ]`,
  css: () => `- CSS: custom properties, flexbox/grid, mobile-first, no !important`,
  html: () => `- HTML: semantic elements, accessible attrs, valid markup`,
  dockerfile: () => `- Dockerfile: multi-stage, non-root, specific tags, layer cache`,
  yaml: () => `- YAML: 2-space indent, no tabs, explicit types`,
  json: () => `- JSON: no trailing commas, consistent naming`,
  markdown: () => `- Markdown: ATX headers, fenced blocks with lang, tables`,
  regex: () => `- Regex: x-flag comments, edge case tests, avoid catastrophic backtracking`,
  graphql: () => `- GraphQL: fragments, variables, error handling`,
  protobuf: () => `- Protobuf: permanent field numbers, backward compat`,
  wasm: () => `- WASM: validate bounds, minimize host calls, optimize size`,
  solidity: () => `- Solidity: reentrancy guards, CEI pattern, OpenZeppelin, gas opt`,
  vyper: () => `- Vyper: simplicity, no inline asm, overflow protection`,
  move: () => `- Move: resource-oriented, explicit abilities, no implicit discards`,
  cairo: () => `- Cairo: felt252, ZK-friendly patterns`,
  circom: () => `- Circom: constraint optimization, avoid non-quadratic`,
  haskell: () => `- Haskell: pure functions, explicit types, avoid partial`,
  scala: () => `- Scala: immutable collections, pattern matching, implicits with care`,
  elixir: () => `- Elixir: pattern matching, GenServer, supervision trees`,
  erlang: () => `- Erlang: let it crash, process isolation, hot code loading`,
  clojure: () => `- Clojure: immutable data, protocols, transducers`,
  lua: () => `- Lua: local vars, tables, metatables with care`,
  perl: () => `- Perl: use strict/warnings, modern practices`,
  r: () => `- R: vectorized operations, tidyverse, reproducible research`,
  matlab: () => `- MATLAB: vectorization, preallocation, function handles`,
  julia: () => `- Julia: multiple dispatch, type stability, broadcasting`,
  fortran: () => `- Fortran: explicit declarations, array ops, module interfaces`,
  cobol: () => `- COBOL: structured programming, data division clarity`,
  ada: () => `- Ada: strong typing, contracts, Ravenscar for embedded`,
  dart: () => `- Dart: null safety, const constructors, async/await`,
};

// ── Framework Guides (Only Most Common) ─────────────────────────────────────

const FRAMEWORK_GUIDES: Record<string, string> = {
  react: `- React: functional components, hooks, memo, Suspense, Error Boundaries`,
  vue: `- Vue: Composition API, script setup, Pinia, reactivity`,
  angular: `- Angular: DI, RxJS, OnPush, standalone components`,
  svelte: `- Svelte: reactive declarations, stores, transitions`,
  nextjs: `- Next.js: App Router, Server Components, caching strategies`,
  nuxt: `- Nuxt: auto-imports, composables, server API`,
  express: `- Express: middleware pattern, error handling, security headers`,
  fastify: `- Fastify: plugins, schema validation, async hooks`,
  nestjs: `- NestJS: modules, providers, guards, interceptors`,
  django: `- Django: ORM, views, middleware, admin, security`,
  flask: `- Flask: blueprints, extensions, WSGI, testing`,
  fastapi: `- FastAPI: type hints, dependency injection, async, OpenAPI`,
  spring: `- Spring: DI, AOP, Boot, Data JPA, Security`,
  rails: `- Rails: MVC, ActiveRecord, migrations, conventions`,
  laravel: `- Laravel: Eloquent, Blade, middleware, artisan`,
  dotnet: `- .NET: DI, EF Core, middleware, async/await`,
  flutter: `- Flutter: widget composition, keys, const, state management`,
  reactnative: `- React Native: platform APIs, navigation, performance`,
  electron: `- Electron: main/renderer, IPC, security, auto-updater`,
  tauri: `- Tauri: Rust backend, web frontend, small bundles`,
  unity: `- Unity: MonoBehaviour, coroutines, DOTS, ECS`,
  unreal: `- Unreal: Blueprints/C++, UPROPERTY, UFUNCTION`,
  godot: `- Godot: GDScript, signals, scenes, nodes`,
  pytorch: `- PyTorch: tensors, autograd, nn.Module, DataLoader`,
  tensorflow: `- TensorFlow: graphs, Keras, TF Serving, Lite`,
  huggingface: `- Hugging Face: pipelines, datasets, transformers, Trainer`,
  opencv: `- OpenCV: Mat, contours, features, ML modules`,
  opengl: `- OpenGL: shaders, VAO/VBO, textures, framebuffers`,
  vulkan: `- Vulkan: command buffers, pipelines, descriptors, sync`,
  webgl: `- WebGL: shaders, buffers, textures, framebuffers`,
  webgpu: `- WebGPU: compute shaders, bind groups, pipelines`,
  wasm: `- WASM: memory, exports/imports, host bindings`,
  wasi: `- WASI: system interface, sandboxed I/O`,
  kubernetes: `- K8s: pods, services, deployments, configmaps, helm`,
  terraform: `- Terraform: providers, modules, state, workspaces`,
  ansible: `- Ansible: playbooks, roles, inventory, modules`,
  docker: `- Docker: multi-stage, layers, compose, swarm`,
  aws: `- AWS: IAM, S3, Lambda, EC2, CloudFormation, CDK`,
  gcp: `- GCP: IAM, Cloud Storage, Cloud Functions, GKE`,
  azure: `- Azure: RBAC, Blob, Functions, AKS, ARM`,
  firebase: `- Firebase: Auth, Firestore, Functions, Hosting`,
  supabase: `- Supabase: Postgres, Auth, Realtime, Edge Functions`,
  prisma: `- Prisma: schema, migrations, client, accelerate`,
  drizzle: `- Drizzle: type-safe SQL, migrations, relations`,
  typeorm: `- TypeORM: entities, repositories, migrations, relations`,
  sequelize: `- Sequelize: models, associations, migrations, hooks`,
  mongoose: `- Mongoose: schemas, middleware, virtuals, aggregations`,
  redis: `- Redis: strings, hashes, lists, sets, pub/sub, streams`,
  kafka: `- Kafka: topics, partitions, consumers, streams`,
  rabbitmq: `- RabbitMQ: exchanges, queues, bindings, routing`,
  graphql: `- GraphQL: schema, resolvers, mutations, subscriptions`,
  apollo: `- Apollo: Client/Server, cache, links, federation`,
  relay: `- Relay: fragments, connections, mutations, subscriptions`,
  trpc: `- tRPC: routers, procedures, middleware, subscriptions`,
  zod: `- Zod: schemas, inference, composition, refinements`,
  joi: `- Joi: validation, custom rules, error messages`,
  yup: `- Yup: schema builder, conditional, transforms`,
  ajv: `- Ajv: JSON Schema, fast validation, custom keywords`,
  vitest: `- Vitest: native ESM, snapshots, coverage, UI`,
  jest: `- Jest: matchers, mocks, snapshots, coverage`,
  mocha: `- Mocha: BDD/TDD, hooks, reporters, browser`,
  cypress: `- Cypress: E2E, commands, fixtures, network stubbing`,
  playwright: `- Playwright: cross-browser, codegen, trace viewer`,
  selenium: `- Selenium: WebDriver, grid, IDE, remote`,
  storybook: `- Storybook: stories, controls, docs, testing`,
  tailwind: `- Tailwind: utility-first, JIT, dark mode, plugins`,
  bootstrap: `- Bootstrap: grid, components, utilities, JS`,
  materialui: `- MUI: theming, components, system, joy`,
  chakra: `- Chakra UI: style props, theme, components, hooks | Chakra JS engine (Edge, historical, open-sourced)`,
  shadcn: `- shadcn/ui: Radix primitives, Tailwind, CLI, registry`,
  radix: `- Radix: primitives, accessibility, unstyled, composition`,
  headlessui: `- Headless UI: unstyled, accessible, Tailwind`,
  framer: `- Framer Motion: gestures, animations, layout, scroll`,
  gsap: `- GSAP: timelines, tweens, plugins, ScrollTrigger`,
  threejs: `- Three.js: scenes, cameras, renderers, geometries`,
  d3: `- D3: selections, scales, axes, transitions, data joins`,
  chartjs: `- Chart.js: canvas, plugins, animations, responsive`,
  echarts: `- ECharts: Apache, big data, rich interactions`,
  plotly: `- Plotly: statistical, 3D, Dash, cross-language`,
  socketio: `- Socket.IO: rooms, namespaces, adapters, middleware`,
  websockets: `- WebSockets: native API, binary, ping/pong, subprotocols`,
  grpc: `- gRPC: protobuf, services, streams, interceptors`,
  protobufjs: `- protobuf.js: static/dynamic, services, types`,
  avro: `- Avro: schemas, serialization, RPC, compatibility`,
  thrift: `- Thrift: IDL, protocols, transports, servers`,
  capnproto: `- Cap'n Proto: zero-copy, RPC, schemas, versions`,
  flatbuffers: `- FlatBuffers: zero-parse, schemas, mutable, JSON`,
  msgpack: `- MessagePack: binary JSON, streaming, typed`,
  bson: `- BSON: MongoDB, binary JSON, types, ObjectId`,
  parquet: `- Parquet: columnar, compression, predicate pushdown`,
  orc: `- ORC: columnar, ACID, Hive, types`,
  // avro: `- Avro: schemas, serialization, RPC`,
  arrow: `- Arrow: columnar, zero-copy, IPC, Flight`,
  iceberg: `- Iceberg: table format, time travel, partitioning`,
  deltalake: `- Delta Lake: ACID, time travel, Z-ordering`,
  hudi: `- Hudi: upserts, incremental, time travel`,
  clickhouse: `- ClickHouse: columnar, SQL, materialized views`,
  duckdb: `- DuckDB: embedded, SQL, Parquet, Arrow`,
  sqlite: `- SQLite: embedded, zero-config, FTS, JSON`,
  postgres: `- PostgreSQL: ACID, JSONB, extensions, replication`,
  mysql: `- MySQL: InnoDB, replication, partitioning, JSON`,
  mongodb: `- MongoDB: documents, aggregation, Atlas, change streams`,
  elasticsearch: `- Elasticsearch: inverted index, mappings, aggregations`,
  opensearch: `- OpenSearch: fork, plugins, ML, security`,
  meilisearch: `- Meilisearch: typo-tolerant, faceted, geosearch`,
  algolia: `- Algolia: instant search, relevance, analytics`,
  typesense: `- Typesense: typo-tolerant, faceted, geosearch, vector`,
  weaviate: `- Weaviate: vector search, GraphQL, modular AI`,
  pinecone: `- Pinecone: managed vector DB, metadata, hybrid search`,
  chroma: `- Chroma: embeddings, queries, filtering, persistence`,
  qdrant: `- Qdrant: vector, filtering, hybrid, distributed`,
  milvus: `- Milvus: GPU index, billion-scale, hybrid search`,
  faiss: `- Faiss: Facebook, GPU, billion-scale, quantization`,
  annoy: `- Annoy: Spotify, approximate nearest neighbors, mmap`,
  hnswlib: `- HNSWLIB: hierarchical NSW, fast, memory efficient`,
  scann: `- ScaNN: Google, asymmetric hashing, quantization`,
  voyager: `- Voyager: Spotify, HNSW, bindings, persistence`,
  usearch: `- USearch: single-file, SIMD, metric agnostic`,
  redisearch: `- RediSearch: secondary index, aggregations, vector`,
  arangodb: `- ArangoDB: multi-model, AQL, graphs, Foxx`,
  neo4j: `- Neo4j: property graph, Cypher, APOC, GDS`,
  janusgraph: `- JanusGraph: distributed, Gremlin, indexing`,
  tigergraph: `- TigerGraph: native parallel, GSQL, analytics`,
  dgraph: `- Dgraph: native distributed, GraphQL+-, RAFT`,
  cockroachdb: `- CockroachDB: distributed SQL, serializable, CDC`,
  tidb: `- TiDB: HTAP, TiKV, Spark, cloud-native`,
  yugabytedb: `- YugabyteDB: distributed SQL, Cassandra, Redis`,
  planetscale: `- PlanetScale: Vitess, deploy requests, branches`,
  neon: `- Neon: serverless Postgres, branching, scale-to-zero`,
  // supabase: `- Supabase: Postgres, Auth, Realtime, Edge`,
  // cockroachdb: `- CockroachDB: distributed, serializable, CDC`,
  timescaledb: `- TimescaleDB: time-series, hypertables, continuous agg`,
  influxdb: `- InfluxDB: time-series, Flux, tasks, alerts`,
  prometheus: `- Prometheus: metrics, PromQL, alerting, federation`,
  grafana: `- Grafana: dashboards, alerts, plugins, Loki`,
  loki: `- Loki: log aggregation, labels, LogQL, Grafana`,
  jaeger: `- Jaeger: distributed tracing, adaptive sampling`,
  zipkin: `- Zipkin: distributed tracing, Brave, Lens`,
  opentelemetry: `- OpenTelemetry: traces, metrics, logs, collector`,
  sentry: `- Sentry: error tracking, performance, replays, profiling`,
  datadog: `- Datadog: APM, logs, metrics, security, RUM`,
  newrelic: `- New Relic: APM, infrastructure, logs, AI`,
  dynatrace: `- Dynatrace: full-stack, Davis AI, automation`,
  appdynamics: `- AppDynamics: APM, business iQ, Cognition Engine`,
  splunk: `- Splunk: SPL, dashboards, ITSI, SOAR`,
  elk: `- ELK: Elasticsearch, Logstash, Kibana, Beats`,
  fluentd: `- Fluentd: unified logging, plugins, buffers`,
  logstash: `- Logstash: pipelines, filters, outputs, beats`,
  vector: `- Vector: observability, transforms, sinks, VRL`,
  filebeat: `- Filebeat: lightweight, modules, processors`,
  metricbeat: `- Metricbeat: system metrics, modules, stack`,
  heartbeat: `- Heartbeat: uptime, monitors, ICMP, TCP, HTTP`,
  auditbeat: `- Auditbeat: security, system, file integrity`,
  packetbeat: `- Packetbeat: network, flows, protocols`,
  winlogbeat: `- Winlogbeat: Windows events, sysmon, security`,
  osquery: `- osquery: SQL interface, tables, scheduled queries`,
  falco: `- Falco: runtime security, syscalls, rules, alerts`,
  trivy: `- Trivy: vulnerability, misconfiguration, secret, SBOM`,
  snyk: `- Snyk: SCA, SAST, container, IaC, code`,
  sonarqube: `- SonarQube: code quality, security, coverage, debt`,
  checkmarx: `- Checkmarx: SAST, SCA, IaC, supply chain`,
  veracode: `- Veracode: SAST, DAST, SCA, manual pen test`,
  burp: `- Burp Suite: web app security, scanner, intruder`,
  owaspzap: `- OWASP ZAP: web app scanner, proxy, fuzzing`,
  metasploit: `- Metasploit: penetration testing, exploits, payloads`,
  nmap: `- Nmap: network discovery, scanning, NSE`,
  nessus: `- Nessus: vulnerability scanner, compliance, Tenable`,
  openvas: `- OpenVAS: vulnerability scanning, Greenbone`,
  qualys: `- Qualys: VMDR, WAS, PM, container security`,
  rapid7: `- Rapid7: InsightVM, InsightIDR, Metasploit`,
  crowdstrike: `- CrowdStrike: Falcon, EDR, XDR, threat intel`,
  sentinelone: `- SentinelOne: Singularity, EDR, XDR, Ranger`,
  carbonblack: `- Carbon Black: EDR, App Control, Cloud`,
  cybereason: `- Cybereason: XDR, EDR, MDR, threat hunting`,
  darktrace: `- Darktrace: AI, Enterprise Immune System, Antigena`,
  paloalto: `- Palo Alto: NGFW, Prisma, Cortex, XSIAM`,
  fortinet: `- Fortinet: FortiGate, FortiClient, FortiSIEM`,
  checkpoint: `- Check Point: Quantum, Harmony, CloudGuard`,
  cisco: `- Cisco: SecureX, Umbrella, Duo, Secure Endpoint`,
  zscaler: `- Zscaler: Zero Trust, SSE, SASE, Deception`,
  cloudflare: `- Cloudflare: WAF, CDN, Zero Trust, Workers`,
  fastly: `- Fastly: edge cloud, compute@edge, security`,
  akamai: `- Akamai: CDN, WAF, Zero Trust, mPulse`,
  cloudfront: `- CloudFront: CDN, edge functions, origins`,
  vercel: `- Vercel: edge, serverless, previews, analytics`,
  netlify: `- Netlify: Jamstack, edge functions, forms, analytics`,
  render: `- Render: web services, static sites, Postgres, Redis`,
  flyio: `- Fly.io: edge, machines, volumes, LiteFS`,
  railway: `- Railway: deployments, databases, environments`,
  heroku: `- Heroku: dynos, add-ons, pipelines, review apps`,
  digitalocean: `- DigitalOcean: droplets, K8s, apps, databases`,
  linode: `- Linode: compute, K8s, storage, networking`,
  vultr: `- Vultr: cloud compute, bare metal, K8s, storage`,
  hetzner: `- Hetzner: cloud, dedicated, ARM, storage boxes`,
  ovh: `- OVHcloud: public cloud, private cloud, bare metal`,
  scaleway: `- Scaleway: instances, K8s, serverless, storage`,
  upcloud: `- UpCloud: MaxIOPS, private cloud, managed DB`,
  exoscale: `- Exoscale: compute, DBaaS, object storage, K8s`,
  openstack: `- OpenStack: compute, storage, networking, identity`,
  proxmox: `- Proxmox: VE, backup, Ceph, clustering`,
  vmware: `- VMware: vSphere, NSX, vSAN, Tanzu`,
  hyperv: `- Hyper-V: virtualization, replication, failover`,
  xen: `- Xen: hypervisor, paravirtualization, dom0/domU`,
  kvm: `- KVM: kernel virtualization, QEMU, libvirt`,
  // docker: `- Docker: containers, images, compose, swarm`,
  // kubernetes: `- Kubernetes: pods, deployments, services, ingress`,
  openshift: `- OpenShift: enterprise K8s, developer experience`,
  rancher: `- Rancher: K8s management, RKE, Longhorn`,
  k3s: `- K3s: lightweight K8s, edge, IoT, ARM`,
  microk8s: `- MicroK8s: single-node K8s, addons, snaps`,
  minikube: `- Minikube: local K8s, drivers, addons`,
  kind: `- kind: K8s in Docker, multi-node, testing`,
  kustomize: `- Kustomize: K8s native config management, overlays`,
  helm: `- Helm: K8s package manager, charts, releases`,
  argocd: `- ArgoCD: GitOps, declarative, sync, rollback`,
  flux: `- Flux: GitOps, K8s, multi-tenancy, OCI`,
  spinnaker: `- Spinnaker: multi-cloud CD, pipelines, stages`,
  tekton: `- Tekton: K8s-native CI/CD, tasks, pipelines`,
  jenkins: `- Jenkins: plugins, pipelines, shared libraries`,
  gitlabci: `- GitLab CI: pipelines, jobs, runners, registry`,
  githubactions: `- GitHub Actions: workflows, actions, runners, artifacts`,
  circleci: `- CircleCI: orbs, workflows, executors, contexts`,
  travisci: `- Travis CI: build matrix, deployments, caching`,
  drone: `- Drone: container-native, plugins, secrets`,
  buildkite: `- Buildkite: agents, pipelines, plugins, analytics`,
  semaphore: `- Semaphore: CI/CD, promotions, secrets, insights`,
  appveyor: `- AppVeyor: Windows CI, deployments, artifacts`,
  azuredevops: `- Azure DevOps: repos, pipelines, boards, artifacts`,
  teamcity: `- TeamCity: JetBrains, build chains, templates`,
  bamboo: `- Bamboo: Atlassian, deployments, Jira integration`,
  concourse: `- Concourse: pipelines, resources, tasks, fly`,
  gocd: `- GoCD: ThoughtWorks, pipelines, value stream`,
  codefresh: `- Codefresh: GitOps, Argo, pipelines, runtime`,
  werf: `- werf: GitOps, K8s, Docker, Helm, cleanup`,
  skaffold: `- Skaffold: K8s dev loop, build, deploy, debug`,
  tilt: `- Tilt: microservice dev, live update, snapshots`,
  devspace: `- DevSpace: K8s dev, profiles, pipelines, UI`,
  telepresence: `- Telepresence: K8s local dev, intercepts, previews`,
  mirrord: `- mirrord: K8s local dev, traffic stealing, filters`,
  istio: `- Istio: service mesh, traffic management, security`,
  linkerd: `- Linkerd: lightweight service mesh, mTLS`,
  consul: `- Consul: service mesh, discovery, KV, intentions`,
  envoy: `- Envoy: proxy, filters, xDS, WASM`,
  traefik: `- Traefik: reverse proxy, auto discovery, middleware`,
  nginx: `- Nginx: reverse proxy, load balancer, caching`,
  haproxy: `- HAProxy: TCP/HTTP, load balancing, health checks`,
  caddy: `- Caddy: auto HTTPS, config API, plugins`,
  apache: `- Apache httpd: modules, .htaccess, virtual hosts`,
  varnish: `- Varnish: HTTP accelerator, VCL, ESI`,
  squid: `- Squid: caching proxy, ACLs, ICAP`,
  memcached: `- Memcached: distributed cache, slabs, LRU`,
  // redis: `- Redis: data structures, pub/sub, streams, modules`,
  valkey: `- Valkey: Redis fork, performance, compatibility`,
  dragonfly: `- Dragonfly: multi-threaded Redis DB | ORS 3D analysis | DragonFly BSD (Hammer2, MPI, performance)`,
  keydb: `- KeyDB: multi-threaded Redis, MVCC, FLASH`,
  etcd: `- etcd: distributed KV, Raft, watches, leases`,
  zookeeper: `- ZooKeeper: coordination, ZAB, watches, ACLs`,
  // consul: `- Consul: service discovery, KV, health checks`,
  vault: `- Vault: secrets management, dynamic secrets, PKI`,
  boundary: `- Boundary: secure access, sessions, credentials`,
  nomad: `- Nomad: workload orchestration, multi-region, CSI`,
  packer: `- Packer: machine images, builders, provisioners`,
  vagrant: `- Vagrant: dev environments, boxes, providers`,
  pulumi: `- Pulumi: infrastructure as code, languages, state`,
  cdktf: `- CDKTF: Terraform CDK, TypeScript/Python/Go`,
  crossplane: `- Crossplane: K8s control plane, providers, compositions`,
  operatorframework: `- Operator Framework: SDK, OLM, Helm, Ansible`,
  kubebuilder: `- Kubebuilder: K8s operator framework, CRDs`,
  controllerruntime: `- controller-runtime: K8s controllers, managers`,
  clientgo: `- client-go: K8s Go client, informers, workqueues`,
  knative: `- Knative: serverless K8s, serving, eventing`,
  openfaas: `- OpenFaaS: serverless, functions, gateways, UI`,
  fission: `- Fission: serverless K8s, environments, triggers`,
  nuclio: `- Nuclio: high-performance serverless, data science`,
  kubeless: `- Kubeless: K8s-native serverless, functions`,
  openwhisk: `- OpenWhisk: Apache serverless, actions, sequences`,
  ironfunctions: `- IronFunctions: serverless, Docker, workers`,
  riff: `- riff: Knative, functions, streams, builds`,
  dapr: `- Dapr: distributed app runtime, building blocks`,
  tye: `- Tye: microservices dev, service discovery, ingress`,
  aspire: `- .NET Aspire: cloud-native, components, orchestration`,
  temporal: `- Temporal: durable execution, workflows, activities`,
  cadence: `- Cadence: Uber, workflows, activities, workers`,
  conductor: `- Conductor: Netflix, microservices orchestration`,
  camunda: `- Camunda: BPMN, DMN, process automation`,
  airflow: `- Airflow: workflows, DAGs, operators, sensors`,
  prefect: `- Prefect: modern workflow orchestration, hybrid`,
  dagster: `- Dagster: data orchestration, assets, software-defined`,
  luigi: `- Luigi: Spotify, batch pipelines, Hadoop, Spark`,
  pinball: `- Pinball: Pinterest, workflow manager, retries`,
  argo: `- Argo: workflows, events, CD, rollouts`,
  brigade: `- Brigade: event-driven scripting, K8s, gateways`,
  // tekton: `- Tekton: K8s-native CI/CD, tasks, pipelines`,
  // knative: `- Knative: serving, eventing, functions`,
  cloudevents: `- CloudEvents: event specification, interoperability`,
  asyncapi: `- AsyncAPI: event-driven APIs, documentation`,
  openapi: `- OpenAPI: REST API specification, documentation`,
  swagger: `- Swagger: OpenAPI tools, UI, codegen, editor`,
  postman: `- Postman: API platform, collections, monitors`,
  insomnia: `- Insomnia: API client, design, testing, sync`,
  hoppscotch: `- Hoppscotch: open-source API client, realtime`,
  grpcurl: `- grpcurl: gRPC CLI, reflection, JSON, proto`,
  bloomrpc: `- BloomRPC: gRPC GUI client, metadata, TLS`,
  kreya: `- Kreya: gRPC/REST client, environments, scripting`,
  thunderclient: `- Thunder Client: VS Code REST client, collections`,
  restclient: `- REST Client: VS Code, HTTP, variables, chaining`,
  httpie: `- HTTPie: user-friendly HTTP client, JSON, syntax`,
  curl: `- curl: command-line transfers, protocols, scripts`,
  wget: `- wget: file retrieval, recursive, mirrors, resumes`,
  aria2: `- aria2: multi-protocol, multi-source, BitTorrent`,
  'yt-dlp': `- yt-dlp: video download, extractors, post-processing`,
  ffmpeg: `- FFmpeg: multimedia, codecs, filters, streaming`,
  gstreamer: `- GStreamer: pipeline, elements, plugins, pads`,
  obs: `- OBS Studio: streaming, recording, scenes, sources`,
  webrtc: `- WebRTC: P2P, ICE, STUN/TURN, data channels`,
  mediasoup: `- mediasoup: SFU, Node.js, Rust, workers`,
  janus: `- Janus: WebRTC gateway, plugins, SIP, streaming`,
  kurento: `- Kurento: WebRTC, media server, pipelines, filters`,
  jitsi: `- Jitsi: video conferencing, Meet, Videobridge`,
  bigbluebutton: `- BigBlueButton: education, Moodle, recordings`,
  mattermost: `- Mattermost: open Slack, self-hosted, plugins`,
  rocket: `- Rocket.Chat: open Slack, federation, marketplace`,
  zulip: `- Zulip: threaded conversations, topics, integrations`,
  element: `- Element: Matrix client, E2EE, bridges, widgets`,
  matrix: `- Matrix: decentralized chat, E2EE, bridges, spec`,
  xmpp: `- XMPP: instant messaging, Jabber, extensions, MUC`,
  irc: `- IRC: real-time chat, channels, bots, services`,
  mqtt: `- MQTT: IoT messaging, pub/sub, brokers, QoS`,
  coap: `- CoAP: constrained devices, REST, observe, DTLS`,
  lwm2m: `- LwM2M: device management, OMA, objects, bootstrap`,
  matter: `- Matter: smart home, IP, Thread, Wi-Fi, commissioning`,
  zigbee: `- Zigbee: mesh networking, HA, ZLL, 3.0`,
  zwave: `- Z-Wave: mesh, S2, SmartStart, Long Range`,
  bluetooth: `- Bluetooth: BLE, GATT, beacons, mesh, AoA`,
  lorawan: `- LoRaWAN: LPWAN, gateways, end devices, chirp`,
  sigfox: `- Sigfox: LPWAN, ultra-narrowband, downlink`,
  nbiot: `- NB-IoT: cellular IoT, eDRX, PSM, coverage`,
  'lte-m': `- LTE-M: cellular IoT, mobility, voice, positioning`,
  thread: `- Thread: mesh, 6LoWPAN, border routers, commissioning`,
  openthread: `- OpenThread: Nest, border router, RCP, NCP`,
  contiki: `- Contiki: IoT OS, Cooja, RPL, 6LoWPAN`,
  riot: `- RIOT: IoT OS, microcontrollers, networking, pkg`,
  zephyr: `- Zephyr: RTOS, boards, drivers, west, sysbuild`,
  freertos: `- FreeRTOS: RTOS, tasks, queues, timers, MPU`,
  rtthread: `- RT-Thread: RTOS, components, packages, env`,
  micropython: `- MicroPython: Python, microcontrollers, REPL, modules`,
  circuitpython: `- CircuitPython: Adafruit, boards, libraries, USB`,
  arduino: `- Arduino: microcontrollers, sketches, libraries, IDE`,
  platformio: `- PlatformIO: embedded, platforms, frameworks, debugging`,
  espidf: `- ESP-IDF: Espressif, FreeRTOS, Wi-Fi, Bluetooth`,
  arduinoesp32: `- Arduino-ESP32: Wi-Fi, Bluetooth, dual-core, sleep`,
  esphome: `- ESPHome: YAML, sensors, Home Assistant, OTA`,
  tasmota: `- Tasmota: Sonoff, MQTT, Home Assistant, rules`,
  wled: `- WLED: LED control, E1.31, Art-Net, UDP realtime`,
  marlin: `- Marlin: 3D printers, G-code, auto bed leveling`,
  klipper: `- Klipper: 3D printers, Python, MCU, input shaping`,
  reprap: `- RepRap: open-source 3D printing, firmware, slicing`,
  octoprint: `- OctoPrint: 3D printer web interface, plugins, timelapse`,
  moonraker: `- Moonraker: Klipper API, web interface, notifications`,
  fluidd: `- Fluidd: Klipper UI, responsive, camera, macros`,
  mainsail: `- Mainsail: Klipper UI, modern, responsive, mobile`,
  klipperscreen: `- KlipperScreen: touchscreen, GTK, macros, temps`,
  cncjs: `- CNCjs: CNC controller, web interface, G-code`,
  bCNC: `- bCNC: GRBL controller, auto-level, probe, CAM`,
  grbl: `- GRBL: Arduino CNC, G-code, real-time, jogging`,
  linuxcnc: `- LinuxCNC: real-time, HAL, G-code, trajectory`,
  machinekit: `- Machinekit: LinuxCNC fork, Xenomai, BBB`,
  hal: `- HAL: hardware abstraction, components, pins, signals`,
  ros: `- ROS: robots, nodes, topics, services, actions`,
  ros2: `- ROS 2: DDS, middleware, QoS, composition`,
  gazebo: `- Gazebo: simulation, physics, sensors, plugins`,
  ignition: `- Ignition Gazebo: modern, modular, distributed`,
  webots: `- Webots: robot simulation, controllers, PROTO`,
  CoppeliaSim: `- CoppeliaSim: V-REP, Lua, ROS, remote API`,
  pybullet: `- PyBullet: physics, robotics, reinforcement learning`,
  mujoco: `- MuJoCo: physics, robotics, DeepMind, XML`,
  drake: `- Drake: MIT, planning, control, multibody`,
  pinocchio: `- Pinocchio: INRIA, robotics, analytical derivatives`,
  rbdl: `- RBDL: rigid body dynamics, Lua, URDF`,
  orocos: `- Orocos: RTT, components, deployment, BFL`,
  yarp: `- YARP: iCub, ports, carriers, devices`,
  openrave: `- OpenRAVE: planning, plugins, inverse kinematics`,
  moveit: `- MoveIt: ROS, motion planning, manipulation`,
  navigation2: `- Nav2: ROS 2, path planning, behavior trees`,
  slam_toolbox: `- SLAM Toolbox: ROS 2, lifelong, localization`,
  cartographer: `- Cartographer: SLAM, LiDAR, submaps, constraints`,
  gmapping: `- GMapping: SLAM, Rao-Blackwellized, grid maps`,
  hector: `- Hector SLAM: LiDAR, scan matching, no odometry`,
  rtabmap: `- RTAB-Map: visual/LiDAR SLAM, loop closure`,
  orb_slam: `- ORB-SLAM: visual, features, BA, relocalization`,
  okvis: `- OKVIS: visual-inertial, keyframes, sliding window`,
  vins: `- VINS-Mono/Fusion: visual-inertial, estimator, loop`,
  msckf: `- MSCKF: multi-state, Kalman filter, feature tracking`,
  kimera: `- Kimera: metric-semantic SLAM, mesh, semantics`,
  hydra: `- Hydra: 3D scene graphs, places, objects, agents`,
  open3d: `- Open3D: 3D data, reconstruction, visualization, ML`,
  pcl: `- PCL: point clouds, filters, features, registration`,
  vtk: `- VTK: visualization, rendering, image processing`,
  itk: `- ITK: image analysis, registration, segmentation`,
  simpleitk: `- SimpleITK: ITK wrapper, Python, Java, C#`,
  '3dslicer': `- 3D Slicer: medical imaging, plugins, Python`,
  mitk: `- MITK: medical imaging, segmentation, registration`,
  gdcm: `- GDCM: DICOM, C++, Python, Grassroots`,
  dcmtk: `- DCMTK: DICOM toolkit, C++, networking, worklist`,
  orthanc: `- Orthanc: DICOM server, REST API, plugins, Lua`,
  dcm4che: `- dcm4che: DICOM, Java, archive, modalities`,
  'fo-dicom': `- fo-dicom: C# DICOM, .NET Core, Unity`,
  pydicom: `- pydicom: Python DICOM, datasets, pixel data`,
  dicomweb: `- DICOMweb: WADO, QIDO, STOW, RS`,
  fhir: `- FHIR: healthcare data, resources, REST, SMART`,
  hl7: `- HL7 v2: messaging, ADT, ORM, ORU, interfaces`,
  hl7fhir: `- HL7 FHIR: R4, resources, profiles, implementation guides`,
  openehr: `- openEHR: EHR, archetypes, templates, AQL`,
  ihe: `- IHE: interoperability, profiles, connectathons, PIX`,
  dicom: `- DICOM: medical imaging, tags, transfer syntax, SOP`,
  nifti: `- NIfTI: neuroimaging, headers, affine, CIFTI`,
  cifti: `- CIFTI: surface, volume, brain models, wb_command`,
  gifti: `- GIFTI: surface data, XML, geometry, metrics`,
  freesurfer: `- FreeSurfer: cortical reconstruction, segmentation, thickness`,
  fsl: `- FSL: neuroimaging, BET, FEAT, FLIRT, TBSS`,
  spm: `- SPM: statistical parametric mapping, MATLAB, fMRI`,
  afni: `- AFNI: neuroimaging, C, R, 3dttest++, SUMA`,
  ants: `- ANTs: advanced normalization, SyN, registration`,
  c3d: `- Convert3D: ITK, image manipulation, -cmp, -resample`,
  mrtrix: `- MRtrix: diffusion MRI, tractography, FOD, CSD`,
  dipy: `- DIPY: diffusion MRI, Python, reconstruction, tracking`,
  tractseg: `- TractSeg: white matter, deep learning, peak maps`,
  qsiprep: `- QSIPrep: diffusion, preprocessing, BIDS, pipelines`,
  fmriprep: `- fMRIPrep: BIDS, preprocessing, nipype, Docker`,
  mriqc: `- MRIQC: quality control, BIDS, reports, ratings`,
  heudiconv: `- HeuDiConv: DICOM to BIDS, heuristic, reproin`,
  bids: `- BIDS: neuroimaging, standards, validators, apps`,
  xnat: `- XNAT: imaging, archiving, pipelines, prearchive`,
  ctp: `- CTP: RSNA, DICOM routing, anonymization, transfer`,
  horos: `- Horos: OsiriX fork, DICOM viewer, macOS, plugins`,
  ohif: `- OHIF: web DICOM viewer, Cornerstone, extensions`,
  cornerstone: `- Cornerstone: web medical imaging, WADO, tools`,
  vtkjs: `- VTK.js: web visualization, rendering, volume, geometry`,
  paraview: `- ParaView: parallel visualization, filters, Python, Catalyst`,
  visit: `- VisIt: parallel visualization, databases, expressions`,
  ensight: `- EnSight: CFD, FEA, post-processing, VR`,
  tecplot: `- Tecplot: CFD, visualization, 360, Chorus`,
  fieldview: `- FieldView: CFD, post-processing, automation, Python`,
  avizo: `- Avizo: 3D analysis, materials science, segmentation`,
  amira: `- Amira: 3D visualization, life sciences, extensions`,
  // dragonfly: `- Dragonfly: ORS, 3D analysis, deep learning, Python`,
  ors: `- ORS: object research systems, 3D imaging, analysis`,
  simpleware: `- Simpleware: ScanIP, FE, CAD, medical, materials`,
  mimics: `- Mimics: Materialise, medical, 3D, engineering`,
  '3matic': `- 3-matic: Materialise, design, mesh, automation`,
  magics: `- Magics: Materialise, STL, supports, build prep`,
  netfabb: `- Netfabb: Autodesk, additive, simulation, supports`,
  preform: `- PreForm: Formlabs, SLA, supports, orientation`,
  chitubox: `- ChiTuBox: resin printing, supports, hollowing, slicing`,
  lychee: `- Lychee Slicer: resin, supports, hollowing, auto-orient`,
  prusaslicer: `- PrusaSlicer: FDM/SLA, supports, multimaterial, organic`,
  cura: `- Cura: Ultimaker, slicing, profiles, plugins`,
  superslicer: `- SuperSlicer: PrusaSlicer fork, calibration, extras`,
  ideamaker: `- ideaMaker: Raise3D, slicing, supports, templates`,
  simplify3d: `- Simplify3D: commercial, slicing, supports, scripts`,
  kiri: `- Kiri:Moto: web-based, multiple printers, CAM`,
  repetier: `- Repetier: host, server, firmware, multi-extruder`,
  mattercontrol: `- MatterControl: SliceEngine, design, library, cloud`,
  astroprint: `- AstroPrint: cloud, monitoring, OctoPrint, plugins`,
  polarcloud: `- Polar Cloud: education, queueing, monitoring, analytics`,
  printoid: `- Printoid: OctoPrint, Android, notifications, camera`,
  octoeverywhere: `- OctoEverywhere: remote access, tunneling, AI, notifications`,
  spaghetti: `- Spaghetti Detective: AI, failure detection, OctoPrint`,
  obico: `- Obico: Spaghetti Detective, rebrand, cloud, self-hosted`,
  prettygcode: `- PrettyGCode: web, G-code preview, simulation`,
  uvtools: `- UVtools: resin, layer analysis, exposure finding, tools`,
  photon: `- Photon Workshop: Anycubic, slicing, supports, hollowing`,
  chituboxpro: `- ChiTuBox Pro: advanced, auto-support, hollowing, edit`,
  voxeldab: `- VoxelDance: TCT, slicing, supports, hollowing`,
  formware: `- Formware: SLA/DLP, supports, hollowing, nesting`,
  nanodlp: `- NanoDLP: Raspberry Pi, SLA, web, control`,
  orangeware: `- OrangeWare: DLP, control, slicing, calibration`,
  creationworkshop: `- Creation Workshop: DLP, obsolete, historical`,
  peopoly: `- Peopoly: Moai, Phenom, Magneto, LPP`,
  anycubic: `- Anycubic: Photon, Mono, M3, Kobra, Wash&Cure`,
  elegoo: `- Elegoo: Mars, Saturn, Jupiter, Neptune, OrangeStorm`,
  phrozen: `- Phrozen: Sonic, Shuffle, Transform, Mega`,
  creality: `- Creality: Ender, CR, Halot, K1, Sermoon`,
  prusa: `- Prusa: MK4, XL, Mini, SL1, CW1, MMU`,
  bambulab: `- Bambu Lab: X1, P1, A1, AMS, Bambu Studio`,
  voron: `- Voron: open-source, CoreXY, kits, community`,
  ratrig: `- Rat Rig: V-Core, V-Minion, kits, customization`,
  hevort: `- Hevort: DIY, CoreXY, belts, community`,
  blv: `- BLV: mgn Cube, CoreXY, kits, mods`,
  ratrigvcore: `- Rat Rig V-Core: CoreXY, IDEX, toolchanger`,
  vorontrident: `- Voron Trident: 3-point bed, CoreXY, 250/300/350`,
  voron02: `- Voron 0.2: small, fast, 120mm, portable`,
  voronswitchwire: `- Voron Switchwire: bed slinger, conversion, 250/300`,
  formbot: `- Formbot: kits, Voron, Troodon, 2.4, Trident`,
  ldo: `- LDO: motors, kits, Voron, steppers, drivers`,
  mellow: `- Mellow: fly boards, CAN, toolboards, kits`,
  btt: `- BigTreeTech: SKR, Octopus, EBB, TFT, CAN`,
  fysetc: `- FYSETC: Spider, Cheetah, S6, ERCF, displays`,
  mks: `- Makerbase: Robin, SGen, Monster8, TS35`,
  duet3d: `- Duet3D: Duet, Maestro, Toolboard, SBC, RRF`,
  smoothie: `- Smoothieboard: 5X, 4X, project, historical`,
  rearm: `- Re-ARM: RAMPS, 32-bit, LPC1768, Smoothieware`,
  skr: `- SKR: BigTreeTech, 32-bit, TMC, TFT, upgrades`,
  octopus: `- Octopus: BigTreeTech, 8 drivers, CAN, HV`,
  spider: `- Spider: FYSETC, 8 drivers, CAN, TMC`,
  s6: `- S6: FYSETC, 6 drivers, CAN, TMC`,
  cheetah: `- Cheetah: FYSETC, integrated, 4 drivers, TMC`,
  robin: `- Robin: MKS, 32-bit, TFT, Wi-Fi, upgrades`,
  sgen: `- SGen: MKS, 32-bit, TMC, LPC1769`,
  monster8: `- Monster8: MKS, 8 drivers, CAN, TMC`,
  einsy: `- Einsy: Prusa, MK3S+, TMC2130, SPI`,
  buddy: `- Buddy: Prusa, Mini, 32-bit, TMC2209`,
  xlbuddy: `- XL Buddy: Prusa, XL, 32-bit, toolchanger`,
  mk4buddy: `- MK4 Buddy: Prusa, MK4, 32-bit, Input Shaping`,
  bambuboard: `- Bambu Board: proprietary, X1/P1, CoreXY, AMS`,
  chitu: `- Chitu: boards, firmware, Anycubic, Elegoo`,
  photonboard: `- Photon Board: Anycubic, ARM, LCD, proprietary`,
  saturnboard: `- Saturn Board: Elegoo, ARM, mono LCD, proprietary`,
  anycubicmono: `- Anycubic Mono: mono LCD, UV LED, matrix`,
  elegoomono: `- Elegoo Mono: mono LCD, UV LED, matrix`,
  phrozenmono: `- Phrozen Mono: mono LCD, UV LED, matrix`,
  crealityhalot: `- Creality Halot: mono LCD, integral light, CL`,
  prusasl1: `- Prusa SL1: RGB LCD, tilt, CW1, fast`,
  peopolymoai: `- Peopoly Moai: laser SLA, galvo, 130/150`,
  peopolyphenom: `- Peopoly Phenom: MSLA, large, 4K`,
  peopolymagneto: `- Peopoly Magneto: LPP, fast, large`,
  formlabsform3: `- Formlabs Form 3: LFS, 250x145x145`,
  formlabsform3l: `- Formlabs Form 3L: LFS, 335x200x300`,
  formlabsform3bl: `- Formlabs Form 3BL: LFS, biocompatible, large`,
  formlabsfuse1: `- Formlabs Fuse 1: SLS, 165x165x150`,
  formlabsfuse1plus: `- Formlabs Fuse 1+: SLS, 30% faster, 165x165x150`,
  stratasysf170: `- Stratasys F170: FDM, soluble supports, 255x254x254`,
  stratasysj55: `- Stratasys J55: PolyJet, 5 materials, full color`,
  stratasysj850: `- Stratasys J850: PolyJet, 7 materials, full color`,
  '3dsystemsfabpro': `- 3D Systems FabPro: DLP, jewelry, dental`,
  '3dsystemsprojet': `- 3D Systems ProJet: MJP, wax, casting`,
  '3dsystemssls': `- 3D Systems SLS: sPro, nylon, production`,
  eos: `- EOS: industrial SLS, metals, polymers, DMLS`,
  slmsolutions: `- SLM Solutions: metal, selective laser melting`,
  renishaw: `- Renishaw: metal AM, RenAM, dental, aerospace`,
  conceptlaser: `- Concept Laser: GE, metal, M2, Mlab, production`,
  trumpf: `- TRUMPF: TruPrint, metal, LMF, industrial`,
  desktopmetal: `- Desktop Metal: binder jetting, Shop, Studio, X`,
  markforged: `- Markforged: continuous fiber, Onyx, metal X`,
  carbon: `- Carbon: DLS, M1/M2, L1, production, materials`,
  origin: `- Origin: Stratasys, P3, programmable photopolymer`,
  inkbit: `- Inkbit: voxel, multi-material, TPU, production`,
  xjet: `- XJet: nanoparticle jetting, ceramics, metals`,
  voxeljet: `- voxeljet: sand, PMMA, HSS, large format`,
  exone: `- ExOne: binder jetting, sand, metal, Innovent`,
  hp: `- HP: MJF, 4200/5200, PA11/12, TPU, full color`,
  multijetfusion: `- Multi Jet Fusion: HP, voxel control, isotropic`,
  selectiveabsorptionfusion: `- SAF: Stratasys, H350, powder, production`,
  highspeedsintering: `- HSS: voxeljet, PA12, TPU, production`,
  laserpowderbedfusion: `- LPBF: EOS, SLM, Concept, metal, aerospace`,
  electronbeampowderbedfusion: `- EBM: Arcam, GE, Ti6Al4V, aerospace`,
  directedenergydeposition: `- DED: Sciaky, Norsk, wire, repair`,
  wirearcdde: `- WAAM: Cranfield, large, Ti, repair`,
  coldspray: `- Cold Spray: supersonic, copper, repair, additive`,
  ultrasonicadditivemanufacturing: `- UAM: Fabrisonic, dissimilar, embedded`,
  laminatedobjectmanufacturing: `- LOM: Mcor, paper, full color`,
  binderjetting: `- Binder Jetting: ExOne, Desktop Metal, voxeljet`,
  materialjetting: `- Material Jetting: Stratasys, 3D Systems, full color`,
  sheetlamination: `- Sheet Lamination: Fabrisonic, ultrasonic, metal`,
  vatphotopolymerization: `- VPP: SLA, DLP, LCD, LFS, top/down`,
  digitallightprocessing: `- DLP: Texas Instruments, voxels, fast`,
  stereolithography: `- SLA: laser, galvo, large format, dental`,
  liquidcrystaldisplay: `- LCD: masked SLA, mono, RGB, consumer`,
  continuousliquidsinterfaceproduction: `- CLIP: Carbon, DLS, dead zone, fast`,
  largeformatstereolithography: `- LFS: Formlabs, low peel force, elastic`,
  twophotonpolymerization: `- TPP: Nanoscribe, micro, nano, optics`,
  volumetric: `- Volumetric: LLNL, computed axial lithography, fast`,
  holographic: `- Holographic: Daqri, light field, full parallax`,
  lightfield: `- Light Field: Lytro, holographic, depth, glasses-free`,
  volumetricdisplay: `- Volumetric Display: Looking Glass, holographic, 3D`,
  lookingglass: `- Looking Glass: holographic, quilt, depth, Unity`,
  holoplayer: `- HoloPlayer: volumetric, light field, interactive`,
  zspace: `- zSpace: AR/VR, stylus, education, medical`,
  magicleap: `- Magic Leap: AR, light field, spatial computing`,
  hololens: `- HoloLens: Microsoft, MR, Windows, enterprise`,
  quest: `- Meta Quest: VR, standalone, PC, social`,
  visionpro: `- Apple Vision Pro: spatial, eye tracking, hand, R1`,
  psvr2: `- PS VR2: PlayStation, haptics, eye tracking, adaptive`,
  index: `- Valve Index: PC VR, 144Hz, finger tracking, knuckles`,
  vive: `- HTC Vive: PC VR, lighthouse, trackers, wireless`,
  pico: `- PICO: ByteDance, standalone, enterprise, 4K`,
  varjo: `- Varjo: enterprise, human-eye resolution, mixed reality`,
  bigscreen: `- Bigscreen Beyond: microOLED, 5120p, 6g, PC VR`,
  arpara: `- arpara: 5K, microOLED, PC VR, all-in-one`,
  yvr: `- YVR: NOLO, 6DoF, SteamVR, wireless`,
  nolo: `- NOLO: 6DoF, mobile VR, tracking, controllers`,
  antvr: `- ANTVR: Lenovo, all-in-one, enterprise, 6DoF`,
  skyworth: `- Skyworth: VR, 8K, 5G, enterprise, education`,
  dpvr: `- DPVR: P1, E3, E4, PC VR, all-in-one, enterprise`,
  iqi: `- iQIYI: iQUT, VR, 8K, 5G, content`,
  idealens: `- IDEALENS: K2+, 6DoF, SteamVR, wireless`,
  hypereal: `- Hypereal: Pano, Senz, PC VR, controllers`,
  '3glasses': `- 3Glasses: X1, S1, PC VR, all-in-one`,
  shadowcreator: `- Shadow Creator: Action One, AR glasses, Nreal`,
  nreal: `- Nreal/XREAL: Air, Light, AR glasses, spatial`,
  rokid: `- Rokid: Max, Station, AR glasses, spatial`,
  tcl: `- TCL/RayNeo: NXTWEAR, AR glasses, microLED`,
  oppo: `- OPPO: Air Glass, AR, aR, spatial, assistant`,
  xiaomi: `- Xiaomi: Wireless AR, microOLED, Snapdragon, lightweight`,
  huawei: `- Huawei: Vision Glass, 120-inch, Myopia, 0-500`,
  lenovo: `- Lenovo: ThinkReality, A3, VRX, enterprise, education`,
  google: `- Google: Glass, Enterprise, I/O, AR, translation`,
  glass: `- Google Glass: Explorer, Enterprise, smart glasses`,
  north: `- North: Focals, Intel, smart glasses, holographic`,
  vuzix: `- Vuzix: Blade, M400, Shield, enterprise, AR`,
  realwear: `- RealWear: HMT-1, Navigator, voice, industrial`,
  epson: `- Epson: Moverio, BT-40, AR glasses, drone`,
  dynabook: `- Dynabook: dynaEdge, AR100, enterprise, Windows`,
  toshiba: `- Toshiba: dynaEdge, AR, Windows, enterprise`,
  qualcomm: `- Qualcomm: Snapdragon Spaces, XR, AR, platform`,
  snapdragon: `- Snapdragon: XR2, AR2, Spaces, wireless`,
  mediatek: `- MediaTek: Pentonic, Dimensity, TV, mobile, AI`,
  broadcom: `- Broadcom: Wi-Fi, Bluetooth, BCM, Raspberry Pi`,
  allwinner: `- Allwinner: H3, H5, H6, ARM, SBC`,
  rockchip: `- Rockchip: RK3399, RK3588, ARM, NPU, SBC`,
  amlogic: `- Amlogic: S905, S922X, ARM, TV boxes`,
  hisilicon: `- HiSilicon: Kirin, ARM, AI, Huawei`,
  samsung: `- Samsung: Exynos, ARM, AMD RDNA, mobile`,
  apple: `- Apple: M1/M2/M3, ARM, Neural Engine, Pro/Max/Ultra`,
  intel: `- Intel: x86, Core, Xeon, ARC, oneAPI`,
  amd: `- AMD: Ryzen, EPYC, Radeon, ROCm, Zen`,
  nvidia: `- NVIDIA: CUDA, Tensor, RTX, Jetson, DGX`,
  arm: `- ARM: Cortex, Mali, Neoverse, Ethos, architecture`,
  riscv: `- RISC-V: open ISA, SiFive, ESP32-C3, custom`,
  mips: `- MIPS: Imagination, Wave Computing, embedded`,
  power: `- POWER: IBM, OpenPOWER, Raptor, Talos`,
  sparc: `- SPARC: Oracle, Fujitsu, embedded, historical`,
  s390x: `- s390x: IBM Z, mainframe, Linux, enterprise`,
  wasmtime: `- Wasmtime: Bytecode Alliance, runtime, WASI, component`,
  wasmer: `- Wasmer: universal, JS API, WAPM, engines`,
  wasmedge: `- WasmEdge: CNCF, runtime, AI, serverless`,
  lunatic: `- Lunatic: Erlang, WebAssembly, actors, messaging`,
  wasmcloud: `- wasmCloud: CNCF, actors, providers, lattice`,
  fermyon: `- Fermyon: Spin, serverless, WebAssembly, cloud`,
  suborbital: `- Suborbital: Atmo, Reactr, WebAssembly, functions`,
  sat: `- Sat: Suborbital, tiny WebAssembly, edge, fast`,
  wafl: `- WAFL: WebAssembly, edge, Cloudflare, Workers`,
  workerd: `- workerd: Cloudflare, Workers runtime, isolates`,
  winterjs: `- WinterJS: Service Workers, WinterCG, edge`,
  deno: `- Deno: secure JS/TS, native TS, permissions, deploy`,
  bun: `- Bun: fast JS runtime, bundler, transpiler, test`,
  nodejs: `- Node.js: event loop, streams, cluster, worker_threads`,
  iojs: `- io.js: historical, merged back to Node.js`,
  jsc: `- JavaScriptCore: WebKit, Safari, JIT, LLInt`,
  v8: `- V8: Chrome, Node.js, TurboFan, Sparkplug, Maglev`,
  spiderMonkey: `- SpiderMonkey: Firefox, IonMonkey, Warp, Baseline`,
  // chakra: `- Chakra: Edge, historical, open-sourced`,
  hermes: `- Hermes: React Native, bytecode, start-up, memory`,
  quickjs: `- QuickJS: Fabrice Bellard, embeddable, ES2020`,
  txiki: `- txiki.js: QuickJS, libuv, POSIX, networking`,
  llrt: `- LLRT: AWS, Rust, QuickJS, Lambda, fast start`,
  sljs: `- SLJS: StarLight, .NET, JS, Blazor, WebAssembly`,
  jint: `- Jint: .NET, ECMAScript, embedded, scripting`,
  clearscript: `- ClearScript: .NET, V8, Chakra, scripting`,
  jurassic: `- Jurassic: .NET, ECMAScript, IL, compiler`,
  niagara: `- Niagara: .NET, JS, embedded, scripting`,
  ironjs: `- IronJS: .NET, DLR, historical, F#`,
  edgejs: `- Edge.js: .NET, Node.js, in-process, scripting`,
  nodegit: `- nodegit: libgit2, Node.js, native, async`,
  simplegit: `- simple-git: Node.js, Git, promises, streaming`,
  isomorphicgit: `- isomorphic-git: pure JS, Git, browser, Node.js`,
  degit: `- degit: Rich Harris, download, Git, templates`,
  tiged: `- tiged: degit fork, maintain, download, templates`,
  downloadgitrepo: `- download-git-repo: Vue CLI, download, Git, templates`,
  gittar: `- gittar: Luke Edwards, download, Git, templates`,
  gitly: `- gitly: Luke Edwards, fast, download, Git`,
  pacote: `- pacote: npm, tarballs, packuments, caching`,
  cacache: `- cacache: npm, content-addressable, cache, ls`,
  ssri: `- ssri: npm, subresource integrity, hashes, streams`,
  minipass: `- minipass: npm, streams, promises, pipelines`,
  minizlib: `- minizlib: npm, zlib, streams, brotli`,
  tar: `- tar: npm, archives, streams, pack, extract`,
  fstream: `- fstream: npm, streams, historical, legacy`,
  rimraf: `- rimraf: npm, delete, glob, cross-platform`,
  mkdirp: `- mkdirp: npm, directories, recursive, promises`,
  ncp: `- ncp: npm, copy, recursive, filters`,
  cpr: `- cpr: npm, copy, recursive, filters, overwrite`,
  'fs-extra': `- fs-extra: Node.js, fs, promises, copy, move`,
  'graceful-fs': `- graceful-fs: Node.js, fs, EMFILE, queues`,
  chokidar: `- chokidar: Node.js, file watching, polling, native`,
  sane: `- sane: file watching, Watchman, polling, Node.js`,
  watchpack: `- watchpack: webpack, watching, aggregation, polling`,
  gaze: `- gaze: file watching, glob, events, Node.js`,
  pathwatcher: `- pathwatcher: Atom, file watching, native, async`,
  nsfw: `- nsfw: Axosoft, file watching, native, cross-platform`,
  '@parcel/watcher': `- @parcel/watcher: Rust, file watching, native`,
  '@vscode/filewatcher': `- @vscode/filewatcher: VS Code, file watching, native`,
  fsevents: `- fsevents: macOS, file watching, native, Node.js`,
  inotify: `- inotify: Linux, file watching, native, events`,
  ReadDirectoryChangesW: `- ReadDirectoryChangesW: Windows, file watching, native`,
  FindFirstChangeNotification: `- FindFirstChangeNotification: Windows, file watching, legacy`,
  kqueue: `- kqueue: BSD, file watching, native, events`,
  portfs: `- portfs: Solaris, file watching, native, events`,
  fanotify: `- fanotify: Linux, file watching, permissions, access`,
  dnotify: `- dnotify: Linux, file watching, historical, obsolete`,
  gamin: `- gamin: FAM, file watching, compatibility, polling`,
  imklog: `- imklog: klogd, kernel logging, syslog, Linux`,
  rsyslog: `- rsyslog: syslog, high performance, queues, TLS`,
  'syslog-ng': `- syslog-ng: Balabit, syslog, high performance, patterns`,
  fluentbit: `- Fluent Bit: CNCF, logging, metrics, traces, streams`,
  // vector: `- Vector: Datadog, observability, transforms, sinks`,
  // logstash: `- Logstash: Elastic, pipelines, filters, outputs`,
  // filebeat: `- Filebeat: Elastic, lightweight, modules, processors`,
  // metricbeat: `- Metricbeat: Elastic, metrics, system, modules`,
  // heartbeat: `- Heartbeat: Elastic, uptime, monitors, ICMP`,
  // auditbeat: `- Auditbeat: Elastic, security, audit, file integrity`,
  // packetbeat: `- Packetbeat: Elastic, network, flows, protocols`,
  // winlogbeat: `- Winlogbeat: Elastic, Windows, events, sysmon`,
  journalbeat: `- Journalbeat: Elastic, systemd, journal, logs`,
  functionbeat: `- Functionbeat: Elastic, serverless, cloudwatch, logs`,
  osquerybeat: `- Osquerybeat: Elastic, osquery, SQL, security`,
  cloudbeat: `- Cloudbeat: Elastic, CSPM, KSPM, benchmarks`,
  'apm-server': `- APM Server: Elastic, traces, RUM, OpenTelemetry`,
  'fleet-server': `- Fleet Server: Elastic, agents, policies, actions`,
  // elasticsearch: `- elasticsearch: search, analytics, logs, vectors`,
  kibana: `- Kibana: visualization, dashboards, alerts, Canvas`,
  // logstash: `- Logstash: data processing, pipelines, plugins`,
  beats: `- Beats: data shippers, lightweight, modules`,
  apm: `- Elastic APM: traces, metrics, RUM, profiling`,
  'enterprise-search': `- Enterprise Search: App Search, Workplace Search`,
  observability: `- Elastic Observability: logs, metrics, traces, profiling`,
  security: `- Elastic Security: SIEM, endpoint, cloud, detection`,
  maps: `- Elastic Maps: geo, layers, EMS, GeoJSON`,
  uptime: `- Elastic Uptime: monitors, alerts, Synthetics`,
  synthetics: `- Elastic Synthetics: monitors, journeys, testing`,
  profiling: `- Elastic Universal Profiling: eBPF, continuous, CO2`,
  'machine-learning': `- Elastic ML: anomaly detection, forecasting, NLP`,
  'data-frame-analytics': `- Elastic DFA: classification, regression, outlier`,
  transform: `- Elastic Transform: pivot, latest, aggregations`,
  rollup: `- Elastic Rollup: historical, downsampling, aggregations`,
  'searchable-snapshots': `- Searchable Snapshots: cold, frozen, S3, cache`,
  'frozen-tier': `- Frozen Tier: searchable snapshots, S3, cache`,
  'cross-cluster': `- Cross-Cluster: search, replication, CCS, CCR`,
  autoscaling: `- Elastic Autoscaling: ML, hot, warm, cold, frozen`,
  ilm: `- ILM: hot, warm, cold, frozen, delete, rollover`,
  slm: `- SLM: snapshots, policies, schedules, retention`,
  eck: `- ECK: Kubernetes, operators, Elastic Stack, orchestration`,
  cloud: `- Elastic Cloud: managed, SaaS, serverless, hosted`,
  serverless: `- Elastic Serverless: projects, Vector Search, AI`,
  'serverless-search': `- Elastic Serverless Search: AI, search, relevance`,
  'serverless-observability': `- Elastic Serverless Observability: OTel, profiling`,
  'serverless-security': `- Elastic Serverless Security: AI, SIEM, detection`,
  esql: `- ES|QL: Elastic, query language, piped, aggregations`,
  kql: `- KQL: Kibana, query language, autocomplete, filters`,
  lucene: `- Lucene: search, indexing, queries, analyzers`,
  solr: `- Solr: search, indexing, faceting, SolrCloud`,
  // opensearch: `- OpenSearch: fork, search, analytics, plugins`,
  // typesense: `- Typesense: typo-tolerant, faceted, geosearch`,
  // meilisearch: `- Meilisearch: typo-tolerant, faceted, geosearch`,
  // algolia: `- Algolia: instant search, relevance, analytics`,
  // redisearch: `- RediSearch: secondary index, aggregations, vector`,
  vespa: `- Vespa: big data serving, search, ML, ranking`,
  // weaviate: `- Weaviate: vector search, GraphQL, modular AI`,
  // pinecone: `- Pinecone: managed vector DB, metadata, hybrid`,
  // chroma: `- Chroma: embeddings, queries, filtering, persistence`,
  // qdrant: `- Qdrant: vector, filtering, hybrid, distributed`,
  // milvus: `- Milvus: GPU index, billion-scale, hybrid search`,
  // faiss: `- Faiss: Facebook, GPU, billion-scale, quantization`,
  // annoy: `- Annoy: Spotify, approximate nearest neighbors, mmap`,
  // hnswlib: `- HNSWLIB: hierarchical NSW, fast, memory efficient`,
  // scann: `- ScaNN: Google, asymmetric hashing, quantization`,
  // voyager: `- Voyager: Spotify, HNSW, bindings, persistence`,
  // usearch: `- USearch: single-file, SIMD, metric agnostic`,
  pgvector: `- pgvector: Postgres, vector, ivfflat, hnsw`,
  'sqlite-vss': `- sqlite-vss: SQLite, vector, virtual tables`,
  // duckdb: `- DuckDB: embedded, SQL, Parquet, Arrow, analytics`,
  // clickhouse: `- ClickHouse: columnar, SQL, materialized views`,
  'apache Druid': `- Druid: real-time analytics, ingestion, queries`,
  pinot: `- Pinot: LinkedIn, real-time OLAP, multi-tenant`,
  starrocks: `- StarRocks: MPP, real-time, vectorized, short-circuit`,
  doris: `- Apache Doris: MPP, real-time, vectorized, federated`,
  presto: `- Presto: Facebook, distributed SQL, federated, Trino`,
  trino: `- Trino: Presto fork, distributed SQL, federated`,
  dremio: `- Dremio: data lake, reflections, Arctic, Sonar`,
  delta: `- Delta Lake: ACID, time travel, Z-ordering, streaming`,
  // iceberg: `- Apache Iceberg: table format, time travel, partitioning`,
  // hudi: `- Apache Hudi: upserts, incremental, time travel, CDC`,
  paimon: `- Apache Paimon: lake format, streaming, LSM`,
  // orc: `- ORC: columnar, ACID, Hive, types, predicate pushdown`,
  // parquet: `- Parquet: columnar, compression, predicate pushdown`,
  // avro: `- Avro: schemas, serialization, RPC, compatibility`,
  protobuf: `- Protocol Buffers: schemas, serialization, RPC`,
  // thrift: `- Thrift: IDL, protocols, transports, servers`,
  // capnproto: `- Cap'n Proto: zero-copy, RPC, schemas, versions`,
  // flatbuffers: `- FlatBuffers: zero-parse, schemas, mutable, JSON`,
  // msgpack: `- MessagePack: binary JSON, streaming, typed`,
  // bson: `- BSON: MongoDB, binary JSON, types, ObjectId`,
  cbor: `- CBOR: RFC 7049, binary JSON, deterministic, tags`,
  smile: `- Smile: Jackson, binary JSON, self-describing`,
  ion: `- Amazon Ion: text/binary, timestamps, decimals, symbols`,
  jsonb: `- JSONB: Postgres, binary JSON, indexing, GIN`,
  json: `- JSON: JavaScript, text, ubiquitous, streaming`,
  xml: `- XML: markup, schemas, XPath, XSLT, DOM/SAX`,
  yaml: `- YAML: configuration, anchors, tags, streaming`,
  toml: `- TOML: configuration, minimal, INI-like, typed`,
  ini: `- INI: configuration, sections, key-value, simple`,
  csv: `- CSV: tabular, RFC 4180, streaming, parsing`,
  tsv: `- TSV: tabular, tabs, simple, bioinformatics`,
  ssv: `- SSV: semicolon-separated, European, Excel`,
  psv: `- PSV: pipe-separated, Unix, logs`,
  rfc4180: `- RFC 4180: CSV standard, quotes, escapes, headers`,
  excel: `- Excel: XLSX, formulas, macros, VBA, COM`,
  ods: `- ODS: OpenDocument, spreadsheets, formulas, XML`,
  numbers: `- Numbers: Apple, spreadsheets, iCloud, iWork`,
  gnumeric: `- Gnumeric: GNOME, spreadsheets, functions, plugins`,
  lotus: `- Lotus 1-2-3: historical, spreadsheets, WKS`,
  quattro: `- Quattro Pro: Borland, spreadsheets, QPW`,
  visicalc: `- VisiCalc: first spreadsheet, Dan Bricklin, 1979`,
  multics: `- Multics: historical, CTSS, UNIX predecessor`,
  unix: `- UNIX: Thompson, Ritchie, POSIX, shells, pipes`,
  linux: `- Linux: kernel, Torvalds, GPL, distributions`,
  gnu: `- GNU: Stallman, GPL, tools, Hurd, freedom`,
  bsd: `- BSD: Berkeley, UNIX, FreeBSD, OpenBSD, NetBSD`,
  freebsd: `- FreeBSD: BSD, ports, ZFS, jails, bhyve`,
  openbsd: `- OpenBSD: security, OpenSSH, LibreSSL, PF`,
  netbsd: `- NetBSD: portability, pkgsrc, rump kernels`,
  // dragonfly: `- DragonFly BSD: Hammer2, MPI, performance`,
  illumos: `- illumos: OpenSolaris, ZFS, DTrace, zones`,
  smartos: `- SmartOS: illumos, zones, KVM, DTrace`,
  omnios: `- OmniOS: illumos, server, IPS, zones`,
  tribblix: `- Tribblix: illumos, SVR4, pkgsrc, retro`,
  helios: `- Helios: illumos, Rust, microkernel, redox`,
  redox: `- Redox: Rust, microkernel, POSIX, drivers`,
  fuchsia: `- Fuchsia: Google, Zircon, Flutter, microkernel`,
  zircon: `- Zircon: Fuchsia, kernel, objects, channels`,
  littlekernel: `- Little Kernel: LK, embedded, bootloader, Google`,
  // freertos: `- FreeRTOS: RTOS, tasks, queues, timers, MPU`,
};

function getLanguageGuidance(lang: string, targetStandards?: string[]): string {
  const lower = lang.toLowerCase().replace(/[^a-z0-9]/g, '');
  const guide = LANGUAGE_GUIDES[lower];
  if (!guide) return `- ${lang}: Follow best practices for this language`;
  return typeof guide === 'function' ? guide(targetStandards) : guide;
}

function getFrameworkGuidance(framework: string): string {
  const lower = framework.toLowerCase().replace(/[^a-z0-9]/g, '');
  return FRAMEWORK_GUIDES[lower] || `- ${framework}: Follow project conventions and documentation`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatHistoryForPrompt(history: ChatMessage[], maxMessages: number): string {
  if (!history || !history.length || maxMessages <= 0) return '';
  const recent = history.slice(-maxMessages);
  const formatted = recent
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      const content =
        msg.content.length > 500 ? msg.content.slice(0, 500) + '... [truncated]' : msg.content;
      return `[${role}]: ${content}`;
    })
    .join('\n\n');
  return `<conversation_history>\n${formatted}\n</conversation_history>`;
}

function buildCoderSystemPromptInternal(modelId: string, context: CodeContext, now: Date): string {
  const parts: string[] = [];
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  parts.push(`You are NYX, a professional, elite, and highly capable AI software engineering assistant developed by Yashas. Always identify yourself as NYX. Your tone is highly professional, direct, clear, objective, and authoritative—identical to Google Gemini. Avoid friendly fluff, excessive greetings, or marketing language. Focus on providing highly structured, precise, clean, and complete code solutions.

Current Date: ${dateStr}
Current Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
Current Year: ${now.getFullYear()}`);

  switch (context.taskType) {
    case 'generate':
      parts.push(`TASK: Write production-ready code.
Rules:
- Write clean, well-commented code
- Follow language-specific best practices and conventions
- Include error handling and edge cases
- Use modern syntax and patterns
- Provide the complete implementation, not just snippets
- If multiple files are needed, clearly mark each file with: === FILE: path/to/file.ext ===
- After code, briefly explain key design decisions`);
      break;
    case 'debug':
      parts.push(`TASK: Debug and fix code.
Rules:
- First, identify the root cause of the error
- Explain the bug clearly before providing the fix
- Provide the corrected code with comments explaining what changed
- Suggest preventive measures to avoid similar bugs`);
      break;
    case 'review':
      parts.push(`TASK: Code review.
Rules:
- Evaluate: correctness, performance, security, readability, maintainability
- Highlight strengths and weaknesses
- Suggest specific improvements with examples
- Rate the code 1-10 with justification`);
      break;
    case 'refactor':
      parts.push(`TASK: Refactor code.
Rules:
- Improve code quality without changing behavior
- Focus on: readability, performance, DRY principles, type safety
- Explain each refactoring decision
- Provide the complete refactored code`);
      break;
    case 'explain':
      parts.push(`TASK: Explain code.
Rules:
- Break down the code line by line or section by section
- Explain the "why" not just the "what"
- Use analogies for complex concepts
- Highlight potential issues or improvements`);
      break;
    default:
      parts.push(`TASK: Analyze and output high-quality software engineering solutions.`);
  }

  if (context.detectedLanguages && context.detectedLanguages.length > 0) {
    parts.push(`Primary language(s): ${context.detectedLanguages.join(', ')}`);
    for (const lang of context.detectedLanguages) {
      parts.push(getLanguageGuidance(lang, context.targetStandards));
    }
  }

  if (context.frameworks && context.frameworks.length > 0) {
    parts.push(`Frameworks: ${context.frameworks.join(', ')}`);
    for (const fw of context.frameworks) {
      parts.push(getFrameworkGuidance(fw));
    }
  }

  if (modelId.includes('qwen') && modelId.includes('coder')) {
    parts.push(`Note: You are a specialized coding model. Prioritize correctness over cleverness.`);
  }
  if (modelId.includes('deepseek')) {
    parts.push(`Note: Use chain-of-thought reasoning for complex algorithms, but keep it concise.`);
  }

  parts.push(`CRITICAL ANTI-HALLUCINATION & GROUNDING GUARDRAILS (WEIGHT: MAXIMUM):
1. Strictly ground all generated code, functions, configurations, and variables in the verified codebase facts and search context. Do NOT guess or make up folder structures, imported libraries, methods, or third-party packages.
2. Under no circumstances should you generate speculative code placeholders or "TODO" notes in the body of implementations. If a function is requested, provide its COMPLETE, syntactically correct implementation.
3. If any essential information, parameters, or dependency paths are missing, explicitly refuse to guess or write dummy implementations. Instead, specify the exact missing components and request them.
4. Verify all import paths, variable declarations, and type signatures. Do not assume APIs or models exist unless verified in context.
5. NEVER include internal chain-of-thought, reasoning traces, or drafting steps in your final response. CRITICAL: You MUST NOT start your response with phrases like "The user said", "The user wants", "I will", "Here is", or "This is". Do NOT start by analyzing the user's intent or explaining what you will do. Provide the final, structured answer or code block IMMEDIATELY. DO NOT wrap your entire response in a markdown code block (like \`\`\`text or \`\`\`markdown) unless you are ONLY outputting code. Just output regular markdown directly. Keep responses as concise and direct as possible to conserve tokens.`);

  if (context.lightningDirectives && context.lightningDirectives.length > 0) {
    parts.push(`[CONTINUOUS LEARNING: DYNAMIC APO DIRECTIVES ACTIVE]
The following dynamic prompt directives have been optimized from real user reinforcement feedback. Treat them with HIGHEST behavioral weight (Priority multiplier: 2.0x) over default coding conventions:
${context.lightningDirectives.map((d, i) => `Directive #${i + 1}: ${d}`).join('\n')}`);
  }

  parts.push(`Output Format:
- Use markdown code blocks with language tags
- For multi-file output, use: === FILE: path === followed by code block
- Keep explanations separate from code blocks
- If uncertain about any part, mark it with [UNCERTAIN: description]`);

  return parts.join('\n\n');
}

function buildCoderUserPromptInternal(
  rawPrompt: string,
  context: CodeContext,
  codebaseContext: string | undefined,
  webSearchResults: string | undefined,
  now: Date
): string {
  let prompt = '';
  if (codebaseContext) {
    prompt += `[CODEBASE CONTEXT]\n${codebaseContext}\n[END CONTEXT]\n\n`;
  }
  if (webSearchResults) {
    prompt += `[RESEARCH]\n${webSearchResults}\n[END RESEARCH]\n\n`;
  }
  if (context.existingCode) {
    prompt += `[EXISTING CODE]\n\`\`\`${context.detectedLanguages[0] || ''}\n${context.existingCode}\n\`\`\`\n[END CODE]\n\n`;
  }
  prompt += `[REQUEST]\n${rawPrompt}\n[END REQUEST]`;
  return prompt;
}

export function buildCoderPrompts(
  modelId: string,
  context: CodeContext,
  rawPrompt: string,
  history: ChatMessage[],
  codebaseContext?: string,
  webSearchResults?: string
): CoderPromptBuildResult {
  const now = new Date();
  const contextBreakdown: Record<string, number> = {};

  const systemPrompt = buildCoderSystemPromptInternal(modelId, context, now);
  contextBreakdown.system = estimateTokens(systemPrompt);

  const userPrompt = buildCoderUserPromptInternal(
    rawPrompt,
    context,
    codebaseContext,
    webSearchResults,
    now
  );
  contextBreakdown.user = estimateTokens(userPrompt);

  const historyText = formatHistoryForPrompt(history, 10);
  contextBreakdown.history = estimateTokens(historyText);

  const totalTokens = Object.values(contextBreakdown).reduce((a, b) => a + b, 0);

  return {
    systemPrompt,
    userPrompt: historyText ? `${historyText}\n\n${userPrompt}` : userPrompt,
    metadata: {
      estimatedTokens: totalTokens,
      contextBreakdown,
      detectedTaskComplexity: context.complexity || 'medium',
    },
  };
}

// ── Suggest Relevant Files ────────────────────────────────────────────────────

function suggestRelevantFiles(context: CodeContext, rawPrompt: string): string[] {
  const suggestions: string[] = [];
  const lower = rawPrompt.toLowerCase();

  // Pattern-based suggestions
  if (lower.includes('test') || lower.includes('spec')) {
    suggestions.push('Find existing test files to match patterns');
  }
  if (lower.includes('config') || lower.includes('setting')) {
    suggestions.push('Check config/ or .env files');
  }
  if (lower.includes('api') || lower.includes('endpoint')) {
    suggestions.push('Look for routes/, controllers/, or handlers/');
  }
  if (lower.includes('database') || lower.includes('model')) {
    suggestions.push('Check models/, entities/, or schema files');
  }
  if (lower.includes('ui') || lower.includes('component')) {
    suggestions.push('Look in components/, views/, or widgets/');
  }
  if (lower.includes('style') || lower.includes('css')) {
    suggestions.push('Check styles/, themes/, or CSS-in-JS files');
  }
  if (lower.includes('hook') || lower.includes('composable')) {
    suggestions.push('Look in hooks/, composables/, or mixins/');
  }
  if (lower.includes('util') || lower.includes('helper')) {
    suggestions.push('Check utils/, helpers/, or lib/');
  }
  if (lower.includes('middleware') || lower.includes('guard')) {
    suggestions.push('Look for middleware/, guards/, or interceptors/');
  }
  if (lower.includes('migration') || lower.includes('schema')) {
    suggestions.push('Check migrations/, schemas/, or ddl/');
  }

  return suggestions.length > 0 ? suggestions : ['Review workspace structure for relevant files'];
}

// ── Backward-Compatible Exports ───────────────────────────────────────────────

/**
 * @deprecated Use buildCoderPrompts instead for full context and metadata
 */
export function buildCoderSystemPrompt(modelId: string, context: CodeContext): string {
  return buildCoderPrompts(modelId, context, '', [], undefined, undefined).systemPrompt;
}

/**
 * @deprecated Use buildCoderPrompts instead for full context and metadata
 */
export function buildCoderUserPrompt(
  rawPrompt: string,
  context: CodeContext,
  codebaseContext?: string,
  webSearchResults?: string
): string {
  return buildCoderPrompts('', context, rawPrompt, [], codebaseContext, webSearchResults)
    .userPrompt;
}
