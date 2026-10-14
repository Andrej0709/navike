import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ---------- Constants ----------
const DIFF = {
  lako:    { label: 'Lako',    base: 5 },
  srednje: { label: 'Srednje', base: 10 },
  tesko:   { label: 'Teško',   base: 20 },
};
const ICONS = ['🏋️','🏃','📚','💧','🧘','🥗','😴','🚴','✍️','📵','🧠','🎸'];
const COLORS = ['#D4FF3A','#3AE0FF','#FF5A36','#A35CFF','#2FD39A','#FFB020'];
const PAIRS = [['#1a2208','#9fcc1f'],['#0c1a24','#2bb3d6'],['#260f09','#ff5a36'],['#1b1026','#a35cff'],['#0b1f18','#2fd39a'],['#261e08','#ffb020']];
const REACTIONS = [['fire','🔥'],['strong','💪'],['clap','👏']];
const SVG = {
  feed:  '<svg class="i" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  today: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
  rank:  '<svg class="i" viewBox="0 0 24 24"><path d="M6 20v-8M12 20V4M18 20v-5"/></svg>',
  team:  '<svg class="i" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.7 2.8 2.4 3 5.2"/></svg>',
  camera:'<svg class="i" viewBox="0 0 24 24" style="stroke-width:2.2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  google:'<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>',
};
const TABS = [['feed','Feed'],['today','Danas'],['rank','Rang'],['team','Ekipa']];

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const DAY = 864e5;
const dkey = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dkey(new Date(y, m - 1, d + n).getTime()); };
const today = () => dkey(Date.now());
const weekdayIdx = () => (new Date().getDay() + 6) % 7; // Monday = 0
const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - weekdayIdx()); return d.getTime(); };
// Serbian plural: 1 dan, 2-4 dana, 5+ dana
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11) ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? few : many;
const danWord = n => plural(n, 'dan', 'dana', 'dana');
const grad = icon => { let h = 0; for (const c of icon) h = (h * 31 + c.codePointAt(0)) >>> 0; return PAIRS[h % PAIRS.length]; };
const gradStyle = icon => { const [a, b] = grad(icon); return `--g1:${a};--g2:${b}`; };
const LS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} },
};

// Points preview (the server computes the real value with the same formula)
const mult = streak => Math.min(2, 1 + (streak - 1) * 0.1);
const points = (diff, streak) => Math.round(DIFF[diff].base * mult(streak));
const curStreak = h => (h.last_done === today() || h.last_done === addDays(today(), -1)) ? h.streak : 0;
const nextStreak = h => h.last_done === today() ? h.streak : h.last_done === addDays(today(), -1) ? h.streak + 1 : 1;

function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'upravo';
  if (s < 3600) return 'pre ' + Math.floor(s / 60) + ' min';
  const k = dkey(ts);
  if (k === today()) return 'pre ' + Math.floor(s / 3600) + 'h';
  if (k === addDays(today(), -1)) return 'juče';
  return 'pre ' + Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY) + ' dana';
}

// ---------- Supabase ----------
const sb = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const q = async req => { const { data, error } = await req; if (error) throw error; return data; };

// ---------- State ----------
const S = {
  screen: 'loading', tab: 'feed', editMode: false, error: null, pick: null,
  authMode: 'login', email: '', sent: null, recovery: false,
  session: null, me: null, teams: [], teamId: LS.get('team'),
  members: [], habits: [], feed: [], week: [], urls: new Map(),
};
let sheetCtx = null;
const uid = () => S.session.user.id;
const team = () => S.teams.find(t => t.id === S.teamId);
const member = id => S.members.find(m => m.id === id);

const appUrl = () => location.origin + location.pathname;

// Invite links look like ?kod=ABC123. Remember the code through login.
{
  const kod = new URLSearchParams(location.search).get('kod');
  if (kod) { LS.set('pending-kod', kod.trim().toUpperCase()); history.replaceState(null, '', location.pathname + location.hash); }
}
// Password reset links come back with type=recovery in the URL hash
if (location.hash.includes('type=recovery')) S.recovery = true;

