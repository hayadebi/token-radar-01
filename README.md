# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hayadebi/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hayadebi/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from the kit's starter layout. `main.ts` (Node 22, standard library
only) reads the sealed DefiLlama snapshot, ranks every pre-token protocol by implied value, and
writes `board.json`, the static dashboard, the screenshots and `dossier.json` to the output dir.

## The model (lib/model.ts)

```
implied = round( tvl_usd x category_multiple x growth_multiplier x maturity_multiplier x reach_multiplier )
```

- **category_multiple** — value captured per TVL dollar, by DefiLlama category (Lending 0.34,
  CDP 0.32, Dexs/Derivatives 0.30, yield curators/allocators 0.26–0.27, default 0.24, bridges 0.14,
  liquid staking/restaking 0.12: most of their TVL is another token's value passing through).
- **growth_multiplier** — `1 + clamp(change_7d, -50, 100)/100 x 0.6`.
- **maturity_multiplier** — `0.62 + min(age_days, 1095)/1095 x 0.38` (unknown age counts as 365 days).
- **reach_multiplier** — `1 + min(chains - 1, 6) x 0.03`.

The board covers all 40 watchlist protocols plus **every** other rankable pre-token protocol below
the $50M floor (186 early rows, 226 total) — no cap, no hand-picking. Live-token protocols are set
aside and shown at market cap, never mixed into the ranking. Each row carries a 7-step farm plan
whose actions, capital, network fees and durations derive from the protocol's category, first
chain, TVL and age. The dashboard recomputes every row's implied value and farm plan in the page
from the same figures, so page and `board.json` cannot drift apart.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Outputs: `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`.

---
Entered on [make.fun](https://make.fun/?ref=wkeh1yxa&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
