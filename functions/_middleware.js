// Cloudflare Pages Functions — 라우팅 미들웨어
// _redirects의 와일드카드 200 rewrite가 이 프로젝트에서 동작하지 않아,
// SPA 경로 처리를 Functions로 옮김.
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const p = url.pathname;

  // 구글 서치콘솔 소유 확인 파일 — Pages가 .html을 확장자 없는 주소로 308 넘기므로 여기서 직접 응답
  if (p === "/googled19b34fdf65d4108.html") {
    return new Response("google-site-verification: googled19b34fdf65d4108.html", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // 옛 주소 호환: /place/<id> → /heritage/<id> (301)
  if (p.startsWith("/place/")) {
    url.pathname = "/heritage/" + p.slice("/place/".length);
    return Response.redirect(url.toString(), 301);
  }

  // 개별 장소 상세: index.html을 가져와 해당 장소의 공유 카드(OG) 태그를 주입.
  // 이렇게 해야 /heritage/<id> 링크를 공유했을 때 그 장소의 사진·제목이 미리보기로 뜸.
  const placeMatch = p.match(/^\/heritage\/([^\/]+)\/?$/);
  if (placeMatch) {
    return serveWithPlaceMeta(decodeURIComponent(placeMatch[1]), url, request, env);
  }

  // 전체 기록: 홈 HTML에 제목, canonical, 장소 목록(링크)을 넣어 서빙
  if (p === "/heritage" || p === "/heritage/") {
    return serveArchive(url, env);
  }

  // /timeline, /about 은 독립 페이지(timeline.html, about.html) — Pages 클린 URL이 그대로 서빙

  // 문의는 별도 페이지(contact.html). Pages 기본 클린URL이 /contact → contact.html 로
  // 서빙하므로 그대로 통과시킨다. (env.ASSETS로 /contact.html 을 가져오면 Pages가 /contact 로
  // 308 정규화 → 무한 리다이렉트가 되므로 절대 가로채지 말 것)
  if (p === "/contact" || p === "/contact/") {
    return next();
  }

  // 루트 직접 진입 단축주소: /<장소ID> 또는 /<순번> → 해당 장소 상세로 (canonical /heritage/<id>)
  // 예) /cbdc, /1 → /heritage/cbdc  (실제 파일/폴더는 확장자·슬래시가 있어 여기 안 걸림)
  const rootSeg = p.match(/^\/([^\/.]+)\/?$/);
  if (rootSeg) {
    const place = await findPlaceBySlug(decodeURIComponent(rootSeg[1]), url, env);
    if (place) {
      url.pathname = "/heritage/" + encodeURIComponent(place.id);
      return Response.redirect(url.toString(), 301);
    }
  }

  // 그 외(실제 파일, /, /admin, /404.html 등)는 기본 정적 서빙으로
  return next();
}

// 루트 세그먼트를 장소로 해석 — 장소 id(대소문자 무시) 또는 순번(order) 일치 시 그 장소 반환
async function findPlaceBySlug(seg, url, env) {
  try {
    const res = await env.ASSETS.fetch(new Request(new URL("/places.json", url)));
    if (!res.ok) return null;
    const data = await res.json();
    const places = data.places || [];
    const low = seg.toLowerCase();
    const isNum = /^\d+$/.test(seg);
    return places.find((p) =>
      String(p.id).toLowerCase() === low ||
      (isNum && Number(p.order) === Number(seg))
    ) || null;
  } catch {
    return null;
  }
}

// 홈 HTML을 텍스트로 읽어 장소별 OG/공유 메타로 치환해 서빙.
// HTMLRewriter는 압축 스트림을 못 읽어 실패 → .text()(자동 압축해제) + 문자열 치환 방식.
async function serveWithPlaceMeta(id, url, request, env) {
  const origin = url.origin;
  const serveHome = () => env.ASSETS.fetch(new Request(new URL("/", url)));
  try {
    const dataRes = await env.ASSETS.fetch(new Request(new URL("/places.json", url)));
    const data = dataRes.ok ? await dataRes.json() : {};
    const place = (data.places || []).find((pl) => pl.id === id);
    if (!place) return serveHome();

    let html = await (await serveHome()).text();
    // 예상치 못한 본문(빈 값·압축 미해제 등)이면 안전하게 원본 그대로
    if (!html || !html.includes("<title>")) return serveHome();

    const esc = (s) =>
      String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const title = esc(`${place.title} | Cheongju Archive`);
    const desc = esc(
      String(place.cardTagline || place.tagline || place.intro?.p || "청주의 디지털 유산 아카이브")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160)
    );
    const image = esc(toAbsolute(place.img, origin));
    // 미리보기 배포 주소에서도 대표 주소는 항상 본 사이트
    const pageUrl = esc(`https://cjarchive.pages.dev/heritage/${encodeURIComponent(id)}`);

    html = html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
      .replace(/(<meta name="description" content=")[^"]*"/, `$1${desc}"`)
      .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${title}"`)
      .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${desc}"`)
      .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${pageUrl}"`)
      .replace(/(<meta property="og:image" content=")[^"]*"/, `$1${image}"`)
      .replace(/(<meta property="og:type" content=")[^"]*"/, `$1article"`)
      .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${title}"`)
      .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${desc}"`)
      .replace(/(<meta name="twitter:image" content=")[^"]*"/, `$1${image}"`)
      .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${pageUrl}"`)
      // 본문을 HTML에 미리 넣어 둠 — JS를 실행하지 않는 수집봇(네이버 등)도 내용을 읽도록.
      // 상세 화면은 처음에 숨겨져 있고, JS가 열 때 renderDetail()이 이 자리를 통째로 덮어씀.
      .replace('<div id="detail-content"></div>', `<div id="detail-content">${placeArticle(place, esc)}</div>`);

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (e) {
    return serveHome();
  }
}

async function serveArchive(url, env) {
  const serveHome = () => env.ASSETS.fetch(new Request(new URL("/", url)));
  try {
    const dataRes = await env.ASSETS.fetch(new Request(new URL("/places.json", url)));
    const places = ((dataRes.ok ? await dataRes.json() : {}).places || [])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    let html = await (await serveHome()).text();
    if (!html || !html.includes("<title>")) return serveHome();

    const esc = (s) =>
      String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const title = "전체 기록 | Cheongju Archive";
    const desc = esc(`청주의 문화유산 ${places.length}곳의 기록: ${places.map((p) => p.title).join(", ")}`.slice(0, 160));
    const pageUrl = "https://cjarchive.pages.dev/heritage";
    // JS가 같은 자리를 다시 그리므로, 여기서는 수집봇이 읽을 링크 목록만
    const list = places
      .map(
        (p) =>
          `<a class="card" href="/heritage/${encodeURIComponent(p.id)}"><img src="/${esc(p.img)}" alt="${esc(p.title)}" loading="lazy"><div class="card-overlay"><div class="card-eyebrow">${esc(p.cardEyebrow || "")}</div><h3>${esc(p.title)}</h3><p class="card-tagline">${esc(p.cardTagline || "")}</p></div></a>`
      )
      .join("");

    html = html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
      .replace(/(<meta name="description" content=")[^"]*"/, `$1${desc}"`)
      .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${title}"`)
      .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${desc}"`)
      .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${pageUrl}"`)
      .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${title}"`)
      .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${desc}"`)
      .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${pageUrl}"`)
      .replace('<div class="archive-grid" id="archiveGrid"></div>', `<div class="archive-grid" id="archiveGrid">${list}</div>`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch (e) {
    return serveHome();
  }
}

// 수집봇용 장소 본문 — 제목, 개요, 수치, 소개, 특징, 인용을 의미 있는 태그로
function placeArticle(place, esc) {
  const text = (s) => esc(s).replace(/\n/g, " ");
  const stats = (place.stats || [])
    .map((s) => `<li>${esc(s.label)}: ${esc(s.value)}</li>`)
    .join("");
  const features = (place.features || [])
    .map((f) => `<section><h3>${text(f.h)}</h3><p>${esc(f.p)}</p></section>`)
    .join("");
  return (
    `<article>` +
    `<h1>${esc(place.title)}</h1>` +
    (place.detailEyebrow ? `<p>${esc(place.detailEyebrow)}</p>` : "") +
    (place.tagline ? `<p>${esc(place.tagline)}</p>` : "") +
    (stats ? `<ul>${stats}</ul>` : "") +
    (place.intro ? `<section><h2>${text(place.intro.h)}</h2><p>${esc(place.intro.p)}</p></section>` : "") +
    ((place.explain || []).length ? `<section><h2>해설</h2>${place.explain.map((t) => `<p>${esc(t)}</p>`).join("")}</section>` : "") +
    ((place.info || []).length ? `<dl>${place.info.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join("")}</dl>` : "") +
    (place.term?.word ? `<section><h3>${esc(place.term.word)}</h3><p>${esc(place.term.desc)}</p></section>` : "") +
    features +
    (place.quote?.text ? `<blockquote>${esc(place.quote.text)}</blockquote>` : "") +
    `</article>`
  );
}

function toAbsolute(src, origin) {
  if (!src) return `${origin}/og-image.jpg`;
  if (/^https?:/i.test(src)) return src;
  return origin + (src.startsWith("/") ? src : "/" + src);
}