// Supabase auth errors in plain Serbian
const ERRORS = [
  [/invalid login credentials/i, 'Pogrešan email ili lozinka'],
  [/already registered|already exists/i, 'Ovaj email već ima nalog. Prijavi se.'],
  [/email not confirmed/i, 'Email još nije potvrđen'],
  [/password should be at least/i, 'Lozinka mora imati bar 6 znakova'],
  [/rate limit|too many/i, 'Previše pokušaja. Sačekaj malo pa probaj ponovo.'],
  [/should be different/i, 'Nova lozinka mora biti drugačija od stare'],
  [/provider is not enabled/i, 'Google prijava još nije uključena'],
];
const errText = e => { const m = e?.message || ''; return (ERRORS.find(([re]) => re.test(m)) || [])[1] || m || 'Greška, pokušaj ponovo'; };
const validEmail = s => /^\S+@\S+\.\S+$/.test(s);

// ---------- Loading ----------
let booting = null;
const boot = () => (booting ??= doBoot().finally(() => { booting = null; }));

async function doBoot() {
  if (!sb) return show('setup');
  try {
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    if (!S.session) return show('login');
    if (S.recovery) return show('newpass');

    S.me = await q(sb.from('profiles').select('*').eq('id', uid()).maybeSingle());
    if (!S.me) {
      const email = S.session.user.email || 'igrac';
      S.me = await q(sb.from('profiles').insert({ id: uid(), name: email.split('@')[0].slice(0, 30), color: COLORS[0] }).select().single());
    }
    if (!S.me.onboarded) return show('onboard');

    const pending = LS.get('pending-kod');
    if (pending) {
      LS.del('pending-kod');
      try {
        const t = await q(sb.rpc('join_team', { p_code: pending }));
        S.teamId = t.id;
        toast(`Sad si u ekipi ${t.name}`);
      } catch (e) { toast(e.message); }
    }

    await loadTeams();
    if (!S.teams.length) return show('noteam');
    if (!team()) S.teamId = S.teams[0].id;
    LS.set('team', S.teamId);
    await loadTeamData();
    show('app');
  } catch (e) {
    console.error(e);
    S.error = e.message || String(e);
    show('error');
  }
}

