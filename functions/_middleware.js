// Cloudflare Pages Functions — 라우팅 미들웨어
// _redirects의 와일드카드 200 rewrite가 이 프로젝트에서 동작하지 않아,
// SPA 경로 처리를 Functions로 옮김.
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const p = url.pathname;

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

  // SPA 라우트: /heritage(목록), /timeline → 홈 HTML을 서빙(클라이언트 라우팅이 처리)
  // 주의: "/index.html"은 Cloudflare Pages가 "/"로 308 정규화하므로 홈("/")을 직접 서빙해야 함
  if (p === "/heritage" || p === "/heritage/" || p === "/timeline" || p === "/about") {
    return env.ASSETS.fetch(new Request(new URL("/", url), request));
  }

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
    const pageUrl = esc(`${origin}/heritage/${encodeURIComponent(id)}`);

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
      .replace(/(<meta name="twitter:image" content=")[^"]*"/, `$1${image}"`);

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

function toAbsolute(src, origin) {
  if (!src) return `${origin}/og-image.jpg`;
  if (/^https?:/i.test(src)) return src;
  return origin + (src.startsWith("/") ? src : "/" + src);
}
