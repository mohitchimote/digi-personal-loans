# Frontend

Angular 22 single-page app: customer and business wizards, banker, underwriter, admin and platform portals, in English
and Hebrew (RTL). In production the Worker serves the built app and `/api/*` from the same origin.

## Commands

```bash
npm install
npx ng serve        # http://localhost:4200, /api is proxied to a local Worker on :8787 (proxy.conf.json)
npx ng build        # output in dist/frontend (the Worker deploy scripts build it for you)
npx ng test         # unit tests (Vitest-backed builder, no browser needed)
```

Run the Worker first (`cd ../worker && npx wrangler dev`). See the root `README.md` for the whole picture.

## Layout (`src/app`)

| Folder | Holds |
|---|---|
| `pages/` | One folder per screen, grouped by portal (`portal`, `business`, `banker`, `underwriter`, `admin`, `platform`, `login`, `register`) |
| `shared/` | Reusable components (field select, dynamic field, headers, banners, workflow action buttons) and pipes |
| `core/services/` | HTTP services, one per API area |
| `core/guards/`, `core/interceptors/` | Route guards per portal; the auth interceptor (token, and the lender code on public calls) |
| `core/i18n/` | `en.ts` and `he.ts` dictionaries (keep their keys in step) |
| `core/letters/` | A **copy** of the Worker's letter format and rule engine, only to show sample values in the editor. Keep it in step with `worker/src/lib/letters` |

## Conventions

- Standalone components, signals for local state, reactive forms for wizard steps. **Angular 22 makes components OnPush
  unless they say otherwise**; code that mutates objects in place (the letter editor) sets `ChangeDetectionStrategy.Default`.
- Every user-facing string goes through `'key' | translate` (or `I18nService.t()`), in both languages.
- Brand colours are CSS custom properties set from the Branding admin screen; no hard-coded hex in components, and give
  anything placed on a dark header an explicit light colour.
- **Screens never name a master.** Options come from the form definition (`FormFieldOptionsService`), stored values are
  shown with the `fieldLabel` pipe. See `ARCHITECTURE.md` section 6.11.
- **Lenders:** the app asks the server which lender an address belongs to (`LenderHostService`); the login and
  registration pages show the lender code field only on a shared address with several lenders. Public calls carry
  `?lender=` from the remembered code. A banner shows while an administrator is viewing as another user (read-only).