async function loadTeams() {
  const rows = await q(sb.from('team_members').select('team:teams(id,name,code)').eq('user_id', uid()));
  S.teams = rows.map(r => r.team).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

async function loadTeamData() {
  const tid = S.teamId;
  const [members, habits, feed, week] = await Promise.all([
    q(sb.from('team_members').select('profile:profiles(id,name,color)').eq('team_id', tid)),
    q(sb.from('habits').select('id,user_id,name,icon,diff,streak,last_done').eq('team_id', tid).eq('archived', false).order('created_at')),
    q(sb.from('checkins')
      .select('id,user_id,photo_path,caption,points,streak,day,created_at,habit:habits(name,icon,diff),reactions(user_id,kind)')
      .eq('team_id', tid).order('created_at', { ascending: false }).limit(50)),
    q(sb.from('checkins').select('user_id,points').eq('team_id', tid).gte('created_at', new Date(weekStart()).toISOString())),
  ]);
  if (tid !== S.teamId) return; // team was switched while loading
  S.members = members.map(m => m.profile).filter(Boolean)
    .sort((a, b) => (b.id === uid()) - (a.id === uid()) || a.name.localeCompare(b.name));
  S.habits = habits;
  S.feed = feed;
  S.week = week;
  await signPhotos();
}

async function signPhotos() {
  const need = S.feed.map(c => c.photo_path).filter(p => p && !S.urls.has(p));
  if (!need.length) return;
  const { data } = await sb.storage.from('proofs').createSignedUrls(need, 6 * 3600);
  (data || []).forEach(d => d.signedUrl && S.urls.set(d.path, d.signedUrl));
}

let refreshing = false;
async function refresh() {
  if (refreshing || S.screen !== 'app') return;
  refreshing = true;
  try { await loadTeamData(); render(); }
  catch (e) { console.warn(e); }
  finally { refreshing = false; }
}

function weekly() {
  const m = new Map(S.members.map(u => [u.id, 0]));
  S.week.forEach(c => { if (m.has(c.user_id)) m.set(c.user_id, m.get(c.user_id) + c.points); });
  return S.members.map(u => ({ u, pts: m.get(u.id) })).sort((a, b) => b.pts - a.pts || a.u.name.localeCompare(b.u.name));
}
const rankOf = id => weekly().findIndex(x => x.u.id === id);

// ---------- Small UI pieces ----------
const avatar = (u, s) => `<div class="av" style="width:${s}px;height:${s}px;background:${esc(u.color)};font-size:${Math.round(s * .46)}px">${esc(Array.from(u.name)[0] || '?')}</div>`;

const profileForm = (label, act) => `
  <label class="lbl" for="pname">Ime</label>
  <input class="field" id="pname" maxlength="30" value="${esc(S.me.name)}" autocomplete="nickname" data-enter="${act}">
  <label class="lbl">Boja</label>
  <div class="swatches">${COLORS.map(c => `<button class="sw ${c === S.pick ? 'on' : ''}" style="background:${c}" data-act="pick-color" data-v="${c}" aria-label="Boja ${c}"></button>`).join('')}</div>
  <button class="btn-volt" data-act="${act}">${label}</button>`;

const teamForms = () => `
  <label class="lbl" for="tname">Nova ekipa</label>
  <div class="inline"><input class="field" id="tname" maxlength="40" placeholder="npr. Teretana ekipa" autocomplete="off" data-enter="create-team"><button class="btn-sm" data-act="create-team">Napravi</button></div>
  <label class="lbl" for="tcode">Imaš kod od drugara?</label>
  <div class="inline"><input class="field code-in" id="tcode" maxlength="6" placeholder="K7M2QX" autocomplete="off" autocapitalize="characters" data-enter="join-team"><button class="btn-sm" data-act="join-team">Uđi</button></div>`;

// ---------- Screens ----------
const vLoading = () => `<div class="loader"><div class="logo">Navike</div></div>`;

const vSetup = () => `<div class="screen"><div class="logo">Navike</div><div class="h2">Fali podešavanje</div>
  <p class="lead">Upiši Supabase <b>Project URL</b> i <b>anon key</b> u fajl <b>config.js</b>, pa osveži stranicu.</p></div>`;

const vError = () => `<div class="screen"><div class="logo">Navike</div><div class="h2">Nešto nije u redu</div>
  <p class="lead">${esc(S.error)}</p>
  <button class="btn-volt" data-act="retry">Pokušaj ponovo</button>
  <button class="btn-ghost" data-act="logout">Odjavi se</button></div>`;

function vLogin() {
  if (S.sent) return `<div class="screen"><div class="logo">Navike</div><div class="h2">Proveri email</div>
    <p class="lead">${S.sent.kind === 'reset' ? 'Poslali smo link za novu lozinku na' : 'Poslali smo link za potvrdu naloga na'} <b>${esc(S.sent.email)}</b>. Otvori ga na ovom uređaju.</p>
    <button class="btn-ghost" data-act="login-back">Nazad na prijavu</button></div>`;
  const signup = S.authMode === 'signup';
  return `<div class="screen"><div class="logo">Navike</div>
    <p class="lead">Navike sa ekipom. Slikaj dokaz, skupljaj poene, pobedi drugare.</p>
    <div class="seg auth-seg">
      <button class="${signup ? '' : 'on'}" data-act="auth-mode" data-v="login"><b>Prijava</b></button>
      <button class="${signup ? 'on' : ''}" data-act="auth-mode" data-v="signup"><b>Novi nalog</b></button>
    </div>
    <label class="lbl" for="email">Email</label>
    <input class="field" id="email" type="email" inputmode="email" autocomplete="email" placeholder="ti@primer.com" value="${esc(S.email)}" data-enter="auth-submit">
    <label class="lbl" for="pass">Lozinka</label>
    <input class="field" id="pass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'Bar 6 znakova' : ''}" data-enter="auth-submit">
    <button class="btn-volt" data-act="auth-submit">${signup ? 'Napravi nalog' : 'Prijavi se'}</button>
    ${signup ? '' : '<button class="link-btn" data-act="forgot">Zaboravljena lozinka?</button>'}
    <div class="divider">ili</div>
    <button class="btn-google" data-act="login-google">${SVG.google}Nastavi sa Google</button></div>`;
}

const vNewPass = () => `<div class="screen"><div class="logo">Navike</div><div class="h2">Nova lozinka</div>
  <p class="lead">Upiši novu lozinku za svoj nalog.</p>
  <label class="lbl" for="newpass">Lozinka</label>
  <input class="field" id="newpass" type="password" autocomplete="new-password" placeholder="Bar 6 znakova" data-enter="set-pass">
  <button class="btn-volt" data-act="set-pass">Sačuvaj lozinku</button></div>`;

const vOnboard = () => `<div class="screen"><div class="logo">Navike</div><div class="h2">Kako da te zovu?</div>
  <p class="lead">Ime i boju vide drugari u tvojim ekipama.</p>${profileForm('Kreni', 'save-onboard')}</div>`;

const vNoTeam = () => `<div class="screen"><div class="logo">Navike</div><div class="h2">Tvoja ekipa</div>
  <p class="lead">Napravi ekipu i pozovi drugare, ili uđi kodom koji ti je neko poslao.</p>${teamForms()}
  <button class="btn-ghost" data-act="logout">Odjavi se</button></div>`;

// ---------- App tabs ----------
function vFeed() {
  const active = new Set(S.feed.filter(c => c.day === today()).map(c => c.user_id));
  const stories = S.members.map(u => `<div class="story ${active.has(u.id) ? 'on' : ''}"><div class="ring">${avatar(u, 54)}</div><span>${esc(u.id === uid() ? 'Ti' : u.name)}</span></div>`).join('');
  const posts = S.feed.map(postCard).join('');
  return `<header class="top"><div><div class="h1">Feed</div><div class="sub"><b>${active.size}/${S.members.length}</b> aktivno danas</div></div>
      <button class="pill-btn team-pill" data-act="teams">${esc(team()?.name)} ▾</button></header>
    <div class="stories">${stories}</div>
    ${posts || '<div class="empty">Još nema objava u ovoj ekipi.<br>Idi na <b>Danas</b> i budi prvi!</div>'}`;
}

function postCard(c) {
  const u = member(c.user_id) || { name: 'Bivši član', color: '#555' };
  const h = c.habit || { name: 'Navika', icon: '✅', diff: 'srednje' };
  const url = S.urls.get(c.photo_path);
  const media = url ? `<img src="${esc(url)}" alt="${esc(h.name)}" loading="lazy">` : `<div class="ph loading" style="${gradStyle(h.icon)}"><span>${h.icon}</span></div>`;
  return `<article class="post">
    <div class="post-head">${avatar(u, 40)}
      <div class="who"><b>${esc(u.name)}</b><span class="muted"> · ${ago(new Date(c.created_at).getTime())}</span>
        <div class="hl">${esc(h.icon)} ${esc(h.name)} <span class="diff d-${h.diff}">${DIFF[h.diff]?.label || ''}</span></div></div>
      <div class="pts">+${c.points}</div></div>
    <div class="media">${media}<div class="streak-badge">🔥 ${c.streak}</div></div>
    ${c.caption ? `<p class="cap">${esc(c.caption)}</p>` : ''}
    <div class="reacts">${REACTIONS.map(([k, e]) => reactBtn(c, k, e)).join('')}</div>
  </article>`;
}

function reactBtn(c, k, e) {
  const list = c.reactions.filter(r => r.kind === k);
  const on = list.some(r => r.user_id === uid());
  return `<button class="react ${on ? 'on' : ''}" data-act="react" data-id="${c.id}" data-r="${k}">${e}<b>${list.length || ''}</b></button>`;
}

function vToday() {
  const t = today();
  const mine = S.habits.filter(h => h.user_id === uid());
  const done = mine.filter(h => h.last_done === t).length;
  const pts = S.feed.filter(c => c.user_id === uid() && c.day === t).reduce((a, c) => a + c.points, 0);
  let date = new Date().toLocaleDateString('sr-Latn', { weekday: 'long', day: 'numeric', month: 'long' });
  date = date[0].toUpperCase() + date.slice(1);
  const list = mine.map(h => {
    const isDone = h.last_done === t, cs = curStreak(h);
    const right = S.editMode ? `<button class="del" data-act="del-habit" data-id="${h.id}">Obriši</button>`
      : isDone ? '<div class="donemark">✓</div>'
      : `<button class="prove" data-act="prove" data-id="${h.id}">${SVG.camera}+${points(h.diff, nextStreak(h))}</button>`;
    return `<div class="habit ${isDone && !S.editMode ? 'done' : ''}">
      <div class="hicon" style="${gradStyle(h.icon)}">${esc(h.icon)}</div>
      <div class="hbody"><div class="hname">${esc(h.name)}</div>
        <div class="hmeta"><span class="diff d-${h.diff}">${DIFF[h.diff].label}</span>
        ${cs ? `<span class="fire">🔥 ${cs} ${danWord(cs)}</span>` : '<span class="muted">Kreni niz</span>'}</div></div>
      ${right}</div>`;
  }).join('');
  return `<header class="top"><div><div class="h1">Danas</div><div class="sub">${esc(date)} · ${esc(team()?.name)}</div></div>
      ${mine.length ? `<button class="pill-btn" data-act="edit">${S.editMode ? 'Gotovo' : 'Uredi'}</button>` : ''}</header>
    <div class="progress"><div class="pnum">${done}<span>/${mine.length}</span></div>
      <div class="pmeta"><div class="bar"><i style="width:${mine.length ? done / mine.length * 100 : 0}%"></i></div>
      <div class="sub">Danas osvojeno <b>${pts}</b> poena</div></div></div>
    ${list || '<div class="empty">Dodaj prvu naviku za ovu ekipu.</div>'}
    <button class="add" data-act="open-add">+ Nova navika</button>`;
}

function vRank() {
  const board = weekly();
  const left = 7 - weekdayIdx();
  const myIdx = board.findIndex(x => x.u.id === uid());
  const meText = board.length < 2 ? 'Niko još nije u ekipi osim tebe. Pozovi drugare iz taba <b>Ekipa</b>.'
    : myIdx === 0 ? 'Ti vodiš! Brani prvo mesto.'
    : `Fali ti <b>${board[myIdx - 1].pts - board[myIdx].pts + 1}</b> poena da pretekneš: ${esc(board[myIdx - 1].u.name)}`;
  const podCol = (x, place) => x
    ? `<div class="pcol p${place}">${avatar(x.u, place === 1 ? 60 : 48)}<div class="nm">${esc(x.u.name)}</div><div class="pp">${x.pts}</div><div class="pblock">${place}</div></div>`
    : '<div class="pcol"></div>';
  const rows = board.slice(3).map((x, i) => `<div class="row ${x.u.id === uid() ? 'me' : ''}"><div class="place">${i + 4}</div>${avatar(x.u, 36)}<div class="nm">${esc(x.u.name)}</div><div class="pp">${x.pts}</div></div>`).join('');
  return `<header class="top"><div><div class="h1">Rang lista</div><div class="sub">Ova nedelja · reset ${left === 1 ? 'sutra' : `za ${left} dana`}</div></div>
      <button class="pill-btn team-pill" data-act="teams">${esc(team()?.name)} ▾</button></header>
    <div class="me-card"><div>${meText}</div><div class="big">#${myIdx + 1}</div></div>
    <div class="podium">${podCol(board[1], 2)}${podCol(board[0], 1)}${podCol(board[2], 3)}</div>
    <div class="rows">${rows}</div>
    <div class="info"><h3>Kako se računaju poeni</h3>
      Svaka navika ima osnovu po težini:
      <div class="grid"><div><b>5</b>Lako</div><div><b>10</b>Srednje</div><div><b>20</b>Teško</div></div>
      Svaki dan zaredom dodaje <b style="color:var(--text)">+10%</b>, do najviše <b style="color:var(--text)">2×</b>. Prekineš niz – kreće ispočetka.</div>`;
}

function vTeam() {
  const t = team();
  const rows = weekly().map(({ u, pts }) => {
    const hs = S.habits.filter(h => h.user_id === u.id);
    const best = Math.max(0, ...hs.map(curStreak));
    return `<div class="row ${u.id === uid() ? 'me' : ''}">${avatar(u, 40)}<div class="nm">${esc(u.name)}<div class="sub" style="margin-top:2px">${hs.length} ${plural(hs.length, 'navika', 'navike', 'navika')} · najduži niz 🔥 ${best}</div></div><div class="pp">${pts}</div></div>`;
  }).join('');
  const n = S.members.length;
  return `<header class="top"><div><div class="h1">Ekipa</div><div class="sub">${esc(t.name)} · ${n} ${plural(n, 'član', 'člana', 'članova')}</div></div>
      <button class="pill-btn" data-act="teams">Promeni ▾</button></header>
    <div class="code"><div><div class="sub" style="margin:0 0 8px">Kod za poziv</div><div class="c">${esc(t.code)}</div></div>
      <div class="code-btns"><button class="pill-btn volt" data-act="share">Pošalji link</button><button class="pill-btn" data-act="copy-code">Kopiraj kod</button></div></div>
    <div class="rows" style="margin-top:0">${rows}</div>
    <div class="section-t">Uskoro</div>
    <div class="soon">
      <div>⚔️<b>1 na 1 izazovi</b>Izazovi drugara: ko duže izdrži bez slatkiša.</div>
      <div>🎯<b>Zajednički cilj</b>Cela ekipa skuplja poene do zajedničkog cilja.</div>
    </div>
    <div class="links">
      <button class="link-row" data-act="profile">Moj profil · ${esc(S.me.name)}</button>
      <button class="link-row danger" data-act="leave">Napusti ekipu</button>
      <button class="link-row" data-act="logout">Odjavi se</button>
    </div>`;
}

const SCREENS = { loading: vLoading, setup: vSetup, error: vError, login: vLogin, newpass: vNewPass, onboard: vOnboard, noteam: vNoTeam };
const VIEWS = { feed: vFeed, today: vToday, rank: vRank, team: vTeam };

function show(screen) {
  S.screen = screen;
  if (screen === 'onboard') S.pick = S.me.color;
  render();
}

function render() {
  const bar = $('#tabbar');
  if (S.screen !== 'app') {
    $('#view').innerHTML = SCREENS[S.screen]();
    bar.hidden = true;
    return;
  }
  $('#view').innerHTML = VIEWS[S.tab]();
  bar.hidden = false;
  bar.innerHTML = TABS.map(([k, l]) => `<button class="tab ${k === S.tab ? 'on' : ''}" data-act="tab" data-v="${k}">${SVG[k]}${l}</button>`).join('');
}

// ---------- Sheets ----------
function openSheet(html) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="scrim" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
}
function closeSheet() {
  const root = $('#sheet-root');
  root.classList.remove('open');
  setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; }, 300);
  sheetCtx = null;
}

