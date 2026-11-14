// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, filters, a per-protocol detail view with the model's own inputs and the farm plan,
// the method table, and the live comparables the multiples are read from. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  // Deep links, so a view can be opened directly: ?detail=<slug> opens one protocol's detail,
  // ?watch=1 shows the watchlist only, ?category=<name> filters to a category, ?q=<text> searches.
  try {
    var params = new URLSearchParams(window.location.search || '');
    var d = params.get('detail');
    if (d) state.selected = d;
    if (params.get('watch') === '1') state.watch = true;
    var cat = params.get('category');
    if (cat) state.category = cat;
    var q = params.get('q');
    if (q) state.q = q;
  } catch (e) { /* a page without a query string renders the board */ }

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtUsdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
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
  function fmtMult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : n.toFixed(2) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot figures and the multiple
  // board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
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

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age.
  function chainOf(row) { return row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain'; }
  function capitalFor(row) {
    if (row.tvl_usd >= 5000000000) return 250;
    if (row.tvl_usd >= 1000000000) return 150;
    if (row.tvl_usd >= 100000000) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow $20 of a stablecoin against it, keeping both sides open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\u2019s deepest USDC pool on ' + chain + ' and keep the position in range.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('yield') >= 0) return 'Mint $' + capital + ' of ' + name + '\u2019s yield-bearing asset on ' + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return 'Stake $' + capital + ' of the chain\u2019s staking asset through ' + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into ' + name + '\u2019s basis vault on ' + chain + ' and keep the position through one funding cycle.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ' on ' + chain + ', then keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and keep it in the wallet.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0 || c.indexOf('payments') >= 0) return 'Use $' + capital + ' of assets on ' + name + ' (' + chain + ') for one real payment or interaction a week.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + '\u2019s rewards pool on ' + chain + ' and vote on one proposal.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Repay a small part of the borrow and re-borrow it once a month so the position stays active.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $10 through ' + name + ' on ' + chain + ' once a week so the wallet shows trading activity.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Check the vault\u2019s allocation each month and move $25 between its strategies when it rebalances.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('yield') >= 0) return 'Claim the yield each month and re-deposit it into the same ' + name + ' asset on ' + chain + '.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return 'Claim the staking rewards each month and restake them through ' + name + ' on ' + chain + '.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('basis') >= 0) return 'Close and reopen the position once a month so the account shows ongoing activity.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market a month and open the next one on ' + name + ' on ' + chain + '.';
    return 'Use ' + name + ' on ' + chain + ' once a week: one deposit, one swap or one vote, and keep the receipts.';
  }
  function farmSteps(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var gas = capital >= 150 ? 8 : 4;
    var steps = [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [actionFor(row, capital, chain), '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'],
      [secondActionFor(row, capital, chain), 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'],
      ['Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes.', 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes'],
    ];
    return steps.map(function (s) {
      var text = s[0] + ' Cost: ' + s[1] + '. Time: ' + s[2] + '.';
      if (text.length > 600) text = text.slice(0, 596) + '...';
      if (text.length < 20) text = text + ' Hold the position and check the protocol\u2019s own page.';
      return text;
    });
  }

  var watchlist = new Set(DATA.watchlist_slugs || []);
  // The board rows carry no watchlist flag; derive it from the floor list the model states.
  function isWatch(row) { return watchlist.has(row.slug); }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watch && !isWatch(r)) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -999 : a.change_7d; bv = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.rank; bv = b.rank; }
      return (av < bv ? -1 : av > bv ? 1 : 0) * state.dir;
    });
    return rows;
  }

  function renderDetail(row) {
    var growth = row.change_7d === null ? 0 : Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, row.change_7d));
    var growthMult = 1 + (growth / 100) * DATA.model.growth_weight;
    var age = row.age_days === null ? DATA.model.unknown_age_days : row.age_days;
    var maturity = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    var steps = farmSteps(row);
    var cells = [
      ['Implied value', fmtUsdFull(row.implied_value_usd)],
      ['TVL', fmtUsdFull(row.tvl_usd)],
      ['Category multiple', fmtMult(row.multiple)],
      ['7-day growth', fmtPct(row.change_7d) + ' (x' + growthMult.toFixed(2) + ')'],
      ['Running with no token', fmtAge(row.age_days) + ' (x' + maturity.toFixed(2) + ')'],
      ['Chains', (row.chains || []).length > 3 ? (row.chains || []).slice(0, 3).join(', ') + ' + ' + ((row.chains || []).length - 3) + ' more' : ((row.chains || []).join(', ') || 'n/a')],
    ];
    return el('section', { class: 'detail', id: 'detail' },
      el('h2', { text: '#' + row.rank + ' ' + row.name }),
      el('p', { class: 'meta', text: (row.category || 'Uncategorised') + ' · listed ' + (row.listed_at || 'unknown') + (isWatch(row) ? ' · on the house watchlist' : '') + ' · pre-token: the snapshot records no token for it.' }),
      el('div', { class: 'modelgrid' }, cells.map(function (c) {
        return el('div', { class: 'cell' }, el('div', { class: 'v', text: c[1] }), el('div', { class: 'k', text: c[0] }));
      })),
      el('p', { text: 'Implied value = TVL x category multiple x growth x maturity = ' + fmtUsdFull(row.tvl_usd) + ' x ' + row.multiple.toFixed(2) + ' x ' + growthMult.toFixed(2) + ' x ' + maturity.toFixed(2) + ' = ' + fmtUsdFull(impliedOf(row)) + '. The page recomputes it from the same figures board.json carries.' }),
      el('h3', { text: 'How to farm it' }),
      el('ol', { class: 'steps' }, steps.map(function (s) { return el('li', { text: s }); }))
    );
  }

  function renderBoard() {
    var rows = visibleRows();
    var totalTVL = DATA.rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
    var top = DATA.rows[0];
    var cats = {};
    DATA.rows.forEach(function (r) { cats[r.category || 'Uncategorised'] = true; });
    var chains = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chains[c] = true; }); });
    var catNames = Object.keys(cats).sort();
    var chainNames = Object.keys(chains).sort();

    var thead = el('thead', null, el('tr', null,
      el('th', { class: 'num' }, el('button', { text: '#', onclick: function () { setSort('rank'); } })),
      el('th', null, el('button', { text: 'Protocol', onclick: function () { setSort('rank'); } })),
      el('th', { class: 'num' }, el('button', { text: 'Implied value', onclick: function () { setSort('implied'); } })),
      el('th', { class: 'num' }, el('button', { text: 'TVL', onclick: function () { setSort('tvl'); } })),
      el('th', { class: 'num' }, el('button', { text: '7d', onclick: function () { setSort('growth'); } })),
      el('th', { class: 'num' }, el('button', { text: 'No token for', onclick: function () { setSort('age'); } }))
    ));
    var tbody = el('tbody', null, rows.map(function (r) {
      var chg = r.change_7d;
      var chgCell = el('td', { class: 'num ' + (chg === null ? '' : chg >= 0 ? 'up' : 'down'), text: fmtPct(chg) });
      var nameCell = el('td', null,
        el('span', { text: r.name + ' ' }),
        isWatch(r) ? el('span', { class: 'pill watch', text: 'WATCHLIST' }) : null,
        el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).slice(0, 3).join(', ') })
      );
      return el('tr', {
        class: state.selected === r.slug ? 'sel' : '',
        onclick: function () { state.selected = r.slug; render(); var d = document.getElementById('detail'); if (d) d.scrollIntoView({ block: 'nearest' }); },
      },
        el('td', { class: 'num', text: String(r.rank) }),
        nameCell,
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        chgCell,
        el('td', { class: 'num', text: fmtAge(r.age_days) })
      );
    }));
    var table = el('table', { class: 'board' }, thead, tbody);
    var selected = state.selected ? DATA.rows.find(function (r) { return r.slug === state.selected; }) : null;
    var out = el('div', null,
      selected ? renderDetail(selected) : null,
      el('div', { class: 'controls' },
        el('input', { type: 'search', placeholder: 'Search a protocol or category', value: state.q, oninput: function (e) { state.q = e.target.value; render(); } }),
        el('select', { onchange: function (e) { state.category = e.target.value; render(); } },
          el('option', { value: 'all', text: 'All categories' }),
          catNames.map(function (c) { return el('option', { value: c, text: c, selected: state.category === c ? 'selected' : null }); })
        ),
        el('select', { onchange: function (e) { state.chain = e.target.value; render(); } },
          el('option', { value: 'all', text: 'All chains' }),
          chainNames.map(function (c) { return el('option', { value: c, text: c, selected: state.chain === c ? 'selected' : null }); })
        ),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: state.watch ? 'checked' : null, onchange: function (e) { state.watch = e.target.checked; render(); } }), document.createTextNode(' Watchlist only'))
      ),
      el('p', { class: 'count', text: rows.length + ' of ' + DATA.rows.length + ' protocols · TVL on the board ' + fmtUsd(totalTVL) + ' · top row ' + (top ? top.name : 'n/a') + ' at ' + fmtUsd(top ? top.implied_value_usd : 0) }),
      rows.length ? table : el('div', { class: 'empty', text: 'No protocol matches these filters.' })
    );
    return out;
  }

  function renderLive() {
    var rows = DATA.live.map(function (r) {
      return el('tr', null,
        el('td', { text: r.name }),
        el('td', { text: r.category || 'Uncategorised' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: r.mcap_usd === null ? 'n/a' : fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : r.ratio.toFixed(2) + 'x' })
      );
    });
    return el('div', null,
      el('p', { text: 'These launched protocols are the comparables: the category multiples above are the medians of their market-cap / TVL. They are shown apart because the board ranks only protocols whose token does not exist yet.' }),
      el('table', { class: 'small' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
          el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' })
        )),
        el('tbody', null, rows)
      )
    );
  }

  function renderMethod() {
    var rows = DATA.multiples.by_category.map(function (m) {
      return el('tr', null,
        el('td', { text: m.category }),
        el('td', { class: 'num', text: String(m.samples) }),
        el('td', { class: 'num', text: m.multiple.toFixed(2) + 'x' })
      );
    });
    rows.push(el('tr', null,
      el('td', { text: 'All categories (fallback)' }),
      el('td', { class: 'num', text: String(DATA.multiples.global_samples) }),
      el('td', { class: 'num', text: DATA.multiples.global.toFixed(2) + 'x' })
    ));
    return el('div', null,
      el('p', { text: 'Implied value = TVL x category multiple x growth x maturity. The multiple is the median market-cap / TVL of the launched protocols in the same category (at least ' + DATA.model.min_category_samples + ' of them); a category with too few comparables uses the global median of ' + DATA.multiples.global.toFixed(2) + 'x over ' + DATA.multiples.global_samples + ' launched protocols. Growth is the 7-day TVL change, clamped to ' + DATA.model.growth_floor + '% .. +' + DATA.model.growth_cap + '% and weighted ' + DATA.model.growth_weight + '. Maturity runs ' + DATA.model.maturity_floor + ' to ' + (DATA.model.maturity_floor + DATA.model.maturity_range) + ' over ' + DATA.model.maturity_days + ' days with no token. No protocol name is ever special-cased.' }),
      el('table', { class: 'small' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Launched' }), el('th', { class: 'num', text: 'Multiple' })
        )),
        el('tbody', null, rows)
      ),
      el('p', { class: 'note', text: 'Eligibility is the watchlist\u2019s own rule, applied to the whole snapshot: pre-token, not an exchange, not a bridge or liquid-staking product, no version marker, no wrapped / staked / staking word, no exchange prefix. A wrapped product of a token that already trades never ranks, however large its TVL.' })
    );
  }

  function setSort(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
    render();
  }

  function render() {
    app.setAttribute('aria-busy', 'true');
    while (app.firstChild) app.removeChild(app.firstChild);
    var wrap = el('div', { class: 'wrap' },
      el('header', { class: 'hero' },
        el('div', { class: 'kicker', text: 'Token Radar · ' + DATA.model_version }),
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { class: 'lede' },
          el('span', { text: 'A board of ' }),
          el('b', { text: String(DATA.board_size) + ' protocols' }),
          el('span', { text: ' whose token does not exist yet, ranked by what that token would be worth if it launched at the multiple its category\u2019s launched protocols trade at. Every row carries the steps to farm it. Snapshot ' }),
          el('b', { text: DATA.as_of }),
          el('span', { text: ', ' + DATA.watchlist_size + ' protocols on the house watchlist, ' + DATA.early_size + ' more found below its floor.' })
        ),
        el('div', { class: 'stats' },
          el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.board_size) }), el('div', { class: 'k', text: 'ranked protocols' })),
          el('div', { class: 'stat' }, el('div', { class: 'v', text: fmtUsd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0) }), el('div', { class: 'k', text: 'top implied value' })),
          el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.watchlist_size) }), el('div', { class: 'k', text: 'watchlist covered' })),
          el('div', { class: 'stat' }, el('div', { class: 'v', text: DATA.multiples.global.toFixed(2) + 'x' }), el('div', { class: 'k', text: 'global multiple' }))
        )
      ),
      el('div', { class: 'tabs' },
        el('button', { 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; render(); } }),
        el('button', { 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live comparables', onclick: function () { state.tab = 'live'; render(); } })
      ),
      state.tab === 'pre-token' ? renderBoard() : renderLive(),
      el('section', { class: 'method' }, el('h2', { text: 'How the value is worked out' }), renderMethod()),
      el('footer', { class: 'foot', text: 'Source: ' + DATA.source + '. Implied values are this radar\u2019s own claim from the snapshot\u2019s figures, never a prediction of whether or when a token is issued. Farming carries smart-contract risk: read the protocol\u2019s own pages before you deposit.' })
    );
    app.appendChild(wrap);
    app.setAttribute('aria-busy', 'false');
  }

  render();
})();
