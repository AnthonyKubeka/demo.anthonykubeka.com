/* Normandy demo. Vanilla JS, no dependencies.
   Reads data/snapshot.json (exported on the server) and data/research.json (curated).
   Every string from the data files goes in through textContent, never innerHTML. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function get(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }

  function num(v) {
    return typeof v === 'number' ? v.toLocaleString('en-US') : v;
  }

  function rel(iso) {
    if (!iso) return 'unknown';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(s)) return 'unknown';
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 36 * 3600) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }

  function monthYear(isoDate) {
    var d = new Date(isoDate);
    return isNaN(d) ? isoDate : d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── generic bindings ───────────────────────────────── */
  function bind(snap) {
    $$('[data-bind]').forEach(function (n) {
      var v = get(snap, n.getAttribute('data-bind'));
      if (v != null) n.textContent = num(v);
    });
    $$('[data-rel]').forEach(function (n) {
      n.textContent = rel(get(snap, n.getAttribute('data-rel')));
    });
    $$('[data-month]').forEach(function (n) {
      var v = get(snap, n.getAttribute('data-month'));
      if (v) n.textContent = monthYear(v);
    });
    $$('[data-rel-timer]').forEach(function (n) {
      var label = n.getAttribute('data-rel-timer');
      var t = ((snap.timers || {}).shown || []).filter(function (x) { return x.label === label; })[0];
      n.textContent = rel(t && t.last_run);
    });
  }

  function hardware(snap) {
    var h = snap.host;
    var box = $('#hardware');
    if (!h || !box) return;
    [h.cpu, h.threads + ' threads', h.ram_gb + ' GB RAM', h.gpu, h.disk_tb + ' TB of disk', h.os, 'up ' + h.uptime_days + ' days']
      .filter(Boolean)
      .forEach(function (part) { box.appendChild(el('span', { text: part })); });
  }

  /* ── 01 pipeline ────────────────────────────────────── */
  // 26 bars: commits per week in the infra repo. Counts only.
  function activity(snap) {
    var box = $('#activity');
    var weeks = (snap.repo || {}).weekly;
    if (!box || !weeks || !weeks.length) { if (box) box.hidden = true; var cap = $('.activity__cap'); if (cap) cap.hidden = true; return; }
    var max = Math.max.apply(null, weeks) || 1;
    var total = weeks.reduce(function (a, b) { return a + b; }, 0);
    box.textContent = '';
    weeks.forEach(function (n, i) {
      var bar = el('span', { 'class': 'activity__bar' + (i === weeks.length - 1 ? ' is-now' : '') });
      bar.style.height = Math.max(n ? 6 : 2, Math.round(n / max * 100)) + '%';
      bar.title = n + (n === 1 ? ' commit' : ' commits');
      box.appendChild(bar);
    });
    box.setAttribute('aria-label', total.toLocaleString('en-US') + ' commits in the last ' + weeks.length + ' weeks. The busiest week had ' + max + '.');
  }

  function pipeline(snap) {
    var stacks = (snap.stacks || {}).shown || [];
    var select = $('#pipeline-stack');
    var button = $('#pipeline-run');
    var log = $('#pipeline-log');
    var steps = $$('#pipeline-steps li');
    if (!select || !stacks.length) return;

    stacks.forEach(function (s) { select.appendChild(el('option', { value: s.id, text: s.id })); });
    select.value = stacks.some(function (s) { return s.id === 'core'; }) ? 'core' : stacks[0].id;

    function line(parts) {
      var row = el('span');
      parts.forEach(function (p) {
        row.appendChild(typeof p === 'string' ? document.createTextNode(p) : el('span', { class: p[0], text: p[1] }));
      });
      row.appendChild(document.createTextNode('\n'));
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }

    function mark(i) {
      steps.forEach(function (s, n) {
        s.classList.toggle('is-done', n < i);
        s.classList.toggle('is-active', n === i);
      });
    }

    var running = false;
    async function run() {
      if (running) return;
      running = true;
      button.disabled = true;
      var stack = stacks.filter(function (s) { return s.id === select.value; })[0];
      var sha = Math.random().toString(16).slice(2, 9);
      var secs = 18 + Math.floor(Math.random() * 40);
      var pace = reduced ? 0 : 1;
      log.textContent = '';

      mark(0);
      line(['$ git push origin main']);
      await sleep(520 * pace);
      line([['dim', '  ' + sha + '  '], stack.id + ': change config']);
      await sleep(420 * pace);

      mark(1);
      line([['hot', '→ forgejo  '], 'workflow deploy-' + stack.id + ' queued']);
      await sleep(640 * pace);

      mark(2);
      line([['hot', '→ runner   '], 'checkout ' + sha]);
      await sleep(420 * pace);
      line([['dim', '           '], 'changed paths → stack: ' + stack.id]);
      await sleep(520 * pace);

      mark(3);
      line([['hot', '→ deploy   '], 'deploy-stack.sh ' + stack.id]);
      await sleep(460 * pace);
      line([['dim', '           '], 'compose config ', ['ok', 'ok']]);
      for (var i = 0; i < stack.services.length; i++) {
        await sleep(190 * pace);
        line([['dim', '           '], stack.services[i].name + ' ', ['ok', 'up']]);
      }
      if (stack.unlisted) {
        await sleep(190 * pace);
        line([['dim', '           + ' + stack.unlisted + ' more ' ], ['ok', 'up']]);
      }
      await sleep(520 * pace);

      mark(4);
      line([['hot', '→ health   '], stack.total + '/' + stack.total + ' containers ', ['ok', 'healthy']]);
      await sleep(560 * pace);

      mark(5);
      line([['hot', '→ notify   '], 'push to my phone: "' + stack.id + ' deployed in ' + secs + 's"']);
      await sleep(420 * pace);

      mark(6);
      line([['ok', '✓ shipped. '], ['dim', 'Nobody logged in to the server.']]);
      running = false;
      button.disabled = false;
      button.textContent = 'Ship another';
    }

    button.addEventListener('click', run);
  }

  /* ── 02 stacks ──────────────────────────────────────── */
  function stackGrid(snap) {
    var data = snap.stacks;
    var grid = $('#stack-grid');
    if (!data || !grid) return;
    data.shown.forEach(function (s) {
      var chips = el('div', { class: 'chips' });
      s.services.forEach(function (svc) {
        chips.appendChild(el('span', { class: 'chip', tabindex: '0', 'data-tip': svc.what, text: svc.name }));
      });
      if (s.unlisted) chips.appendChild(el('span', { class: 'chip chip--more', text: '+' + s.unlisted + ' more' }));
      grid.appendChild(el('article', { class: 'card stack reveal' }, [
        el('div', { class: 'stack__head' }, [
          el('h3', { text: s.label }),
          el('span', { class: 'stack__count', text: s.total + (s.total === 1 ? ' service' : ' services') })
        ]),
        el('p', { class: 'stack__role', text: s.role }),
        chips
      ]));
    });
    var note = $('#stack-private');
    if (note) {
      note.textContent = data.private_stacks
        ? data.private_stacks + ' more stacks are private. The export counts them and leaves the names out. Hover or tap a service to see what it does.'
        : 'Hover or tap a service to see what it does.';
    }
  }

  /* ── 03 watch ───────────────────────────────────────── */
  function setStatus(node, ok, text) {
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('is-ok', ok === true);
    node.classList.toggle('is-bad', ok === false);
  }

  function watch(snap) {
    var o = snap.observability;
    if (o) {
      setStatus($('#alert-status'), o.alerts_firing === 0,
        o.alerts_firing === 0 ? 'Nothing firing right now' : o.alerts_firing + ' firing right now');
    }
    var shown = (snap.timers || {}).shown || [];
    var nw = shown.filter(function (t) { return /Night Watch/.test(t.label); })[0];
    if (nw && nw.last_run) setStatus($('#nightwatch-status'), nw.ok, 'Last sweep ' + rel(nw.last_run) + (nw.ok ? ', clean exit' : ', failed'));
    var b = snap.backup;
    if (b && b.last_run) {
      setStatus($('#backup-status'), b.ok,
        'Last snapshot ' + rel(b.last_run) + (b.last_restore_test ? '. Last restore test ' + rel(b.last_restore_test) : ''));
    }
    day(shown);
  }

  function day(shown) {
    var track = $('#day-track');
    var list = $('#day-list');
    if (!track || !list || !shown.length) return;

    [0, 6, 12, 18, 24].forEach(function (h) {
      track.appendChild(el('span', { class: 'day__hour', style: 'left:' + (h / 24 * 100) + '%', text: (h < 10 ? '0' : '') + h + ':00' }));
    });

    var rows = [];
    shown.forEach(function (t, i) {
      var state = el('span', { class: 'state' + (t.ok ? ' is-ok' : ''), text: t.last_run ? (t.ok ? '✓ ' : '') + rel(t.last_run) : '' });
      var row = el('li', { 'data-at': t.at || '' }, [
        el('span', { class: 'when', text: t.at || 'every ' + t.every }),
        el('span', { text: t.label }),
        state
      ]);
      rows.push(row);
      list.appendChild(row);
    });

    function light(at, on) {
      rows.forEach(function (r) { r.classList.toggle('is-on', on && r.getAttribute('data-at') === at); });
      $$('.day__pin', track).forEach(function (p) { p.classList.toggle('is-on', on && p.getAttribute('data-at') === at); });
    }

    var seen = {};
    shown.forEach(function (t) {
      var m = /^(\d\d):(\d\d)$/.exec(t.at || '');
      if (!m || seen[t.at]) return;
      seen[t.at] = true;
      var pos = (parseInt(m[1], 10) + parseInt(m[2], 10) / 60) / 24 * 100;
      var labels = shown.filter(function (x) { return x.at === t.at; }).map(function (x) { return x.label; }).join('; ');
      var pin = el('button', {
        class: 'day__pin', type: 'button', 'data-at': t.at,
        style: 'left:' + pos + '%;height:' + (26 + (Object.keys(seen).length % 3) * 9) + 'px',
        'aria-label': t.at + ' UTC: ' + labels
      });
      ['mouseenter', 'focus'].forEach(function (ev) { pin.addEventListener(ev, function () { light(t.at, true); }); });
      ['mouseleave', 'blur'].forEach(function (ev) { pin.addEventListener(ev, function () { light(t.at, false); }); });
      pin.addEventListener('click', function () { light(t.at, true); });
      track.appendChild(pin);
    });
    rows.forEach(function (r) {
      var at = r.getAttribute('data-at');
      if (!seen[at]) return;
      r.addEventListener('mouseenter', function () { light(at, true); });
      r.addEventListener('mouseleave', function () { light(at, false); });
    });

    var now = new Date();
    var nowPos = (now.getUTCHours() + now.getUTCMinutes() / 60) / 24 * 100;
    track.appendChild(el('span', { class: 'day__now', style: 'left:' + nowPos + '%' }));
  }

  /* ── 04 crew ────────────────────────────────────────── */
  var PATH = [
    ['Phone', 'A text or a voice note. The bot reads a voice note back to me before anything runs.'],
    ['Bot', 'Submits a task with an ID. A repeated message returns the same task instead of a second one.'],
    ['Guard', 'Checks the request against the ask-first list. A match becomes a "Run it / Don\'t run" question, and no work starts.'],
    ['Runner', 'Picks the account and builds the workspace: a copy of the notes vault, a git worktree, or a scratch directory.'],
    ['Agent', 'Works in a thread I can open and watch from my phone. Its questions arrive with buttons.'],
    ['Checker', 'When I give acceptance criteria, a second agent compares them with the change. A fail goes back as a fix turn.'],
    ['Merge', 'Notes merge through an integrator. Code gets rebased, checked, pushed and deployed by the runner. Each job has its own copy, so 2 jobs can\'t overwrite each other.'],
    ['Result', 'Evidence and a link to the thread, on Telegram. One tap reverts a code change.']
  ];

  function requestPath() {
    var nodes = $('#path-nodes');
    var detail = $('#path-detail');
    if (!nodes || !detail) return;
    var items = PATH.map(function (step, i) {
      var button = el('button', { type: 'button', 'aria-label': 'Step ' + (i + 1) + ': ' + step[0] }, [
        el('span', { class: 'n', text: String(i + 1) }),
        el('span', { text: step[0] })
      ]);
      var li = el('li', {}, [button]);
      button.addEventListener('click', function () { stop(); show(i); });
      nodes.appendChild(li);
      return li;
    });

    var current = 0;
    function show(i) {
      current = i;
      items.forEach(function (li, n) {
        li.classList.toggle('is-past', n < i);
        li.classList.toggle('is-on', n === i);
      });
      detail.textContent = '';
      detail.appendChild(el('b', { text: PATH[i][0] }));
      detail.appendChild(document.createTextNode(PATH[i][1]));
    }

    var timer = null;
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      if (timer || reduced) return;
      timer = setInterval(function () { show((current + 1) % PATH.length); }, 3400);
    }
    show(0);

    // auto-advance only while the diagram is on screen, and stop for good once the visitor takes over
    if ('IntersectionObserver' in window) {
      var userTookOver = false;
      nodes.addEventListener('click', function () { userTookOver = true; });
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !userTookOver) start(); else stop();
      }, { threshold: 0.4 }).observe(nodes);
    }
  }

  function taskScore(snap) {
    var t = snap.tasks;
    var box = $('#task-score');
    if (!t || !box || !t.total) return;
    var parts = [['s-ok', t.succeeded, 'succeeded', 'var(--ok)'], ['s-bad', t.failed, 'failed', 'var(--accent)'], ['s-cancel', t.cancelled, 'cancelled', 'var(--line-2)']];
    var bar = el('div', { class: 'score', role: 'img', 'aria-label': t.succeeded + ' succeeded, ' + t.failed + ' failed, ' + t.cancelled + ' cancelled' });
    var legend = el('div', { class: 'score-legend' });
    parts.forEach(function (p) {
      bar.appendChild(el('span', { class: p[0], style: 'width:' + (p[1] / t.total * 100) + '%' }));
      legend.appendChild(el('span', {}, [el('i', { style: 'background:' + p[3] }), p[1] + ' ' + p[2]]));
    });
    box.replaceWith(bar);
    bar.insertAdjacentElement('afterend', legend);
  }

  /* ── 05 harness ─────────────────────────────────────── */
  function harness(snap) {
    var h = snap.harness;
    if (!h) return;
    var tree = $('#surface-tree');
    if (tree) {
      var width = Math.max.apply(null, h.surfaces.map(function (s) { return s.path.length; }).concat([20]));
      var pad = function (s) { return s + new Array(width - s.length + 3).join(' '); };
      tree.appendChild(el('span', { class: 'real', text: pad('~/.harness/AGENTS.md') }));
      tree.appendChild(el('span', { class: 'dim', text: '← the real file, in git\n' }));
      h.surfaces.forEach(function (s) {
        tree.appendChild(document.createTextNode(pad(s.path)));
        tree.appendChild(el('span', { class: s.linked ? 'ok' : 'hot', text: s.linked ? '→ symlink ✓' : '→ NOT LINKED' }));
        tree.appendChild(el('span', { class: 'dim', text: '  ' + s.reader + '\n' }));
      });
      tree.appendChild(el('span', { class: 'dim', text: '\nchecked ' + rel(snap.generated_at) + ' · ' + h.commits + ' commits since ' + monthYear(h.since) }));
    }
    var groups = $('#skill-groups');
    if (groups) {
      h.skill_groups.forEach(function (g) {
        var chips = el('div', { class: 'chips' });
        g.skills.forEach(function (s) { chips.appendChild(el('span', { class: 'chip', text: s })); });
        groups.appendChild(el('div', { class: 'skill-group' }, [el('h4', { text: g.label }), chips]));
      });
      if (h.skills_other) {
        groups.appendChild(el('div', { class: 'skill-group' }, [
          el('h4', { text: 'Engineering' }),
          el('div', { class: 'chips' }, [el('span', { class: 'chip chip--more', text: '+' + h.skills_other + ' more: TDD, code review, diagnosis, design, mostly vendored' })])
        ]));
      }
    }
  }

  /* ── 07 research ────────────────────────────────────── */
  function research(data) {
    var grid = $('#research-grid');
    if (!grid || !data) return;
    data.notes.forEach(function (n) {
      grid.appendChild(el('article', { class: 'card note reveal' }, [
        el('div', { class: 'note__head' }, [
          el('span', { class: 'note__id', text: n.id }),
          el('span', { class: 'badge badge--' + n.tone, text: n.verdict })
        ]),
        el('p', { class: 'note__q', text: n.asked }),
        el('p', { class: 'note__a', text: n.answer }),
        el('p', { class: 'note__meta', text: n.sources + ' sources cited' })
      ]));
    });
  }

  /* ── 09 terminal ────────────────────────────────────── */
  function terminal(snap) {
    var out = $('#term-out');
    var form = $('#term-form');
    var input = $('#term-input');
    var keys = $('#term-keys');
    if (!out || !form) return;

    function print(text, cls) {
      out.appendChild(el('div', { class: cls || '', text: text }));
      out.scrollTop = out.scrollHeight;
    }
    function table(rows) {
      var w = Math.max.apply(null, rows.map(function (r) { return r[0].length; }));
      rows.forEach(function (r) {
        var row = el('div');
        row.appendChild(el('span', { class: 'hd', text: r[0] + new Array(w - r[0].length + 3).join(' ') }));
        row.appendChild(document.createTextNode(r[1]));
        out.appendChild(row);
      });
      out.scrollTop = out.scrollHeight;
    }

    var stacks = (snap.stacks || {}).shown || [];
    var h = snap.host || {};

    var commands = {
      help: function () {
        table([
          ['host', 'what the box is'],
          ['stacks', 'the compose stacks'],
          ['services <stack>', 'what runs in a stack'],
          ['timers', 'scheduled jobs'],
          ['skills', 'what the agents know how to do'],
          ['tasks', 'the agent task score'],
          ['backup', 'last snapshot and restore test'],
          ['deploy <stack>', 'ship a change (pretend)'],
          ['whoami', 'who you are here'],
          ['clear', 'clear the screen']
        ]);
      },
      host: function () {
        table([
          ['name', (h.name || 'Normandy')],
          ['os', h.os || '?'],
          ['cpu', (h.cpu || '?') + ' (' + h.threads + ' threads)'],
          ['memory', h.ram_gb + ' GB'],
          ['gpu', h.gpu || 'none'],
          ['disk', h.disk_tb + ' TB'],
          ['uptime', h.uptime_days + ' days'],
          ['containers', String((snap.containers || {}).running)]
        ]);
      },
      uptime: function () { print('up ' + h.uptime_days + ' days, ' + ((snap.containers || {}).running) + ' containers running'); },
      stacks: function () {
        table(stacks.map(function (s) { return [s.id, s.total + ' services · ' + s.role]; }));
        if (snap.stacks && snap.stacks.private_stacks) print('+ ' + snap.stacks.private_stacks + ' private stacks', 'dim');
      },
      services: function (arg) {
        var s = stacks.filter(function (x) { return x.id === arg; })[0];
        if (!s) return print('usage: services <' + stacks.map(function (x) { return x.id; }).join('|') + '>', 'dim');
        table(s.services.map(function (svc) { return [svc.name, svc.what]; }));
        if (s.unlisted) print('+ ' + s.unlisted + ' not listed', 'dim');
      },
      timers: function () {
        var t = snap.timers || { shown: [] };
        table(t.shown.map(function (x) { return [x.at || 'every ' + x.every, x.label + (x.last_run ? '  (' + rel(x.last_run) + ')' : '')]; }));
        print(t.total + ' timers in git, times in UTC', 'dim');
      },
      skills: function () {
        var hs = snap.harness;
        if (!hs) return print('no data', 'dim');
        table(hs.skill_groups.map(function (g) { return [g.label, g.skills.join(' ')]; }));
        print(hs.skills_total + ' skills in total', 'dim');
      },
      tasks: function () {
        var t = snap.tasks;
        if (!t) return print('no data', 'dim');
        table([['succeeded', String(t.succeeded)], ['failed', String(t.failed)], ['cancelled', String(t.cancelled)]]);
      },
      backup: function () {
        var b = snap.backup;
        if (!b) return print('no data', 'dim');
        table([['last snapshot', rel(b.last_run) + (b.ok ? '  ok' : '')], ['last restore test', rel(b.last_restore_test)]]);
      },
      deploy: function (arg) {
        var s = stacks.filter(function (x) { return x.id === arg; })[0];
        if (!s) return print('usage: deploy <' + stacks.map(function (x) { return x.id; }).join('|') + '>', 'dim');
        var select = $('#pipeline-stack');
        var button = $('#pipeline-run');
        if (select && button && !button.disabled) {
          select.value = s.id;
          print('queued deploy-' + s.id + '. Watch it in section 01.', 'ok');
          document.getElementById('ship').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
          setTimeout(function () { button.click(); }, reduced ? 0 : 700);
        } else {
          print('a deploy is already running', 'dim');
        }
      },
      whoami: function () { print('guest. Read-only. The crew has full access, and a log line for everything it does.'); },
      ls: function () { print('AGENTS.md  runbooks/  skills/  stacks/  timers/'); },
      cat: function (arg) {
        if (arg === 'AGENTS.md') print('Standing operating notes for every agent on this machine.\nThere is exactly 1 copy of this file. Every agent\'s path is a symlink to it.');
        else print('cat: ' + (arg || '') + ': try AGENTS.md', 'dim');
      },
      date: function () { print(new Date().toUTCString()); },
      sudo: function () { print('guest is not in the sudoers file. Night Watch will hear about this at 05:30.', 'hot'); },
      rm: function () { print('Deleting data is on the ask-first list. I asked. The answer was no.', 'hot'); },
      exit: function () { print('There is no exit. There is only the next section.', 'dim'); },
      clear: function () { out.textContent = ''; }
    };

    var history = [];
    var cursor = 0;
    function run(raw) {
      var text = raw.trim();
      if (!text) return;
      history.push(text);
      cursor = history.length;
      print(text, 'cmd');
      var parts = text.split(/\s+/);
      var fn = commands[parts[0].toLowerCase()];
      if (fn) fn(parts[1]);
      else print(parts[0] + ': command not found. Try help.', 'dim');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      run(input.value);
      input.value = '';
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' && cursor > 0) { cursor--; input.value = history[cursor]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { cursor = Math.min(history.length, cursor + 1); input.value = history[cursor] || ''; e.preventDefault(); }
    });
    $('#term').addEventListener('click', function (e) {
      if (e.target.tagName !== 'BUTTON' && !window.getSelection().toString()) input.focus({ preventScroll: true });
    });

    ['help', 'host', 'stacks', 'services core', 'timers', 'skills', 'deploy core'].forEach(function (c) {
      var b = el('button', { type: 'button', text: c });
      b.addEventListener('click', function () { run(c); });
      keys.appendChild(b);
    });

    print('Normandy, snapshot from ' + rel(snap.generated_at) + '. Type help, or tap a shortcut below.', 'dim');
  }

  /* ── page chrome ────────────────────────────────────── */
  function chrome() {
    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    $$('.section__head, .panel, .card, .rules li, .prose').forEach(function (n) { n.classList.add('reveal'); });
    if (!('IntersectionObserver' in window) || reduced) {
      $$('.reveal').forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (n) { io.observe(n); });

    var links = $$('.top__nav a');
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach(function (s) { spy.observe(s); });
  }

  /* ── boot ───────────────────────────────────────────── */
  function json(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }

  Promise.all([json('data/snapshot.json'), json('data/research.json').catch(function () { return null; })])
    .then(function (res) {
      var snap = res[0];
      var steps = [
        function () { bind(snap); }, function () { hardware(snap); }, function () { activity(snap); }, function () { pipeline(snap); },
        function () { stackGrid(snap); }, function () { watch(snap); }, requestPath,
        function () { taskScore(snap); }, function () { harness(snap); }, function () { research(res[1]); },
        function () { terminal(snap); }, chrome
      ];
      // one broken section must not blank the rest of the page
      steps.forEach(function (step) {
        try { step(); } catch (err) { if (window.console) console.error(err); }
      });
    })
    .catch(function (err) {
      if (window.console) console.error(err);
      requestPath();
      $$('.reveal').forEach(function (n) { n.classList.add('is-in'); });
      $$('[data-rel]').forEach(function (n) { n.textContent = 'snapshot unavailable'; });
    });
})();
