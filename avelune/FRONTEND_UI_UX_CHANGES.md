# OptiLearn Front-end UI/UX Changes

## Scope and constraints

This pass is intentionally limited to the **front-end presentation layer**. I did not modify:

- React/TypeScript behavior
- Authentication, Supabase, services, routers, contexts, or data access
- Quiz/SEP scoring, persistence, timers, or submission behavior
- Brand components, logo artwork, brand name, tagline, or brand color identities

The existing brand element remains intact.

## Shared visual system

### Design tokens

Updated `src/theme/tokens.css` with a more consistent visual foundation:

- Preserved the existing OptiLearn blue, teal, purple, and subject accent colors.
- Added dark interaction variants for blue and purple actions.
- Refined text neutrals for clearer hierarchy and improved readability.
- Added a subtle border hierarchy (`--color-border` and `--color-border-strong`).
- Refined shadow levels so cards feel layered without looking heavy.
- Added a focus-ring token for keyboard and assistive technology users.
- Added standard motion duration/easing tokens.
- Slightly increased the extra-large radius for calmer, more modern surfaces.

### Global rendering

Updated `src/theme/global.css` to improve the baseline experience:

- Added a very subtle radial background wash without competing with the brand.
- Added consistent transition timing for interactive controls.
- Improved native inputs, textareas, and selects with consistent border, radius, placeholder, focus, and focus-ring behavior.
- Added a shared `pageEnter` animation for route-level content.
- Preserved reduced-motion support.

## App shell and navigation

Updated `src/components/layout/AppShell.module.css`:

- Reduced the header height slightly to create more usable content space.
- Added a translucent, blurred header surface that stays readable while scrolling.
- Added a low-contrast scrolled header shadow and border.
- Added tactile active feedback to the notification/profile control.
- Strengthened avatar definition with a white keyline and subtle shadow.
- Increased the shell’s content breathing room at mobile and desktop breakpoints.
- Refined the floating bottom navigation with a glass-like surface, stronger edge definition, and blur.
- Added better nav active-state definition and subtle pressed-state motion.
- Improved hover treatment so the nav feels interactive without becoming noisy.

## Shared buttons

Updated `src/components/ui/Button.module.css`:

- Added controlled primary-button depth and a slightly lifted hover state.
- Improved secondary-button hover border and elevation.
- Added consistent keyboard focus styling.
- Kept press feedback subtle so buttons still feel fast.
- Prevented the loading spinner from shrinking inside constrained buttons.

## Screen-level polish

Added a cohesive visual polish layer across auth, onboarding, home, study, blog, quiz, SEP, profile, and shared notification styles:

- Added smooth route-entry motion to page containers.
- Standardized card borders and surface shadows.
- Added consistent hover lift on pointer-capable devices only.
- Added focus-ring behavior to card-like interactive elements, chips, options, resume cards, and expandable result sections.
- Added small-screen spacing adjustments and more resilient title sizing.
- Kept touch targets and existing mobile hardening intact.

### Home

- Gave the Continue Learning card a more intentional hero treatment.
- Increased stat-card vertical balance so labels and values scan more naturally.
- Improved section-heading hierarchy.

### Auth and onboarding

- Added restrained decorative background lighting behind the content without changing the OptiLearn brand mark.
- Increased the visual separation and elevation of the login card.
- Made department selection feel more intentional through stronger selected-state depth.

### Study and question reading

- Increased question-card elevation for reading focus.
- Added subtle option hover feedback without changing selection behavior.
- Kept long-form content readable and compatible with Markdown/KaTeX rendering.

### SEP

- Added clearer depth around the sticky timer and question surface.
- Added a subtle selected-option halo so the current answer is easier to scan.

### Notifications

- Added backdrop blur behind the notification sheet.
- Improved the sheet elevation and item hover state.

## Validation

- `npx vite build` passes successfully and transforms the full app bundle.
- The live sandbox app was opened and checked through the splash and login states.
- The existing `npm run build` command remains blocked by five pre-existing TypeScript issues in quiz/SEP code; no logic files were changed to work around them.
- The existing lint command also reports pre-existing React hook and unused-variable findings in logic files; these were intentionally left untouched.

## Files changed

Only CSS files were changed for the UI pass:

- `src/theme/tokens.css`
- `src/theme/global.css`
- `src/components/layout/AppShell.module.css`
- `src/components/ui/Button.module.css`
- `src/components/notifications/NotificationPanel.module.css`
- `src/screens/auth/LoginScreen.module.css`
- `src/screens/blog/BlogListScreen.module.css`
- `src/screens/blog/BlogPostScreen.module.css`
- `src/screens/home/HomeScreen.module.css`
- `src/screens/onboarding/ChooseDepartmentScreen.module.css`
- `src/screens/profile/ProfileScreen.module.css`
- `src/screens/quiz/QuizScreen.module.css`
- `src/screens/quiz/QuizSetupScreen.module.css`
- `src/screens/sep/SepConfigureScreen.module.css`
- `src/screens/sep/SepExamScreen.module.css`
- `src/screens/sep/SepHistoryDetailScreen.module.css`
- `src/screens/sep/SepHistoryScreen.module.css`
- `src/screens/sep/SepInstructionsScreen.module.css`
- `src/screens/study/SectionDetailScreen.module.css`
- `src/screens/study/StudyReaderScreen.module.css`
- `src/screens/study/StudyScreen.module.css`
- `src/screens/study/SubjectDetailScreen.module.css`

No backend, service, router, context, or data-layer file was changed.
