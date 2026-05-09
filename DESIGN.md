# Design

## Visual Theme

Warden uses a dark, gridded control-plane aesthetic. The physical scene is an engineer evaluating money-moving agent infrastructure on a large monitor, under low ambient light, where precision and confidence matter more than warmth.

The surface should feel like an instrument panel: strict, legible, quiet, and exact.

## Color Palette

- Base: deep blue-charcoal OKLCH neutrals.
- Text: tinted off-white and stepped cool grays.
- Signal: instrument-lamp amber for primary action and key labels.
- Allow: muted green for approved states.
- Deny: controlled red for blocked states.
- Pending: amber-yellow for approval/waiting states.

Use the status colors sparingly. Amber is the brand signal, not a decorative gradient.

## Typography

Recursive is the core type family. Use the variable family deliberately:

- Proportional Recursive for headings and body.
- Mono Recursive for labels, identifiers, hashes, table metadata, and protocol details.
- Large type should be reserved for the promise and final CTA.
- Dense data surfaces need compact sizes with clear weight and color contrast.

## Layout

The page should use a visible technical grid, ruled sections, and left-aligned composition. Prefer one strong concept per section. Use tables, strips, and diagrams when they carry meaning; remove them when they duplicate a nearby concept.

Cards are allowed for actual repeated entities such as agents or receipts, but nested cards should be avoided.

## Components

- Ribbon navigation with logo, concise links, and one primary action.
- Control-plane diagram for the Warden loop.
- Sample trace for allow/deny behavior.
- Console preview for product credibility.
- Policy gate visual for rule evaluation.
- Appendix details behind progressive disclosure.

## Motion

Motion should be minimal and functional: small live dots, subtle status pulse, and no layout-shifting animation. No bounce, no ornamental motion.
