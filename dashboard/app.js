// Token Radar radar-2 dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, search + category + chain + tier filters, sortable columns, a live-token
// view set apart from the ranking, and a per-protocol detail drawer whose model breakdown and farm
// plan are recomputed here from the same snapshot figures main.ts scored, so page and board agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tier: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function catMult(category) {
    var m = DATA.category_multiples;
    if (category && Object.prototype.hasOwnProperty.call(m, category)) return m[category];
    return DATA.model.default_multiple;
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var reach = 1 + Math.min(Math.max((row.chains ? row.chains.length : 1) - 1, 0), model.reach_max_extra_chains) * model.reach_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * catMult(row.category) * growthMult * maturity * reach));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, first chain, TVL
  // and age decide the actions, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasTier(chain) {
    if (chain === 'Ethereum' || chain === 'Bitcoin') return { setup: 18, weekly: 6, label: 'mainnet fees' };
    if (chain === 'Binance' || chain === 'Avalanche' || chain === 'Polygon' || chain === 'Gnosis') return { setup: 4, weekly: 1, label: 'mid-range fees' };
    return { setup: 1, weekly: 1, label: 'low fees' };
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 25e7) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    if (p.tvl_usd >= 25e6) return 75;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 42;
    if (age < 180) return 56;
    if (age < 365) return 42;
    if (age < 730) return 35;
    return 28;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the supply position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 'Provide $' + capital + " of liquidity, half USDC and half the paired asset, to " + name + "'s most-used pool on " + chain + '.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then deposit the bridged funds in one app on the destination chain.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the staking receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perps') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade, long and short the same size.';
    if (c.indexOf('prediction') >= 0) return 'Fund the wallet with $' + capital + ' and take one position in ' + name + "'s most liquid market.";
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('aggregator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into the highest-TVL ' + name + ' vault on ' + chain + ' and keep the vault shares in the wallet.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + "'s yield asset on " + chain + ' and hold it without moving it to another wallet.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' for the longest term offered and keep the policy.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC onto ' + name + ' and make one deposit in a native app so the wallet has history on the chain.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var part = Math.max(20, Math.round(capital / 4));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'After 7 days, borrow $' + part + ' against the supply on ' + name + ', hold it for 7 days, then repay in full so both sides of the market are on record.';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 'Make two swaps of about $' + part + " each in " + name + "'s main pool on " + chain + ', a week apart, so the wallet shows trading as well as liquidity.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + part + ' back through ' + name + ' once, so the wallet has a round trip, then bridge it in again and keep it on ' + chain + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Move $' + part + ' of the staking receipt into one vault or pool that ' + name + ' itself lists, so the position earns in two places.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perps') >= 0) return 'Close the hedge after 7 days and open one new small trade on ' + name + ', so the wallet has more than one settled position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('aggregator') >= 0 || c.indexOf('risk') >= 0) return 'Move $' + part + ' into a second ' + name + ' vault on ' + chain + ' after 2 weeks, so the wallet holds two vault positions, not one.';
    return 'Use a second feature of ' + name + ' on ' + chain + ' with about $' + part + ', such as a vote, a claim check or a smaller second deposit.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var weeks = Math.max(4, Math.round(hold / 7));
    var gas = gasTier(chain);
    return [
      { text: 'Set up a fresh wallet for ' + p.name + ' only, fund it from your main wallet, and store the seed phrase offline on paper.', cost: 'one funding transfer, about $' + gas.setup + ' of network fees (' + gas.label + ' on ' + chain + ')', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital plus about $' + gas.setup + ' of gas', time: '15 minutes to set up' },
      { text: secondFor(p, capital, chain), cost: 'about $' + gas.weekly + ' of gas, the capital is already in the position', time: '15 minutes, in the second week' },
      { text: 'Repeat one qualifying action on ' + p.name + ' every week for ' + weeks + ' weeks, on roughly the same weekday, so the activity spans ' + weeks + ' weekly snapshots.', cost: 'about $' + gas.weekly + ' of gas a week, about $' + gas.weekly * weeks + ' in all', time: '10 minutes a week for ' + weeks + ' weeks' },
      { text: 'Hold the position for at least ' + hold + ' days without withdrawing below the starting amount, so the balance is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position for the whole period', time: hold + ' days' },
      { text: "Check " + p.name + "'s own points or rewards page once a month and follow only the claim link the protocol itself publishes, never a link from a message or a search ad.", cost: 'no fee to check, and never pay a third party to claim', time: '10 minutes the first time, then 5 minutes a month' },
      { text: 'Keep a farm log with the wallet, the dates and every transaction hash, and plan the exit before you start: withdraw in one transaction once the campaign ends or the cost passes the reward you expect.', cost: 'about $' + gas.setup + ' of gas to unwind at the end', time: '5 minutes a week for the log, 20 minutes at exit' }
    ].map(stepText);
  }
  function farmFees(p) {
    var gas = gasTier(chainOf(p));
    var weeks = Math.max(4, Math.round(holdDaysFor(p.age_days) / 7));
    return 3 * gas.setup + gas.weekly * (weeks + 1);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tier')) state.tier = params.get('tier');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tier !== 'all') params.set('tier', state.tier);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'ratio') { av = a.implied_value_usd / a.tvl_usd; bv = b.implied_value_usd / b.tvl_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function band() {
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    var top = DATA.rows[0];
    return el('div', { class: 'band' }, el('div', { class: 'band-in' },
      el('div', { class: 'brandrow' },
        el('div', { class: 'brand' }, el('span', { class: 'pulse' }), 'Token Radar'),
        el('div', { class: 'band-meta' },
          el('span', { text: 'Snapshot ' + DATA.as_of }),
          el('span', { text: 'DefiLlama protocol index, sealed' }),
          el('span', { text: 'Model ' + DATA.model_version })
        )
      ),
      el('h1', { text: 'Every pre-token protocol, ranked by what its launch would be worth' }),
      el('p', { class: 'lede', text: 'The watchlist is the floor, not the ceiling: this board covers all ' + DATA.watchlist_size + ' watchlist protocols and every other protocol below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor that records no token. Each records no token on DefiLlama; that is a record, not a promise that none exists. Implied value is this model\u2019s claim, not a price and not a forecast of a launch.' }),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'watchlist protocols covered' })),
        el('div', { class: 'kpi' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'pre-token rows ranked (' + DATA.early_size + ' early)' })),
        el('div', { class: 'kpi' }, el('b', { text: fmtUsd(total) }), el('span', { text: 'combined implied value of the board' })),
        el('div', { class: 'kpi' }, el('b', { text: top ? top.name : 'n/a' }), el('span', { text: 'rank 1 at ' + (top ? fmtUsd(top.implied_value_usd) : 'n/a') + ' implied' }))
      )
    ));
  }

  function chip(label, pressed, fn) {
    return el('button', { type: 'button', 'aria-pressed': pressed ? 'true' : 'false', text: label, onclick: fn });
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, values, current, fn) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: label === 'Category' ? 'All categories' : 'All chains' }),
        values.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { fn(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', categories, state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', chains, state.chain, function (v) { state.chain = v; }),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Radar tier' }),
        el('div', { class: 'chips' },
          chip('All rows', state.tier === 'all', function () { state.tier = 'all'; writeHash(); render(); }),
          chip('Watchlist', state.tier === 'watchlist', function () { state.tier = 'watchlist'; writeHash(); render(); }),
          chip('Early', state.tier === 'early', function () { state.tier = 'early'; writeHash(); render(); })
        )),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Token status' }),
        el('div', { class: 'chips' },
          chip('Pre-token', state.tab === 'pre-token', function () { state.tab = 'pre-token'; render(); }),
          chip('Live token', state.tab === 'live', function () { state.tab = 'live'; render(); })
        )),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols, set aside' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null)
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches those filters' }),
        el('p', { text: 'Clear the search or widen the category, chain or tier filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear all filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badge = r.tier === 'watchlist'
        ? el('span', { class: 'badge watch', text: 'WATCHLIST' })
        : el('span', { class: 'badge early', text: 'EARLY' });
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), el('span', { class: 'badges' }, badge)),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'ratio', text: (r.implied_value_usd / r.tvl_usd).toFixed(2) + '\u00d7 TVL' })
        )),
        el('td', null, el('span', { class: 'status', text: 'records no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols ranked by implied value under model ' + DATA.model_version + '. Select any row for its model breakdown and farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
          sortHeader('growth', '7d change'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'),
          el('th', { scope: 'col', text: 'Token' })
        )),
        tbody
      )
    ));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'rank', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Set aside, not ranked: these protocols already have a trading token, so their market cap is a market fact, not a model output. The radar never mixes the two.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d change' }),
          el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' })
        )),
        tbody
      )
    ));
  }

  function modelPanel() {
    var m = DATA.model;
    var entries = Object.keys(DATA.category_multiples).sort(function (a, b) { return DATA.category_multiples[b] - DATA.category_multiples[a]; });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row from the snapshot\u2019s own figures: TVL, category, seven-day growth, age with no token on record, and chain count. No protocol name is special-cased and no row is hand-picked; change a figure and the rank moves.' }),
      el('div', { class: 'formula', text: 'implied = round( tvl_usd \u00d7 category_multiple \u00d7 (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 \u00d7 ' + m.growth_weight + ') \u00d7 (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' \u00d7 ' + m.maturity_range + ') \u00d7 (1 + min(chains \u2212 1, ' + m.reach_max_extra_chains + ') \u00d7 ' + m.reach_per_chain + ') )' }),
      el('h3', { text: 'Category multiples (value captured per TVL dollar)' }),
      el('div', { class: 'mult-table' }, entries.map(function (k) {
        return el('div', null, el('span', { text: k }), el('b', { class: 'num', text: DATA.category_multiples[k].toFixed(2) }));
      }).concat([el('div', null, el('span', { text: 'Any other category' }), el('b', { class: 'num', text: m.default_multiple.toFixed(2) }))])),
      el('p', { class: 'sub', text: 'Bridge and staking products score least per TVL dollar because most of their TVL is another token\u2019s value passing through. An unknown age counts as ' + m.unknown_age_days + ' days. The detail view of every row shows its four multipliers and recomputes its implied value live.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function multRow(label, value, note, pct) {
    return [
      el('div', null,
        el('span', { text: label }),
        el('span', null, el('b', { class: 'num', text: value }), note ? el('span', { class: 'sub', text: ' ' + note }) : null)
      ),
      el('div', { class: 'mbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + pct + '%' }))
    ];
  }
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var capital = capitalFor(row);
    var fees = farmFees(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' \u00b7 ' + (row.tier === 'watchlist' ? 'Watchlist' : 'Early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' \u00b7 records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value: ' + fmtUsd(row.implied_value_usd) }),
      el('div', { class: 'eq' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        multRow('Category multiple', '\u00d7 ' + row.category_multiple.toFixed(2), row.category || 'Other', Math.round((row.category_multiple / 0.34) * 100)),
        multRow('Growth multiplier (7d ' + fmtPct(row.change_7d) + ')', '\u00d7 ' + row.growth_multiplier.toFixed(2), null, Math.round(((row.growth_multiplier - 0.7) / 0.9) * 100)),
        multRow('Maturity multiplier (' + fmtAge(row.age_days) + ' with no token)', '\u00d7 ' + row.maturity_multiplier.toFixed(2), null, Math.round(((row.maturity_multiplier - 0.62) / 0.38) * 100)),
        multRow('Reach multiplier (' + (row.chains ? row.chains.length : 0) + ' chains)', '\u00d7 ' + row.reach_multiplier.toFixed(2), null, Math.round(((row.reach_multiplier - 1) / 0.18) * 100))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ' recomputed on this page gives ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate of what a launch would be worth if the record stayed as it is, not a price and not a prediction that a token will be issued.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('div', { class: 'total' }, el('span', { text: 'Cash the plan needs' }), el('b', { text: '$' + capital + ' capital + about $' + fees + ' of fees' })),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'warn', text: 'Farming is not free money: the capital is at protocol risk for the whole hold, fees are spent whether or not a token ever launches, and a protocol that records no token may never issue one.' })
    ));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    app.textContent = '';
    app.appendChild(band());
    var shell = el('div', { class: 'shell' });
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(el('p', { class: 'foot', text: 'Source: the sealed DefiLlama snapshot of ' + DATA.as_of + '. A protocol here records no token in that snapshot; DefiLlama\u2019s record is not proof that none exists. Wrapped, staked and bridged products of a token that already trades are discounted by the category multiple rather than ranked as fresh launches.' }));
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  // Deep links are live: editing the hash (a shared #p= link, a filter bookmark) re-reads it and
  // re-renders, instead of leaving the previous view on screen. writeHash uses replaceState, which
  // does not fire hashchange, so the page's own updates never loop back into this listener.
  window.addEventListener('hashchange', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.selected = null;
    readHash();
    if (!state.selected && dialog.open) dialog.close();
    render();
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
