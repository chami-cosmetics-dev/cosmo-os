Cosmo split contacts — how to read the CSV
==========================================

File: cosmo-split-contacts-SIMPLE.csv

Each row = ONE person who currently has TWO Cosmo cards:

  1) EMAIL CARD  = has email, NO phone (usually from web/Shopify)
  2) PHONE CARD  = has phone (usually from Adapt/ERP)

Insight opens one card at a time, so history looks empty on the other card.

Columns
-------
verdict
  SAME  = names match closely → same person
  MAYBE = only partial name match → check by hand
  NO    = do not merge

what_to_do
  Plain instruction for that row

email_card_name / email_card_email
  The card with no phone

phone_card_name / phone_card_phone
  The card that already has the number

erp_name
  Name in ERP for that email+phone

names_look_same
  YES if names are the same after cleaning Mr/Ms etc.

email_card_web_orders
  How many Cosmo web orders sit on the email

phone_card_adapt_invoices
  How many Adapt POS invoices sit on the phone card

email_card_id / phone_card_id
  Cosmo IDs (for merge later)

Counts in this file
-------------------
maybe: 15
no: 7
yes: 400

Recommended
-----------
1. Sort/filter verdict = SAME
2. Spot-check a few names
3. Only then merge email card → phone card
