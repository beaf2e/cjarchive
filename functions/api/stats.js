// /api/stats — 방문 통계 조회 (관리 화면 전용)
// 인증: 어드민과 같은 GitHub 토큰. 저장소(beaf2e/cjarchive) 쓰기 권한이 있어야 통과.
const REPO = "beaf2e/cjarchive";

export async function onRequestGet({ request, env }) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !(await canWrite(token))) return json({ error: "unauthorized" }, 401);
  if (!env.STATS) return json({ error: "STATS 바인딩 없음" }, 500);

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days")) || 30, 1), 365);
  const now = Date.now();
  const since = now - days * 86400e3;
  const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  const db = env.STATS;
  const all = (sql, ...args) => db.prepare(sql).bind(...args).all().then((r) => r.results);
  const top = (col) =>
    all(
      `SELECT ${col} AS k, COUNT(*) AS views, COUNT(DISTINCT day || vid) AS visitors
       FROM hits WHERE ts >= ? GROUP BY ${col} ORDER BY visitors DESC, views DESC LIMIT 20`,
      since
    );

  const [totals, todayRow, daily, pages, refs, places, devices, browsers, hours, recent] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS views, COUNT(DISTINCT day || vid) AS visitors FROM hits WHERE ts >= ?").bind(since).first(),
    db.prepare("SELECT COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors FROM hits WHERE day = ?").bind(today).first(),
    all("SELECT day, COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors FROM hits WHERE ts >= ? GROUP BY day ORDER BY day", since),
    top("path"),
    top("COALESCE(ref, '')"),
    all(
      `SELECT country, region, city, COUNT(*) AS views, COUNT(DISTINCT day || vid) AS visitors
       FROM hits WHERE ts >= ? GROUP BY country, region, city ORDER BY visitors DESC, views DESC LIMIT 20`,
      since
    ),
    top("device"),
    top("browser"),
    all(
      `SELECT CAST(strftime('%H', ts / 1000 + 9 * 3600, 'unixepoch') AS INTEGER) AS h, COUNT(*) AS views
       FROM hits WHERE ts >= ? GROUP BY h`,
      since
    ),
    all(
      `SELECT ts, vid, path, ref, country, region, city, device, browser
       FROM hits ORDER BY ts DESC LIMIT 60`
    ),
  ]);

  return json({ days, today, totals, todayRow, daily, pages, refs, places, devices, browsers, hours, recent });
}

async function canWrite(token) {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "cjarchive-stats", Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return false;
    const repo = await res.json();
    return !!repo.permissions?.push;
  } catch {
    return false;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
