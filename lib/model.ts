// Token Radar, model radar-2: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and then
// carries EVERY other rankable pre-token protocol below the floor, not a capped sample: if the
// radar exists to find early protocols, leaving eligible ones out by an arbitrary cap is a blind
// spot. A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id,
// no symbol). Live-token protocols are kept apart and shown at the market's own values.
//
// Implied value follows only from the snapshot's own figures, in one function for every row:
//
//   implied = round( tvl_usd x catMult(category) x growthMult x maturityMult x reachMult )
//     catMult       what a dollar of TVL in this category has historically been worth as a token:
//                   lending/CDP and DEX protocols monetise TVL directly, yield curators less, and
//                   bridge / liquid-staking products least, because most of their TVL is another
//                   token's value passing through, not value the protocol itself captures.
//     growthMult    1 + clamp(change_7d, -50, 100) / 100 x 0.6: a week of growth is momentum, not
//                   destiny, so it moves the value by at most +60% or -30%.
//     maturityMult  0.62 + min(age_days, 1095) / 1095 x 0.38: a protocol that has run longer with
//                   no token on record has more of a track record to price (unknown age: 365 days).
//     reachMult     1 + min(chains - 1, 6) x 0.03: each extra chain is distribution a launch can
//                   reach on day one, capped at +18%.
//
// No protocol name is ever special-cased: category, chains, TVL, growth and age decide everything.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunable constants, as the dashboard states them. Category multiples live in CATEGORY_MULTIPLES. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_per_chain: number;
  reach_max_extra_chains: number;
  default_multiple: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.62,
  maturity_range: 0.38,
  maturity_days: 1095,
  unknown_age_days: 365,
  reach_per_chain: 0.03,
  reach_max_extra_chains: 6,
  default_multiple: 0.24,
};

/** Category multiples: value captured per TVL dollar, by DefiLlama category. Anything unlisted uses MODEL.default_multiple. */
export const CATEGORY_MULTIPLES: Record<string, number> = {
  'Lending': 0.34,
  'CDP': 0.32,
  'Dexs': 0.30,
  'Derivatives': 0.30,
  'Perps': 0.30,
  'Yield': 0.27,
  'Yield Aggregator': 0.27,
  'Risk Curators': 0.27,
  'Onchain Capital Allocator': 0.26,
  'RWA': 0.26,
  'Payments': 0.24,
  'Insurance': 0.22,
  'Prediction Market': 0.22,
  'Canonical Bridge': 0.14,
  'Bridge': 0.14,
  'Cross Chain Bridge': 0.14,
  'Liquid Staking': 0.12,
  'Liquid Restaking': 0.12,
  'Restaked BTC': 0.12,
};

