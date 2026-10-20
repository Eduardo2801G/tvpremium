(() => {
  const ALL = window.CANALES || [];
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), q = $("#q"), more = $("#more"), empty = $("#empty");
  const PAGE = 150;
  const CATS = [["todos","Todos"],["fav","★ Favoritos"],["deportes","Deportes"],["noticias","Noticias"],["peliculas","Películas"],["entretenimiento","Entretenimiento"]];
  let cat = "todos", shown = PAGE, list = [], cur = -1, hls = null, hudTimer = null;
  // Lista del reproductor: SIEMPRE todos los canales (independiente de la búsqueda/filtro de la pantalla principal)
  const plist = ALL;

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let favs = new Set(store.get("favs", []));
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // ---------- Entorno nativo (APK) ----------
  const Cap = window.Capacitor;
  const NativeHttp = Cap && Cap.Plugins && Cap.Plugins.CapacitorHttp;
  const AppPlugin = Cap && Cap.Plugins && Cap.Plugins.App;
  const GolTap = window.GolTap; // puente nativo de MainActivity: toque real en pantalla
  const isNative = !!(Cap && (Cap.isNativePlatform ? Cap.isNativePlatform() : (Cap.getPlatform && Cap.getPlatform() !== "web")));
  const useNativeBack = !!(isNative && AppPlugin && AppPlugin.addListener);

  // ---------- Cargador de red nativo para hls.js (solo en el APK; evita CORS) ----------
  const b64ToBuf = (b64) => {
    const s = atob(b64), n = s.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  };
  async function nativeGet(url, headers, bin) {
    for (let hop = 0; hop < 6; hop++) {
      const r = await NativeHttp.request({
        url, method: "GET", headers,
        responseType: bin ? "arraybuffer" : "text",
        connectTimeout: 15000, readTimeout: 20000, disableRedirects: true,
      });
      const loc = r.headers && (r.headers.Location || r.headers.location);
      if ([301, 302, 303, 307, 308].includes(r.status) && loc) { url = new URL(loc, url).href; continue; }
      return { r, url };
    }
    throw new Error("Demasiadas redirecciones");
  }
  const CapLoader = (isNative && NativeHttp) ? class {
    constructor() {
      this.aborted = false; this.context = null;
      this.stats = { aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0,
        loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 } };
    }
    destroy() { this.aborted = true; }
    abort() { this.aborted = true; this.stats.aborted = true; }
    load(context, config, callbacks) {
      this.context = context;
      const st = this.stats, bin = context.responseType === "arraybuffer";
      const headers = { "User-Agent": navigator.userAgent };
      if (context.rangeEnd) headers.Range = "bytes=" + (context.rangeStart || 0) + "-" + (context.rangeEnd - 1);
      st.loading.start = performance.now();
      nativeGet(context.url, headers, bin).then(({ r, url }) => {
        if (this.aborted) return;
        st.loading.first = st.loading.end = performance.now();
        if (r.status < 200 || r.status >= 300) { callbacks.onError({ code: r.status, text: "HTTP " + r.status }, context, null, st); return; }
        let data;
        if (bin) data = b64ToBuf(r.data);
        else data = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
        st.loaded = st.total = bin ? data.byteLength : data.length;
        callbacks.onSuccess({ url, data }, st, context, null);
      }).catch((e) => {
        if (this.aborted) return;
        st.loading.end = performance.now();
        callbacks.onError({ code: 0, text: String((e && e.message) || e) }, context, null, st);
      });
    }
  } : null;

  // ---------- Lista (pantalla principal) ----------
  function filtered() {
    const t = norm(q.value.trim());
    return ALL.filter((c) =>
      (cat === "todos" || (cat === "fav" ? favs.has(c.id) : c.c === cat)) &&
      (!t || norm(c.n + " " + c.g + " " + c.p).includes(t)));
  }
  function render() {
    list = filtered();
    grid.textContent = "";
    const frag = document.createDocumentFragment();
    list.slice(0, shown).forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "card"; b.dataset.i = i;
      const logo = document.createElement("div"); logo.className = "logo";
      if (c.l) {
        const im = new Image(); im.loading = "lazy"; im.alt = ""; im.src = c.l;
        im.onerror = () => { logo.textContent = ""; logo.append(ph(c)); };
        logo.append(im);
      } else logo.append(ph(c));
      const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = c.n;
      const tag = document.createElement("div"); tag.className = "tag";
      tag.textContent = [favs.has(c.id) ? "★" : "", c.ok ? "✓" : "", c.p].filter(Boolean).join(" ");
      b.append(logo, nm, tag);
      b.onclick = () => openPlayer(c);
      frag.append(b);
    });
    grid.append(frag);
    more.hidden = list.length <= shown;
    empty.hidden = list.length > 0;
  }
  function ph(c) { const d = document.createElement("div"); d.className = "ph"; d.textContent = c.n.slice(0, 2).toUpperCase(); return d; }
  more.onclick = () => { shown += PAGE; render(); };
  q.oninput = () => { shown = PAGE; render(); };

  const nav = $("#cats");
  CATS.forEach(([k, label]) => {
    const b = document.createElement("button");
    b.className = "chip" + (k === cat ? " on" : ""); b.textContent = label;
    b.onclick = () => { cat = k; shown = PAGE; nav.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b)); render(); };
    nav.append(b);
  });

  // ---------- Reproductor ----------
  const player = $("#player"), stage = $("#stage"), hud = $("#hud");
  const pname = $("#pname"), pstatus = $("#pstatus"), favBtn = $("#fav");
  const side = $("#side"), dock = $("#dock"), dq = $("#dq");
  const root = document.documentElement;

  const isFull = () => player.classList.contains("full");
  const isWeb = () => player.classList.contains("web");

  // ---- Cursor para canales web (iframe): flechas lo mueven, OK toca de verdad en pantalla ----
  const ptr = document.createElement("div");
  ptr.style.cssText = "position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;" +
    "border:3px solid #fff;background:rgba(34,197,94,.55);box-shadow:0 0 0 2px #000a,0 0 14px #22c55e;z-index:60;pointer-events:none;display:none";
  document.body.append(ptr);
  let px = 0, py = 0, held = 0;
  const cursorEnabled = () => !!(GolTap && !player.hidden && isFull() && isWeb());
  function updatePtr(reset) {
    const on = cursorEnabled();
    if (on && reset) { px = innerWidth / 2; py = innerHeight / 2; }
    ptr.style.display = on ? "block" : "none";
    ptr.style.left = px + "px"; ptr.style.top = py + "px";
  }
  function movePtr(dir) {
    held++;
    const step = 18 + Math.min(held, 14) * 5;
    px = Math.max(0, Math.min(innerWidth, px + dir[0] * step));
    py = Math.max(0, Math.min(innerHeight, py + dir[1] * step));
    updatePtr();
  }
  function tapPtr() {
    const d = window.devicePixelRatio || 1;
    try { GolTap.tap(px * d, py * d); } catch {}
    if (ptr.animate) ptr.animate([{ transform: "scale(1)" }, { transform: "scale(1.8)" }, { transform: "scale(1)" }], { duration: 220 });
  }
  document.addEventListener("keyup", () => { held = 0; });

  function enterFull() {
    player.classList.add("full");
    const a = document.activeElement; if (a && a !== document.body) a.blur();
    updatePtr(true);
    showHud();
  }
  function exitFull() {
    player.classList.remove("full");
    updatePtr();
    markNow(true);
    showHud();
  }

  // Buscador de la lista lateral (oculta/muestra las tarjetas sin cambiar sus índices)
  function filterDock() {
    const t = norm(dq.value.trim());
    dock.querySelectorAll(".card").forEach((el) => {
      const c = plist[+el.dataset.j];
      el.hidden = !!t && !norm(c.n + " " + c.g + " " + c.p).includes(t);
    });
  }
  dq.oninput = filterDock;

  function renderDock() {
    dock.textContent = "";
    dq.value = "";
    const frag = document.createDocumentFragment();
    plist.forEach((c, j) => {
      const b = document.createElement("button");
      b.className = "card"; b.dataset.j = j; b.dataset.n = j + 1;
      const logo = document.createElement("div"); logo.className = "logo";
      if (c.l) { const im = new Image(); im.loading = "lazy"; im.alt = ""; im.src = c.l; im.onerror = () => { logo.textContent = ""; logo.append(ph(c)); }; logo.append(im); }
      else logo.append(ph(c));
      const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = c.n;
      b.append(logo, nm);
      b.onclick = () => { play(j); enterFull(); };
      frag.append(b);
    });
    dock.append(frag);
  }
  function markNow(focus) {
    dock.querySelectorAll(".now").forEach((e) => e.classList.remove("now"));
    const el = dock.querySelector('[data-j="' + cur + '"]');
    if (el) { el.classList.add("now"); el.scrollIntoView({ block: "nearest", inline: "center" }); if (focus && !el.hidden) el.focus({ preventScroll: true }); }
  }

  function stop() {
    if (hls) { hls.destroy(); hls = null; }
    stage.textContent = "";
  }
  function showHud() {
    hud.classList.remove("hide"); clearTimeout(hudTimer);
    // En canales web (iframe) el HUD no se esconde: los clics dentro del iframe no llegan a esta página
    if (isWeb()) return;
    hudTimer = setTimeout(() => hud.classList.add("hide"), 4000);
  }
  function play(i) {
    if (i < 0) i = plist.length - 1;
    if (i >= plist.length) i = 0;
    cur = i; const c = plist[i]; if (!c) return;
    stop();
    player.classList.toggle("web", c.f !== "hls");
    pname.textContent = c.n; pstatus.textContent = "Cargando…";
    favBtn.textContent = favs.has(c.id) ? "★" : "☆";
    store.set("last", c.id);
    markNow(false);
    showHud();
    if (c.f === "hls") {
      const v = document.createElement("video");
      v.autoplay = true; v.playsInline = true; v.controls = false;
      stage.append(v);
      v.onplaying = () => { pstatus.textContent = v.muted ? "En vivo (sin sonido: presiona OK)" : "En vivo"; };
      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: false, maxBufferLength: 20, ...(CapLoader ? { loader: CapLoader } : {}) });
        let retries = 0;
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal) return;
          if (retries++ < 2 && d.type === Hls.ErrorTypes.NETWORK_ERROR) { pstatus.textContent = "Reintentando…"; hls.startLoad(); }
          else if (retries < 3 && d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else {
            const code = d.response && d.response.code != null ? " " + d.response.code : "";
            pstatus.textContent = "No se pudo reproducir este canal (" + d.details + code + ")";
            showHud();
          }
        });
        hls.loadSource(c.u); hls.attachMedia(v);
      } else { v.src = c.u; v.onerror = () => { pstatus.textContent = "No se pudo reproducir este canal"; }; }
      // Si el autoplay con sonido falla, arranca sin sonido y OK activa el sonido
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    } else {
      const f = document.createElement("iframe");
      f.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture"; f.allowFullscreen = true; f.src = c.u;
      stage.append(f); pstatus.textContent = "En vivo (web)";
    }
    updatePtr(true);
  }
  function openPlayer(ch) {
    const idx = plist.indexOf(ch);
    if (idx < 0) return;
    player.hidden = false;
    root.classList.add("playing");
    if (!useNativeBack && (!history.state || history.state.p !== 1)) history.pushState({ p: 1 }, "");
    renderDock(); play(idx);
    player.classList.add("full");
    updatePtr(true);
    markNow(false);
  }
  function closePlayer() {
    stop(); player.hidden = true; player.classList.remove("full", "web");
    root.classList.remove("playing");
    updatePtr();
    const c = plist[cur];
    const gi = c ? list.indexOf(c) : -1;
    const el = (gi >= 0 && grid.querySelector('[data-i="' + gi + '"]')) || grid.querySelector(".card");
    if (el) el.focus({ preventScroll: false });
  }

  // ---------- Botón Atrás ----------
  // Pantalla completa -> muestra la lista; con la lista abierta -> cierra el reproductor; en la cuadrícula -> sale de la app
  let lastBack = 0;
  function handleBack() {
    const now = Date.now();
    if (now - lastBack < 350) return; // evita doble disparo (tecla + evento nativo)
    lastBack = now;
    if (player.hidden) { if (AppPlugin && AppPlugin.exitApp) AppPlugin.exitApp(); return; }
    if (isFull()) exitFull(); else closePlayer();
  }
  function goBack() { if (useNativeBack) handleBack(); else history.back(); }
  if (useNativeBack) AppPlugin.addListener("backButton", handleBack);
  // En el navegador (PC) se usa el historial
  window.addEventListener("popstate", () => {
    if (useNativeBack || player.hidden) return;
    if (isFull()) { exitFull(); history.pushState({ p: 1 }, ""); }
    else closePlayer();
  });
  $("#back").onclick = goBack;
  $("#prev").onclick = () => { play(cur - 1); };
  $("#next").onclick = () => { play(cur + 1); };
  favBtn.onclick = () => {
    const c = plist[cur]; if (!c) return;
    favs.has(c.id) ? favs.delete(c.id) : favs.add(c.id);
    store.set("favs", [...favs]); favBtn.textContent = favs.has(c.id) ? "★" : "☆"; showHud();
  };
  player.addEventListener("pointerdown", showHud);

  // ---------- Control remoto (D-pad) ----------
  const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  function spatial(dir) {
    const scope = player.hidden ? document : player;
    const items = [...scope.querySelectorAll("button:not([hidden]), input")]
      .filter((e) => e.offsetParent && !e.closest("[hidden]") && !(isFull() && e.closest("#side")));
    const a = document.activeElement;
    if (!a || a === document.body || !items.includes(a)) { (items[0] || document.body).focus(); return; }
    const r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const e of items) {
      if (e === a) continue;
      const b = e.getBoundingClientRect(), ex = b.left + b.width / 2, ey = b.top + b.height / 2;
      const dx = ex - cx, dy = ey - cy;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 1) continue;
      const across = Math.abs(dir[0] ? dy : dx);
      const s = along + across * 2.5;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }
  document.addEventListener("keydown", (e) => {
    if (!player.hidden) {
      const typing = document.activeElement === dq;
      if (e.key === "Escape" || e.key === "GoBack" || (e.key === "Backspace" && !typing)) { e.preventDefault(); goBack(); return; }
      if (typing && e.key === "Enter") {
        e.preventDefault();
        const f = dock.querySelector(".card:not([hidden])");
        if (f) { play(+f.dataset.j); enterFull(); }
        return;
      }
      if (typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      if (e.key === "PageUp" || e.key === "ChannelUp") { e.preventDefault(); play(cur - 1); markNow(false); return; }
      if (e.key === "PageDown" || e.key === "ChannelDown") { e.preventDefault(); play(cur + 1); markNow(false); return; }
      if (isFull() && !typing) {
        if (cursorEnabled()) {
          // Canal web: flechas mueven el cursor, OK toca en pantalla
          if (DIRS[e.key]) { e.preventDefault(); movePtr(DIRS[e.key]); return; }
          if (e.key === "Enter") { e.preventDefault(); tapPtr(); return; }
        } else if (e.key === "Enter" && !(document.activeElement && document.activeElement.tagName === "BUTTON")) {
          // Canal HLS: OK inicia la reproducción y activa el sonido
          const v = stage.querySelector("video");
          if (v) { e.preventDefault(); v.muted = false; v.play().then(() => { pstatus.textContent = "En vivo"; }).catch(() => {}); showHud(); return; }
        }
      }
      if (DIRS[e.key]) { e.preventDefault(); spatial(DIRS[e.key]); showHud(); }
      return;
    }
    const dir = DIRS[e.key];
    if (!dir) return;
    if (document.activeElement === q && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
    e.preventDefault(); spatial(dir);
  });

  render();
  const first = grid.querySelector(".card"); if (first && matchMedia("(hover:none)").matches === false) first.focus({ preventScroll: true });
})();