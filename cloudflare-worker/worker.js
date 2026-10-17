// Prototipo de proxy para la skill de Alexa "La Guarida de Loba" (Cloudflare Worker).
//
// Por qué existe: el servidor del stream (listen2myradio) solo sirve audio a una IP DESPUÉS de que
// esa IP haya llamado a `openfire.ajax.php?radio_id=...` (la web lo hace al cargar y cada 100 min;
// abre el cortafuegos del stream para REMOTE_ADDR y devuelve la URL del abrir-cortafuegos con esa IP).
// El Echo no puede hacer esa llamada, así que este Worker la hace desde su propia IP de salida y
// retransmite el audio por HTTPS.
//
//   /debug?k=<DEBUG_KEY>   -> JSON: por ronda, IP que ve la radio (REMOTE_ADDR) y resultado del stream
//   /live.mp3              -> repite "abrir puerta -> esperar -> pedir stream" hasta que llegue audio

const DEBUG_KEY = "cambia-esto";
const HOME = "https://laguaridadeloba.radio12345.com/";
const RADIO_ID = "3390014";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const URL_RE = /id="urladdress">\s*([^<\s]+)/;
const LIVE_RE = /^https:\/\/[^/]+\.listen2myradio\.com\/live\.mp3\?typeportmount=/;
const REMOTE_ADDR_RE = /REMOTE_ADDR=([^&\s]*)/;
const ROUND_WAIT_MS = 3000;
const MAX_ROUNDS = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cookieHeader(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie") || ""];
  return list.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
}

// Carga la home: URL del stream (si está en directo) y cookie de sesión.
async function loadHome() {
  const home = await fetch(HOME, { headers: { "User-Agent": UA } });
  const html = await home.text();
  const match = html.match(URL_RE);
  const streamUrl = match ? match[1].replace(/&amp;/g, "&") : "";
  return { live: LIVE_RE.test(streamUrl), streamUrl, cookie: cookieHeader(home), status: home.status };
}

// La "puerta": la llamada que hace la página. Devuelve la IP que ha visto la radio.
async function callOpenfire(cookie) {
  const res = await fetch(HOME + "openfire.ajax.php?radio_id=" + RADIO_ID, {
    method: "POST",
    headers: { "User-Agent": UA, Referer: HOME, Cookie: cookie },
  });
  const body = await res.text();
  const m = body.match(REMOTE_ADDR_RE);
  return { status: res.status, remoteAddr: m ? m[1] : null, body: m ? undefined : body.slice(0, 120) };
}

// Pide el stream y lee hasta 4 KB. Con la puerta cerrada devuelve text/html de 1 byte.
async function probeStream(streamUrl) {
  const res = await fetch(streamUrl, { headers: { "User-Agent": UA } });
  const reader = res.body.getReader();
  let bytes = 0;
  while (bytes < 4096) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
  }
  await reader.cancel();
  return { status: res.status, type: res.headers.get("content-type"), bytes };
}

async function debug(url) {
  if (url.searchParams.get("k") !== DEBUG_KEY) return new Response("no", { status: 403 });
  const out = {};
  const home = await loadHome();
  out.home = { live: home.live, status: home.status, cookieBytes: home.cookie.length };
  if (home.live) {
    out.rounds = [];
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const door = await callOpenfire(home.cookie);
      await sleep(ROUND_WAIT_MS);
      const stream = await probeStream(home.streamUrl);
      out.rounds.push({ round: i + 1, door, stream });
      if (stream.type && stream.type.includes("audio")) break;
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
}

async function live() {
  const home = await loadHome();
  if (!home.live) return new Response("La radio no está emitiendo", { status: 503 });
  for (let i = 0; i < MAX_ROUNDS; i++) {
    await callOpenfire(home.cookie);
    await sleep(ROUND_WAIT_MS);
    const upstream = await fetch(home.streamUrl, { headers: { "User-Agent": UA } });
    const type = upstream.headers.get("content-type") || "";
    if (upstream.ok && type.includes("audio")) {
      return new Response(upstream.body, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
    }
    await upstream.body?.cancel();
  }
  return new Response("El stream no ha dado audio", { status: 502 });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/debug") return debug(url);
    if (url.pathname === "/live.mp3") return live();
    return new Response("La Guarida de Loba - proxy", { status: 200 });
  },
};