/** The model's version label: the dashboard names it and the board carries it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  tier: 'watchlist' | 'early';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans regenerated in the page from the same inputs. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  tier: 'watchlist' | 'early';
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  category_multiples: Record<string, number>;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category multiple for one protocol: its DefiLlama category's entry, else the default. */
export function categoryMultiple(category: string | null): number {
  if (category !== null && Object.prototype.hasOwnProperty.call(CATEGORY_MULTIPLES, category)) {
    return CATEGORY_MULTIPLES[category]!;
  }
  return MODEL.default_multiple;
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; catMult: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const catMult = categoryMultiple(protocol.category);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_extra_chains);
  const reachMult = 1 + extraChains * model.reach_per_chain;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult * reachMult));
  return { implied, catMult, growthPct, growthMult, maturityMult, reachMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: EVERY rankable pre-token protocol below the watchlist floor. No cap, no
  // hand-picking: completeness is the claim, and the model, not the selection, does the ranking.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    tier: watch.has(s.p.slug) ? ('watchlist' as const) : ('early' as const),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.catMult,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      reach_multiplier: round4(s.reachMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Network-fee tier of a chain, in whole dollars: mainnet-class, mid, or cheap. Mirrored in the dashboard. */
export function gasTier(chain: string): { setup: number; weekly: number; label: string } {
  if (chain === 'Ethereum' || chain === 'Bitcoin') return { setup: 18, weekly: 6, label: 'mainnet fees' };
  if (chain === 'Binance' || chain === 'Avalanche' || chain === 'Polygon' || chain === 'Gnosis') {
    return { setup: 4, weekly: 1, label: 'mid-range fees' };
  }
  return { setup: 1, weekly: 1, label: 'low fees' };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 42;
  if (age < 180) return 56;
  if (age < 365) return 42;
  if (age < 730) return 35;
  return 28;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and leave the supply position open.`;
  }
  if (c.includes('dex') || c.includes('swap')) {
    return `Provide $${capital} of liquidity, half USDC and half the paired asset, to ${name}'s most-used pool on ${chain}.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then deposit the bridged funds in one app on the destination chain.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the staking receipt token in the same wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('perps')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade, long and short the same size.`;
  }
  if (c.includes('prediction')) {
    return `Fund the wallet with $${capital} and take one position in ${name}'s most liquid market.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('aggregator') || c.includes('risk')) {
    return `Deposit $${capital} into the highest-TVL ${name} vault on ${chain} and keep the vault shares in the wallet.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it without moving it to another wallet.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} for the longest term offered and keep the policy.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of USDC onto ${name} and make one deposit in a native app so the wallet has history on the chain.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, different interaction: breadth of use, not one repeated click. */
function secondFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const part = Math.max(20, Math.round(capital / 4));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `After 7 days, borrow $${part} against the supply on ${name}, hold it for 7 days, then repay in full so both sides of the market are on record.`;
  }
  if (c.includes('dex') || c.includes('swap')) {
    return `Make two swaps of about $${part} each in ${name}'s main pool on ${chain}, a week apart, so the wallet shows trading as well as liquidity.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${part} back through ${name} once, so the wallet has a round trip, then bridge it in again and keep it on ${chain}.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Move $${part} of the staking receipt into one vault or pool that ${name} itself lists, so the position earns in two places.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('perps')) {
    return `Close the hedge after 7 days and open one new small trade on ${name}, so the wallet has more than one settled position.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('aggregator') || c.includes('risk')) {
    return `Move $${part} into a second ${name} vault on ${chain} after 2 weeks, so the wallet holds two vault positions, not one.`;
  }
  return `Use a second feature of ${name} on ${chain} with about $${part}, such as a vote, a claim check or a smaller second deposit.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. Every figure is
 * derived from the protocol's own record (category, first chain, TVL, age), never from its name.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(4, Math.round(hold / 7));
  const gas = gasTier(chain);
  return [
    {
      text: `Set up a fresh wallet for ${p.name} only, fund it from your main wallet, and store the seed phrase offline on paper.`,
      cost: `one funding transfer, about $${gas.setup} of network fees (${gas.label} on ${chain})`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus about $${gas.setup} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondFor(p, capital, chain),
      cost: `about $${gas.weekly} of gas, the capital is already in the position`,
      time: '15 minutes, in the second week',
    },
    {
      text: `Repeat one qualifying action on ${p.name} every week for ${weeks} weeks, on roughly the same weekday, so the activity spans ${weeks} weekly snapshots.`,
      cost: `about $${gas.weekly} of gas a week, about $${gas.weekly * weeks} in all`,
      time: `10 minutes a week for ${weeks} weeks`,
    },
    {
      text: `Hold the position for at least ${hold} days without withdrawing below the starting amount, so the balance is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position for the whole period`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s own points or rewards page once a month and follow only the claim link the protocol itself publishes, never a link from a message or a search ad.`,
      cost: 'no fee to check, and never pay a third party to claim',
      time: '10 minutes the first time, then 5 minutes a month',
    },
    {
      text: `Keep a farm log with the wallet, the dates and every transaction hash, and plan the exit before you start: withdraw in one transaction once the campaign ends or the cost passes the reward you expect.`,
      cost: `about $${gas.setup} of gas to unwind at the end`,
      time: '5 minutes a week for the log, 20 minutes at exit',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan regenerated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    tier: row.tier,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.tier === 'early').length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    category_multiples: CATEGORY_MULTIPLES,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
