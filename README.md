# Token Radar

A token launch radar: it reads a sealed DefiLlama protocol snapshot and ranks the pre-token
protocols by the value a token would carry if it launched at the multiple its own category's
launched protocols trade at.

## The model (radar-2)

- **Eligibility** is the house watchlist's own rule, applied to the whole snapshot: pre-token (no
  market cap, no CoinGecko id, no symbol), not an exchange, not a bridge or liquid-staking
  product, no version marker, no wrapped / staked / staking word, no exchange prefix. A wrapped
  product of a token that already trades never ranks, however large its TVL.
- **Multiple** is the median market-cap / TVL of the snapshot's launched protocols in the same
  category (at least 3 of them); a category with too few comparables uses the global median.
- **Implied value** = TVL x multiple x growth x maturity. Growth is the 7-day TVL change,
  clamped to -60% .. +120% and weighted 0.5. Maturity runs 0.6 to 1.0 over 1095 days with no
  token. No protocol name is ever special-cased.
- **Farm plans** are derived from each protocol's own record (category, chains, TVL, age): six
  concrete steps with what they cost and how long they take.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data),
`out/dashboard/` (the page), `out/screenshots/` (three views) and `out/dossier.json` (the
summary the judge reads, built by `vendor/makefun-board.ts`).

## The dashboard

A static page, no network: the board table (sortable, filterable by category, chain, watchlist
and search), a detail view for each protocol with the model's own inputs and its farm plan, the
method table (every category multiple with its sample count) and the live comparables the
multiples are read from.