function openTeams() {
  openSheet(`<div class="sheet-title">Moje ekipe</div>
    <div class="list">${S.teams.map(t => `<button class="list-row ${t.id === S.teamId ? 'on' : ''}" data-act="switch-team" data-id="${t.id}"><span>${esc(t.name)}</span>${t.id === S.teamId ? '<b>✓</b>' : ''}</button>`).join('')}</div>
    ${teamForms()}`);
}

function openAdd() {
  sheetCtx = { icon: ICONS[0], diff: 'srednje' };
  openSheet(`<div class="sheet-title">Nova navika</div>
    <label class="lbl" for="hname">Naziv</label><input class="field" id="hname" maxlength="40" placeholder="npr. 10.000 koraka" autocomplete="off" data-enter="add-habit">
    <label class="lbl">Ikonica</label><div class="icons">${ICONS.map(i => `<button class="ic ${i === sheetCtx.icon ? 'on' : ''}" data-act="pick-icon" data-v="${i}">${i}</button>`).join('')}</div>
    <label class="lbl">Težina</label><div class="seg">${Object.entries(DIFF).map(([k, d]) => `<button class="${k === sheetCtx.diff ? 'on' : ''}" data-act="pick-diff" data-v="${k}"><b>${d.label}</b><span>${d.base} poena</span></button>`).join('')}</div>
    <button class="btn-volt" data-act="add-habit">Dodaj naviku</button>`);
  setTimeout(() => $('#hname')?.focus(), 320);
}

