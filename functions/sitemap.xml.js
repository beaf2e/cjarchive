// /sitemap.xml — places.json을 읽어 항상 최신 장소 목록으로 사이트맵 생성
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = url.origin;

  let places = [];
  try {
    const res = await env.ASSETS.fetch(new Request(new URL("/places.json", url)));
    if (res.ok) {
      const data = await res.json();
      places = data.places || [];
    }
  } catch (_) {
    /* 데이터 못 읽어도 고정 경로만으로 사이트맵은 생성 */
  }

  const entries = [
    { loc: `${origin}/`, priority: "1.0" },
    { loc: `${origin}/heritage`, priority: "0.8" },
    { loc: `${origin}/timeline`, priority: "0.6" },
    { loc: `${origin}/report.html`, priority: "0.5" },
    ...places.map((p) => ({
      loc: `${origin}/heritage/${encodeURIComponent(p.id)}`,
      priority: "0.7",
    })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((e) => `  <url><loc>${e.loc}</loc><priority>${e.priority}</priority></url>`)
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
