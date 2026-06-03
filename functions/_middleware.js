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

  // SPA 라우트: /heritage, /heritage/<id>, /timeline → index.html이 처리(클라이언트 라우팅)
  if (p === "/heritage" || p.startsWith("/heritage/") || p === "/timeline") {
    const indexUrl = new URL("/index.html", url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  }

  // 그 외(실제 파일, /, /admin, /404.html 등)는 기본 정적 서빙으로
  return next();
}
