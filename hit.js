// 방문 기록 — 페이지를 열 때와 화면 안에서 주소가 바뀔 때(장소 상세 등) /api/hit로 1건씩 보냄.
// 관리 화면에 로그인했거나 ?notrack=1 로 한 번 들어온 브라우저(localStorage cja_notrack)는 보내지 않는다.
(function () {
    try {
        var m = location.search.match(/[?&]notrack=([01])/);
        if (m) {
            m[1] === '1' ? localStorage.setItem('cja_notrack', '1') : localStorage.removeItem('cja_notrack');
            history.replaceState(history.state, '', location.pathname + location.hash);
        }
        if (localStorage.getItem('cja_notrack')) return;
    } catch (e) {}
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
