# HuggingFace Explorer — 2026 Rewrite

## What's New

### Architecture
- **Feature-based folder structure** — Everything related to HF Explorer lives in one folder
- **Custom hooks** — Data fetching, token management, hardware detection, downloads
- **Component composition** — Small, focused components with single responsibilities
- **Strict TypeScript** — No `any` types; full type safety for Tauri commands

### Data Fetching
- **TanStack Query (React Query)** — Replaces manual `useEffect` + `useState` fetching
  - Automatic caching, deduplication, background refetching
  - Infinite scroll with `useInfiniteQuery`
  - Stale time & garbage collection configured
- **AbortController pattern** — Built into TanStack Query for request cancellation

### Security
- **Rehype Sanitize** — All markdown from the internet is sanitized before rendering
  - Prevents XSS via malicious READMEs
- **Session storage for tokens** — `sessionStorage` instead of `localStorage`
  - Cleared when tab closes; more secure than persistent storage
  - Future: migrate to Tauri Secure Storage plugin

### Accessibility
- `aria-label` on all interactive elements
- `role="list"` and `role="radio"` for filter/sort controls
- `aria-checked` for toggle states
- Progress bars have `role="progressbar"` with `aria-valuenow`

### Error Handling
- **React Error Boundary** — Wraps markdown renderer and model cards
  - Catches runtime errors without crashing the entire app
  - Shows friendly error UI with retry button

### Performance
- **Skeleton screens** — Better perceived performance than spinners
- **Image lazy loading** — `loading="lazy"` on all avatars
- **Memoized callbacks** — `useCallback` only where needed (React Compiler handles most)

## Required Dependencies

```bash
# Core
npm install @tanstack/react-query framer-motion react-markdown remark-gfm rehype-sanitize

# Already in your project (keep these)
# @tauri-apps/api/core @tauri-apps/api/event
# @phosphor-icons/react
# zustand
# tailwindcss
```

## Setup TanStack Query

In your root `main.tsx` or `App.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  );
}
```

## File Structure

```
src/features/hf-explorer/
├── HuggingFaceExplorer.tsx          # Main orchestrator component
├── index.ts                         # Barrel exports
├── types/
│   └── index.ts                     # All TypeScript interfaces
├── constants/
│   ├── providers.ts                 # PROVIDER_META mapping
│   ├── categories.ts                # CATEGORIES, CAT_COLOR, CAT_ACTIVE
│   ├── sort.ts                      # SORT_OPTIONS
│   └── capabilities.ts              # CAP_COLOR_MAP, NOISE_TAGS
├── lib/
│   ├── utils.ts                     # formatSize, formatCount, parseModelId, etc.
│   └── capabilities.ts            # getCapabilityTags, getDisplayTags
├── hooks/
│   ├── useHfToken.ts                # Secure token management
│   ├── useHardware.ts               # Hardware specs detection
│   ├── useHfModels.ts               # TanStack Query data fetching
│   └── useHfDownloads.ts            # Download event listeners
└── components/
    ├── ProviderAvatar.tsx           # Gradient avatar with GitHub fallback
    ├── ProviderName.tsx             # Colored provider name
    ├── DownloadRow.tsx              # Single download progress row
    ├── ModelCard.tsx                # Model list item
    ├── ModelDetail.tsx              # Full model detail view
    ├── EmptyState.tsx               # No results state
    ├── ErrorBoundary.tsx            # React error boundary
    ├── SkeletonCard.tsx             # Loading placeholder
    ├── SearchBar.tsx                # Search input
    ├── TokenInput.tsx               # HF token input
    ├── Sidebar.tsx                  # Filters sidebar
    ├── ActiveDownloads.tsx          # Downloads panel
    └── ModelList.tsx                # Virtualized model list
```
