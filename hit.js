// 방문 기록 — 페이지를 열 때와 화면 안에서 주소가 바뀔 때(장소 상세 등) /api/hit로 1건씩 보냄.
// 관리 화면의 "이 브라우저 제외"를 켜면(localStorage cja_notrack) 보내지 않는다.
(function () {
    try { if (localStorage.getItem('cja_notrack')) return; } catch (e) {}
    var last = null;
    function send() {
        var p = location.pathname;
        if (p === last) return;
        var first = last === null;
        last = p;
        var body = JSON.stringify({ p: p, r: first ? document.referrer : '' });
        try {
            if (navigator.sendBeacon) navigator.sendBeacon('/api/hit', new Blob([body], { type: 'application/json' }));
            else fetch('/api/hit', { method: 'POST', body: body, keepalive: true });
        } catch (e) {}
    }
    var push = history.pushState;
    history.pushState = function () { push.apply(this, arguments); send(); };
    addEventListener('popstate', send);
    send();
})();
