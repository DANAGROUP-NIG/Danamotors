# Shared loading skeletons

Added theme-based Skeleton/LoadingRegion primitives and detail, list, form, dashboard, workspace and table layouts. Placeholders use rounded surfaces, consistent spacing, varied line widths and a gentle pulse. Every pulse in the new shared components respects reduced motion; sidebar placeholders also stop animating when requested.

Integrated initial loading states across staff details, stock/parts/sales/transfers, reports, settings, credit, auth Suspense fallbacks and portal pages. The shared DataTable now uses reusable semantic skeleton rows; dashboard variants share one implementation. Dashboard, portal and job-card route boundaries also provide immediate transition placeholders. Repair workspace and estimate/bill screens use the shared styles. Existing errors, permissions, fetching conditions and action-button progress indicators are preserved. No dependencies, backend contracts or database changes.

Accessibility: one loading status announcement per region; decorative blocks hidden from assistive technology; no fake interactive controls; table rows retain valid table structure. Background-refetch tests verify loaded records remain visible.

Validation: 12 focused tests passed; full frontend lint passed with 0 errors and 71 existing warnings; typecheck and production build passed; git diff --check passed. A static browser preview using production CSS verified no horizontal page overflow at 375, 768 and 1280 pixels and confirmed computed animation is disabled under prefers-reduced-motion. Visual artifacts remain in ignored .audit-local/loading-skeleton-visual. Live authenticated loading transitions were not exercised end to end.
