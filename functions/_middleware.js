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

  // SPA 라우트: /heritage(목록), /timeline → index.html이 처리(클라이언트 라우팅)
  if (p === "/heritage" || p === "/heritage/" || p === "/timeline") {
    const indexUrl = new URL("/index.html", url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  }

  // 그 외(실제 파일, /, /admin, /404.html 등)는 기본 정적 서빙으로
  return next();
}

// index.html을 장소별 OG/공유 메타로 다시 써서 서빙
async function serveWithPlaceMeta(id, url, request, env) {
  const origin = url.origin;
  const indexReq = new Request(new URL("/index.html", url), request);
  let indexRes;
  try {
    indexRes = await env.ASSETS.fetch(indexReq);

    const dataRes = await env.ASSETS.fetch(new Request(new URL("/places.json", url)));
    const data = dataRes.ok ? await dataRes.json() : {};
    const place = (data.places || []).find((pl) => pl.id === id);

    // 없는 장소면 기본 index 그대로 (클라이언트가 /404로 보냄)
    if (!place) return indexRes;

    const title = `${place.title} | Cheongju Archive`;
    const desc = String(place.cardTagline || place.tagline || place.intro?.p || "청주의 디지털 유산 아카이브")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const image = toAbsolute(place.img, origin);
    const pageUrl = `${origin}/heritage/${encodeURIComponent(id)}`;

    return new HTMLRewriter()
      .on("title", new TextSetter(title))
      .on('meta[name="description"]', new AttrSetter("content", desc))
      .on('meta[property="og:title"]', new AttrSetter("content", title))
      .on('meta[property="og:description"]', new AttrSetter("content", desc))
      .on('meta[property="og:url"]', new AttrSetter("content", pageUrl))
      .on('meta[property="og:image"]', new AttrSetter("content", image))
      .on('meta[property="og:type"]', new AttrSetter("content", "article"))
      .on('meta[name="twitter:title"]', new AttrSetter("content", title))
      .on('meta[name="twitter:description"]', new AttrSetter("content", desc))
      .on('meta[name="twitter:image"]', new AttrSetter("content", image))
      .transform(indexRes);
  } catch (e) {
    // 무슨 일이 있어도 페이지 자체는 떠야 하므로 기본 index로 폴백
    return indexRes || env.ASSETS.fetch(indexReq);
  }
}

function toAbsolute(src, origin) {
  if (!src) return `${origin}/og-image.jpg`;
  if (/^https?:/i.test(src)) return src;
  return origin + (src.startsWith("/") ? src : "/" + src);
}

class AttrSetter {
  constructor(attr, value) {
    this.attr = attr;
    this.value = value;
  }
  element(el) {
    el.setAttribute(this.attr, this.value);
  }
}

class TextSetter {
  constructor(text) {
    this.text = text;
  }
  element(el) {
    el.setInnerContent(this.text);
  }
}
