// /api/hit — 페이지 조회 1건 기록 (hit.js가 보냄)
// IP는 저장하지 않는다. IP+브라우저+날짜를 비밀 소금과 함께 해시해 "하루 단위 익명 ID"만 남김.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|yeti|daum|python|curl|wget/i;

export async function onRequestPost({ request, env }) {
  const done = () => new Response(null, { status: 204 });
  if (!env.STATS) return done();

  const ua = request.headers.get("user-agent") || "";
  if (BOT.test(ua)) return done();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return done();
  }
  const path = String(body.p || "/").slice(0, 200);
  if (path.startsWith("/admin")) return done();

  const host = new URL(request.url).host;
  let ref = null;
  try {
    const r = new URL(body.r);
    if (r.host !== host) ref = r.host.replace(/^www\./, "");
  } catch {}

  const now = Date.now();
  const day = new Date(now + 9 * 3600e3).toISOString().slice(0, 10); // KST
  const cf = request.cf || {};
  const ip = request.headers.get("cf-connecting-ip") || "";
  const vid = (await sha256(`${await salt(env)}|${ip}|${ua}|${day}`)).slice(0, 10);

  await env.STATS.prepare(
    "INSERT INTO hits (ts, day, vid, path, ref, country, region, city, device, browser) VALUES (?,?,?,?,?,?,?,?,?,?)"
  )
    .bind(now, day, vid, path, ref, cf.country || null, cf.region || null, cf.city || null, device(ua), browser(ua))
    .run();

  // 가끔 400일 지난 기록 정리
  if (Math.random() < 0.01) {
    await env.STATS.prepare("DELETE FROM hits WHERE ts < ?").bind(now - 400 * 86400e3).run();
  }
  return done();
}

async function salt(env) {
  const row = await env.STATS.prepare("SELECT v FROM meta WHERE k = 'salt'").first();
  if (row) return row.v;
  const v = crypto.randomUUID();
  await env.STATS.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('salt', ?)").bind(v).run();
  return (await env.STATS.prepare("SELECT v FROM meta WHERE k = 'salt'").first()).v;
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function device(ua) {
  if (/iPad|Tablet/i.test(ua)) return "태블릿";
  if (/Mobi|iPhone|Android/i.test(ua)) return "모바일";
  return "데스크톱";
}

// 인앱 브라우저를 먼저 본다 — "어디서 링크를 눌렀는지"가 드러나는 부분
function browser(ua) {
  const list = [
    [/KAKAOTALK/i, "카카오톡"],
    [/Instagram/i, "인스타그램"],
    [/FBAN|FBAV/i, "페이스북"],
    [/NAVER\(inapp|NAVER/i, "네이버 앱"],
    [/Line\//i, "라인"],
    [/Whale/i, "웨일"],
    [/SamsungBrowser/i, "삼성 인터넷"],
    [/Edg\//i, "엣지"],
    [/Firefox|FxiOS/i, "파이어폭스"],
    [/Chrome|CriOS/i, "크롬"],
    [/Safari/i, "사파리"],
  ];
  for (const [re, name] of list) if (re.test(ua)) return name;
  return "기타";
}
