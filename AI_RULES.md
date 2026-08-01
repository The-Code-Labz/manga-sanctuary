# AI Rules — MangaSanctuary

## Tech Stack

- **React 18** with **TypeScript** — all source code lives in `src/`.
- **Vite** — dev server and build tool (`vite.config.ts`).
- **React Router v6** — client-side routing; all routes are defined in `src/App.tsx`.
- **Tailwind CSS** — utility-first styling; configured in `tailwind.config.ts` with a custom dark theme and design tokens (golden, surface, lang-badge-\* etc.).
- **shadcn/ui** — pre-built UI primitives in `src/components/ui/`. These files are **read-only** and must not be edited.
- **Supabase** — backend (auth, Postgres database, Edge Functions). Client lives at `src/integrations/supabase/client.ts`.
- **TanStack React Query** — all server-state fetching and caching. Custom hooks live in `src/hooks/`.
- **Framer Motion** — animations and transitions.
- **Sonner** — toast notifications (via `toast` from `"sonner"`).
- **Lucide React** — icon library; do not install or use any other icon package.

## Project Structure Rules

- Pages go in `src/pages/` and are imported into `src/App.tsx` routes.
- Reusable components go in `src/components/` (grouped by domain, e.g. `manga/`, `layout/`).
- Hooks go in `src/hooks/`.
- The default/index page is `src/pages/Index.tsx` (re-exports `Home`).
- Directory names are **lowercase** (`src/pages`, `src/components`). File names may use PascalCase.

## Library Usage Rules

| Concern | Use | Do NOT use |
|---|---|---|
| **Styling** | Tailwind CSS utility classes | Inline `style` props, CSS modules, styled-components, Emotion |
| **UI primitives** (Button, Dialog, Tabs, etc.) | shadcn/ui from `@/components/ui/*` | MUI, Ant Design, Chakra UI, or hand-rolled equivalents |
| **Icons** | `lucide-react` | Font Awesome, Heroicons, react-icons, or any other icon library |
| **Routing** | `react-router-dom` v6 (`<Routes>`, `<Route>`, `useNavigate`, `useParams`, `<Link>`) | Next.js router, TanStack Router, or `window.location` for navigation |
| **Data fetching / server state** | `@tanstack/react-query` (`useQuery`, `useMutation`, `useQueryClient`) | `useEffect` + `fetch` for data loading, SWR, Apollo |
| **Auth, database, storage** | Supabase JS client (`@/integrations/supabase/client`) | Firebase, custom REST APIs, direct `fetch` to Supabase REST endpoints |
| **Toast / notifications** | `sonner` — import `toast` from `"sonner"` | `react-hot-toast`, `react-toastify`, window alerts |
| **Animations** | `framer-motion` | CSS `@keyframes` for complex animations, react-spring, GSAP |
| **Forms** | `react-hook-form` + `zod` for validation (when needed) | Formik, uncontrolled forms without validation |
| **Date utilities** | `date-fns` | Moment.js, Day.js, Luxon |

## Coding Rules

1. **Do not edit `src/components/ui/*`** — these are shadcn/ui generated files. Create wrapper components if customization is needed.
2. **One component per file.** Keep components under ~100 lines; refactor when they grow larger.
3. **All new components must be TypeScript** (`.tsx`).
4. **Use the existing design tokens** defined in `src/index.css` (e.g. `text-golden`, `bg-surface`, `lang-badge-jp`). Do not introduce new CSS custom properties without good reason.
5. **Supabase types** are auto-generated in `src/integrations/supabase/types.ts` — do not edit manually.
6. **Environment variables** must be prefixed with `VITE_` and accessed via `import.meta.env`.
7. **No `try/catch`** unless explicitly required — let errors bubble so they surface in development.
8. **Always design responsively** — mobile-first with Tailwind breakpoints (`sm:`, `md:`, `lg:`, `xl:`).
9. **Keep routes in `src/App.tsx`** — do not scatter route definitions across files.
10. **Edge Functions** live in `supabase/functions/` and use Deno. They communicate with the Lovable AI gateway when AI features are needed.