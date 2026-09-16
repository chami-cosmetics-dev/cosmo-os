# Contract: Loyalty eligible weekly email

**Feature**: `055-loyalty-eligible-ops`  
**Auth (cron)**: `Authorization: Bearer ${CRON_SECRET}` (non-prod may allow missing secret like other crons).

## Recipients

Reuse `CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS` from `lib/call-center-weekly-email.ts`:

- `asitha@cosmetics.lk`
- `chami@cosmetics.lk`
- `careers@cosmetics.lk`
- `teshani.cosmetics@outlook.com`
- `chamodi.cosmetics@outlook.com`

Do not hardcode a second divergent list.

## GET `/api/cron/loyalty-eligible-weekly-email`

| Query | Notes |
|-------|--------|
| `date` | optional `YYYY-MM-DD` week-end / as-of override |
| `preview` | if `1`, build payload without send (cron auth still required) |

**vercel.json**: `"30 3 * * 1"` (Monday 03:30 UTC ≈ 09:00 Asia/Colombo).

**200**

```json
{
  "ok": true,
  "status": "sent|failed|skipped_no_recipients|skipped_no_company",
  "weekFrom": "2026-09-08",
  "weekTo": "2026-09-14",
  "mtdFrom": "2026-09-01",
  "recipientCount": 5,
  "merchantRows": 12
}
```

## Email content

Subject: `Loyalty eligible showdown · Week of {week_start}–{week_end}`

Body per [spec Appendix A](../spec.md): company totals + merchant-wise table (week pending snapshot / newly eligible / updated + MTD pending / newly eligible / updated). Sorted by MTD pending desc.

## Manual / preview script (optional)

`scripts/send-loyalty-eligible-weekly-email.ts` mirroring call-center weekly script — dry-run + send.

## Errors

| Status | When |
|--------|------|
| 401 | Bad cron auth |
| 500 | Send failure (include status in JSON when possible) |