function openConfirm(hid, blob) {
  const h = S.habits.find(x => x.id === hid), ns = nextStreak(h);
  const preview = URL.createObjectURL(blob);
  sheetCtx = { hid, blob, preview };
  openSheet(`<div class="sheet-title">${esc(h.icon)} ${esc(h.name)}</div>
    <div class="confirm-photo"><img src="${preview}" alt=""></div>
    <div class="calc">
      <div><span class="muted">Osnova (${DIFF[h.diff].label})</span><b>${DIFF[h.diff].base}</b></div>
      <div><span class="muted">Streak ${ns} ${danWord(ns)}</span><b>×${mult(ns).toFixed(1)}</b></div>
      <div class="total"><span>Ukupno</span><b>+${points(h.diff, ns)}</b></div></div>
    <input class="field" id="cap" maxlength="80" placeholder="Dodaj opis (nije obavezno)" autocomplete="off" data-enter="publish">
    <button class="btn-volt" data-act="publish">Objavi u feed</button>`);
}

function compress(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 1080 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('Slika nije obrađena')), 'image/jpeg', .78);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Ovaj format slike nije podržan')); };
    img.src = url;
  });
}

function celebrate(pts, streak, rankText) {
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.innerHTML = `<div class="c-inner"><div class="c-pts">+${pts}</div><div class="c-sub">🔥 ${streak} ${danWord(streak)} zaredom</div><div class="c-rank">${esc(rankText)}</div></div>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1900);
  setTimeout(() => el.remove(), 2300);
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function shake(f) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); f.focus(); }

// Disable a button while its async work runs
const BUSY = new Error('busy');
async function busy(btn, label, fn) {
  if (btn.disabled) throw BUSY;
  const old = btn.innerHTML;
  btn.disabled = true; btn.textContent = label;
  try { return await fn(); }
  finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

async function enterTeam(t, msg) {
  S.teamId = t.id; LS.set('team', t.id);
  await loadTeams();
  await loadTeamData();
  closeSheet();
  S.tab = 'feed'; S.editMode = false;
  show('app');
  toast(msg);
}

// ---------- Actions ----------
const ACTIONS = {
  // Auth
  'auth-mode'(b, { v }) {
    S.email = $('#email').value.trim();
    S.authMode = v; render();
    $(S.email ? '#pass' : '#email').focus();
  },
  async 'auth-submit'(b) {
    const ef = $('#email'), pf = $('#pass'), email = ef.value.trim(), password = pf.value;
    S.email = email;
    if (!validEmail(email)) return shake(ef);
    if (password.length < 6) { toast('Lozinka mora imati bar 6 znakova'); return shake(pf); }
    if (S.authMode === 'signup') {
      const data = await busy(b, 'Pravim nalog…', () => q(sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } })));
      // No session means Supabase still requires email confirmation
      if (!data.session) { S.sent = { email, kind: 'confirm' }; render(); }
    } else {
      await busy(b, 'Prijavljujem…', () => q(sb.auth.signInWithPassword({ email, password })));
    }
  },
  async forgot(b) {
    const ef = $('#email'), email = ef.value.trim();
    if (!validEmail(email)) { toast('Upiši email iznad'); return shake(ef); }
    await busy(b, 'Šaljem…', () => q(sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })));
    S.sent = { email, kind: 'reset' }; render();
  },
  async 'set-pass'(b) {
    const pf = $('#newpass');
    if (pf.value.length < 6) { toast('Lozinka mora imati bar 6 znakova'); return shake(pf); }
    await busy(b, 'Čuvam…', () => q(sb.auth.updateUser({ password: pf.value })));
    S.recovery = false;
    history.replaceState(null, '', location.pathname);
    toast('Lozinka sačuvana');
    show('loading'); boot();
  },
  'login-back'() { S.sent = null; render(); },
  async 'login-google'() {
    await q(sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } }));
  },
  async logout() { await sb.auth.signOut(); },
  retry() { show('loading'); boot(); },

  // Profile
  'pick-color'(b, { v }) {
    S.pick = v;
    document.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b));
  },
  'save-onboard'(b) { return saveProfile(b, true); },
  'save-profile'(b) { return saveProfile(b, false); },
  profile() {
    S.pick = S.me.color;
    openSheet(`<div class="sheet-title">Moj profil</div>${profileForm('Sačuvaj', 'save-profile')}`);
  },

  // Teams
  teams() { openTeams(); },
  async 'create-team'(b) {
    const f = $('#tname'), name = f.value.trim();
    if (!name) return shake(f);
    const t = await busy(b, '…', () => q(sb.rpc('create_team', { p_name: name })));
    await enterTeam(t, 'Ekipa napravljena. Pozovi drugare!');
  },
  async 'join-team'(b) {
    const f = $('#tcode'), code = f.value.trim();
    if (code.length < 6) return shake(f);
    const t = await busy(b, '…', () => q(sb.rpc('join_team', { p_code: code })));
    await enterTeam(t, `Sad si u ekipi ${t.name}`);
  },
  async 'switch-team'(b, { id }) {
    closeSheet();
    if (id === S.teamId) return;
    S.teamId = id; LS.set('team', id); S.editMode = false;
    await loadTeamData();
    render(); window.scrollTo(0, 0);
  },
  async leave() {
    const t = team();
    if (!confirm(`Napustiti ekipu "${t.name}"? Tvoje navike u njoj više neće biti vidljive.`)) return;
    await q(sb.from('team_members').delete().eq('team_id', t.id).eq('user_id', uid()));
    S.teamId = null; LS.del('team'); S.tab = 'feed';
    show('loading'); boot();
  },
  async share() {
    const t = team(), link = `${location.origin}${location.pathname}?kod=${t.code}`;
    if (navigator.share) { try { await navigator.share({ text: `Uđi u moju ekipu "${t.name}" na Navike: ${link}` }); } catch {} return; }
    try { await navigator.clipboard.writeText(link); toast('Link kopiran, pošalji ga drugarima'); } catch { toast(link); }
  },
  async 'copy-code'() {
    try { await navigator.clipboard.writeText(team().code); toast('Kod kopiran'); } catch { toast('Kod: ' + team().code); }
  },

  // Navigation
  tab(b, { v }) {
    S.tab = v; S.editMode = false;
    render(); window.scrollTo(0, 0);
    if (v === 'feed' || v === 'rank') refresh();
  },
  'close-sheet'() { closeSheet(); },

  // Feed
  react(b, { id, r }) {
    const c = S.feed.find(x => x.id === id);
    const mine = c.reactions.find(x => x.kind === r && x.user_id === uid());
    const req = mine
      ? sb.from('reactions').delete().match({ checkin_id: id, user_id: uid(), kind: r })
      : sb.from('reactions').insert({ checkin_id: id, kind: r });
    c.reactions = mine ? c.reactions.filter(x => x !== mine) : [...c.reactions, { user_id: uid(), kind: r }];
    b.outerHTML = reactBtn(c, r, REACTIONS.find(x => x[0] === r)[1]);
    return q(req);
  },

  // Today
  prove(b, { id }) { sheetCtx = { hid: id }; const input = $('#photo-input'); input.value = ''; input.click(); },
  publish(b) { return publish(b); },
  edit() { S.editMode = !S.editMode; render(); },
  async 'del-habit'(b, { id }) {
    if (!confirm('Obrisati ovu naviku? Objave u feedu ostaju.')) return;
    await q(sb.from('habits').update({ archived: true }).eq('id', id));
    S.habits = S.habits.filter(h => h.id !== id);
    render();
  },
  'open-add'() { openAdd(); },
  'pick-icon'(b, { v }) {
    sheetCtx.icon = v;
    document.querySelectorAll('.ic').forEach(x => x.classList.toggle('on', x === b));
  },
  'pick-diff'(b, { v }) {
    sheetCtx.diff = v;
    document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  },
  async 'add-habit'(b) {
    const f = $('#hname'), name = f.value.trim();
    if (!name) return shake(f);
    const { icon, diff } = sheetCtx;
    const h = await busy(b, 'Dodajem…', () => q(sb.from('habits')
      .insert({ team_id: S.teamId, name, icon, diff })
      .select('id,user_id,name,icon,diff,streak,last_done').single()));
    S.habits.push(h);
    closeSheet(); render(); toast('Navika dodata');
  },
};

async function saveProfile(b, onboarding) {
  const f = $('#pname'), name = f.value.trim();
  if (!name) return shake(f);
  S.me = await busy(b, 'Čuvam…', () => q(sb.from('profiles')
    .update({ name, color: S.pick, onboarded: true }).eq('id', uid()).select().single()));
  if (onboarding) { show('loading'); boot(); return; }
  closeSheet();
  await loadTeamData(); render(); toast('Profil sačuvan');
}

async function publish(b) {
  const { hid, blob, preview } = sheetCtx;
  const before = rankOf(uid());
  const path = `${S.teamId}/${uid()}/${crypto.randomUUID()}.jpg`;
  const c = await busy(b, 'Šaljem…', async () => {
    await q(sb.storage.from('proofs').upload(path, blob, { contentType: 'image/jpeg' }));
    try {
      return await q(sb.rpc('complete_habit', { p_habit: hid, p_photo: path, p_caption: $('#cap').value.trim(), p_day: today() }));
    } catch (e) {
      sb.storage.from('proofs').remove([path]);
      throw e;
    }
  });
  S.urls.set(path, preview);
  closeSheet();
  await loadTeamData();
  render();
  const after = rankOf(uid());
  celebrate(c.points, c.streak, after < before ? `Sad si #${after + 1} u ekipi!` : `Trenutno si #${after + 1} u ekipi`);
}

// ---------- Events ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  const fn = b && ACTIONS[b.dataset.act];
  if (!fn) return;
  Promise.resolve()
    .then(() => fn(b, b.dataset))
    .catch(err => { if (err === BUSY) return; console.error(err); toast(errText(err)); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  const act = e.key === 'Enter' && e.target.dataset?.enter;
  if (act) { e.preventDefault(); document.querySelector(`[data-act="${act}"]`)?.click(); }
});

$('#photo-input').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f || !sheetCtx?.hid) return;
  try { openConfirm(sheetCtx.hid, await compress(f)); }
  catch (err) { toast(err.message); sheetCtx = null; }
});

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

sb?.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') { S.recovery = true; S.session = session; show('newpass'); return; }
  if (event === 'SIGNED_IN' && session?.user.id !== S.session?.user.id) setTimeout(boot);
  if (event === 'SIGNED_OUT') {
    Object.assign(S, { session: null, me: null, teams: [], members: [], habits: [], feed: [], week: [], sent: null, recovery: false, tab: 'feed' });
    S.urls.clear();
    closeSheet();
    setTimeout(boot);
  }
});

boot();
