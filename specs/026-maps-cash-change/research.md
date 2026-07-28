# Research: 026-maps-cash-change

## Decision 1: Why “Maps unavailable” appears today

**Decision**: Treat the failure as a **Linking / URL-handler** problem, not “no address”. Current `openDirections` builds only `https://www.google.com/maps/dir/?api=1&destination=…`, then uses `Linking.canOpenURL`. On many Android builds (especially without Google Maps / with restricted intents), `canOpenURL` returns false for that HTTPS maps URL → dead-end alert.

**Rationale**: Matches observed rider APK behavior (“Maps unavailable / No maps app is available on this phone”) while the delivery clearly has an address.

**Alternatives considered**:
- Assume missing Google Maps only — incomplete; HTTPS maps links often fail `canOpenURL` even when a browser could open them.
- Embed an in-app map SDK — rejected for v1 (native weight, API keys, scope).

## Decision 2: Maps open strategy + fallback

**Decision**:
1. If address missing / `"No address"` → keep clear “no address” messaging; do not offer map open.
2. Otherwise try opening in order (first success wins), without treating a single `canOpenURL` false as final failure:
   - `geo:0,0?q=<encoded address>` (Android geo intent)
   - `https://www.google.com/maps/search/?api=1&query=<encoded>` (or dir URL)
   - Optionally attempt `Linking.openURL` even when `canOpenURL` is false for https (browser often still works)
3. If all attempts fail → **Alert with actions**: Copy address (+ OK). Use React Native `Clipboard` / `@react-native-clipboard/clipboard` / Expo clipboard API already available in the stack—prefer whatever the project already depends on; add `expo-clipboard` only if nothing suitable exists.
4. Do not require a specific maps brand.

**Rationale**: Spec FR-001/FR-002; copy-address is the minimum useful fallback when no handler opens.

**Alternatives considered**:
- Only open in browser WebView — worse UX for turn-by-turn.
- Share sheet only — optional later; copy is enough for v1.

## Decision 3: Cash change vs 025 tender work

**Decision**: Reuse **025** model and API: `DeliveryPayment.customerGaveAmount` + `changeAmount`, server recomputes `changeAmount = customerGaveAmount − cashDue`, `cashDue` from COD line sum (or full collected when single COD). This feature’s delta is **mobile UX placement**: customer-gave input and live balance **under/near the order total** on the payment panel (example due 2,500 / gave 5,000 → balance 2,500), plus confirm Cosmo OS still displays tender after save.

**Rationale**: Spec assumes prior tender storage; `origin/main` already has the columns. Current `merge/dev-to-main` checkout lacks them—implement on a branch that includes `main` (or cherry-pick 025 tender) rather than inventing a parallel schema.

**Alternatives considered**:
- Client-only change display without persistence — rejected (FR-007).
- New payment table — rejected (025 already covers it).

## Decision 4: Branch / migration approach

**Decision**: Cut `026-maps-cash-change` from (or merge) `main` so tender migration + API validation already exist. Only create a new Prisma migration if tender columns are truly absent everywhere. Deploy with `db:deploy:all` if any environment is missing the 025 migration.

**Rationale**: Constitution I; avoid duplicate migrations for the same columns.

**Alternatives considered**: Re-implement tender only in 026 on stale branch — risk of drift vs main.

## Decision 5: OTA vs APK

**Decision**: Payment UI + maps Linking/clipboard changes are JS-level → shippable via **EAS Update** once OTA-enabled APK is installed. Rebuild APK only if a new native module (e.g. clipboard package requiring native code not already in the binary) is added.

**Rationale**: Spec assumption; matches project OTA direction.

**Alternatives considered**: Always rebuild APK — unnecessary for pure JS.
