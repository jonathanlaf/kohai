# Accessibility review — 2026-10-22

Target: WCAG 2.2 AA. This is an implementation review, not a certification.

## Verification

- Rendered Chrome checks with axe-core 4.10.3: WCAG A/AA and best-practice rules.
- French and English, light and dark themes, desktop and 320 CSS-pixel reflow.
- Keyboard focus, skip links, local navigation and external-link announcements.
- Reduced-motion and Windows forced-colour emulation.
- Text enlargement and visible focus indicators.

External HTTP(S) links open a new tab with noopener/noreferrer. A localized
description announces that behaviour without replacing the link's name.
Internal navigation and phone/email links keep their normal behaviour.

Automated checks do not establish full accessibility. A hands-on review with
NVDA/Firefox or VoiceOver/Safari, including pronunciation and reading order,
remains useful. Real email delivery is separate from browser form tests.

## Kohai-specific coverage

Representative pages include kata lists, diagrams, tutorials, vocabulary, history,
dojo precepts, etiquette, belts, basics, uniform instructions, games, About and
credits. Follow-up checks cover French/English heading order and dark-theme contrast.
Existing 35 Python tests and the bilingual-content validator pass.

Games work with buttons instead of dragging. Reordering announces the item and
position; replacing a question or block moves focus to the new content.
Scrollable tables are named, keyboard-reachable regions. On-screen heading
normalization leaves the print source unchanged.

Heian Shodan print previews render in French and English, Letter and A4, with all
images loaded. No changes were made to the paged print layout.
