# RUSH! — Frontend design system

Dark navy foundation, neon accents used with intent, bold rounded typography. All values live
in one place — `frontend/src/index.css` (`@theme`) — and every component uses the token names,
so changing a value there restyles the whole app.

## Colour tokens

| Token (Tailwind name) | Value | Use |
|---|---|---|
| `night` | `#05091F` | page background |
| `night-2` | `#080D25` | sidebar, drawer, alternate sections |
| `panel` / `panel-2` / `panel-3` | `#0D1433` / `#121B42` / `#19235A` | cards / inputs, raised / hover, selected |
| `line` / `line-strong` | white 10 % / 20 % | borders, dividers |
| `fg` / `fg-soft` / `muted` / `faint` | `#FFFFFF` / `#CFD4F2` / `#8F97C4` / `#5D6592` | text hierarchy |
| `magenta` | `#F000C8` | **primary action**, brand, "me" highlight |
| `violet` | `#A020F0` | gradient partner of magenta, topics |
| `cyan` | `#00D9FF` | information, links, focus ring, timers |
| `lime` | `#39F500` | success, correct answers, published |
| `sun` | `#FFE600` | winner, points earned, favourites |
| `tangerine` | `#FF9500` | live sessions, drafts, warnings |
| `danger` | `#FF3030` | destructive actions, errors, wrong answers |
| `pink`, `danger-soft` | `#FF6BE2`, `#FF6B6B` | text-safe tints of magenta / red on dark panels |

Rule of thumb: one neon per meaning. Light accents (lime, sun, cyan) carry **dark** text
(`text-night`); magenta, violet, red carry white text.

## Typography

* Display: **Poppins** 600–900 (`font-display`, applied to all `h1`–`h4` and buttons).
* Body: **Inter** 400–700 (`font-sans`).
* Korean fallback: Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic.
* Loaded from Google Fonts in `index.html`; system fonts are used if offline.

## Shape, depth, motion

* Radius: inputs `rounded-xl`, cards `rounded-2xl`, hero blocks/modals `rounded-3xl`, buttons/badges `rounded-full`.
* Shadows: `shadow-card` (default), `shadow-glow-magenta|cyan|lime` (emphasis only).
* Animations: `animate-pop` (entrances), `animate-glow` (live dots), `animate-tile` (dance floor),
  `animate-shimmer` (logo gradient), `animate-float`. All are disabled by `prefers-reduced-motion`.

## Components (`frontend/src/components`)

| Component | File | Notes |
|---|---|---|
| `Button`, `ButtonLink`, `buttonClass` | `ui.tsx` | variants `primary` (magenta→violet glow), `secondary`, `ghost`, `danger`, `neon` (cyan outline), `light` (for white sections); sizes `sm/md/lg` |
| `TextField`, `TextArea`, `SelectField`, `inputClass` | `ui.tsx` | label, hint, error, optional marker, cyan focus ring |
| `Card` | `ui.tsx` | optional `glow` |
| `Badge` | `ui.tsx` | tones `stone, brand, green, blue, amber, red, violet, sun` |
| `Tabs` | `ui.tsx` | underline or `pill` style, `role="tablist"` |
| `Meter` | `ui.tsx` | progress / limit bar (`role="progressbar"`) |
| `Avatar`, `PageHeader`, `SectionLabel` | `ui.tsx` | |
| `LoadingState`, `ErrorState`, `EmptyState`, `NotFoundState`, `FormError`, `Spinner` | `ui.tsx` | |
| `Modal`, `ConfirmProvider`/`useConfirm`, `ToastProvider`/`useToast` | `overlays.tsx` | |
| `Logo`, `NeonFloor`, `NeonDots` | `brand.tsx` | wordmark, illuminated dance-floor grid (decorative, `aria-hidden`) |
| Icon set | `icons.tsx` | 24 px stroke icons, `currentColor` |
| `NavDrawer`, `useNavItems`, `navLinkClass` | `NavDrawer.tsx` | slide-in menu (landing + mobile app) |
| `AppLayout` | `Layout.tsx` | sidebar ≥1024 px, top bar + drawer below |
| `Leaderboard` | `features/play/PlayPage.tsx` | podium styling for top three; used in game and results |
| `QUESTION_TYPE_STYLE` | `features/quizzes/questionTypes.ts` | colour + glyph per question type |

## Layout and responsiveness

* Public landing page (`/`): full-bleed hero with neon floor, white contrast section, dark
  feature grid, final CTA. Mobile-first; on desktop the content centres and the floor widens.
* App pages: max width 72 rem; sidebar on large screens, top bar + drawer on phones/tablets.
* Multi-column layouts collapse to one column on small screens (quiz editor uses 3 columns only ≥1280 px).
