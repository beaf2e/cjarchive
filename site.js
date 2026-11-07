// 사이트 공통 동작 — 이미지, 링크, 글자를 끌어서 옮기지 못하게 (파이어폭스까지)
document.addEventListener('dragstart', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
});

/* 브라우저 뒤로 가기, 앞으로 가기 막기
   - 페이지에 들어오면 같은 주소의 기록을 한 칸 더 쌓아 두고(맨 아래 칸 = 받침),
     뒤로, 앞으로 가기로 기록이 움직이면 원래 칸으로 되돌린다.
   - 사이트 코드가 직접 부르는 history.back(), go()는 그대로 통과(상세 닫기 등).
   - 크롬은 사용자 동작 없이 쌓은 기록을 뒤로 가기에서 건너뛰므로, 첫 클릭이나 키 입력 때 쌓는다. */
(function () {
    var H = window.history, KEY = '__g';
    var push = H.pushState.bind(H), replace = H.replaceState.bind(H), go = H.go.bind(H);
    var idx = function (st) { return st && typeof st[KEY] === 'number' ? st[KEY] : 0; };
    var stamp = function (st, n) { var o = {}; if (st && typeof st === 'object') for (var k in st) o[k] = st[k]; o[KEY] = n; return o; };
    var cur = idx(H.state);
    var armed = cur >= 1;   // 새로고침하면 쌓아 둔 기록이 그대로 남아 있음
    var allow = 0;          // 사이트 코드가 직접 움직인 횟수만큼 통과
    window.addEventListener('pageshow', function () { allow = 0; });

    H.pushState = function (st, t, url) { cur++; return push(stamp(st, cur), t, url); };
    H.replaceState = function (st, t, url) { return replace(stamp(st, cur), t, url); };
    H.go = function (n) {
        n = +n || 0;
        if (!n) return go(0);
        if (armed && cur + n <= 0) n--;   // 받침 칸은 건너뛰고 진짜 이전 페이지로
        allow++;
        go(n);
    };
    H.back = function () { H.go(-1); };
    H.forward = function () { H.go(1); };

    function arm() {
        if (armed) return;
        armed = true;
        replace(stamp(H.state, 0), '');
        cur = 0;
        H.pushState(H.state, '');
    }
    ['pointerdown', 'pointerup', 'keydown', 'touchend'].forEach(function (ev) {
        window.addEventListener(ev, arm, { capture: true, passive: true });
    });

    // 사이트 코드의 popstate 처리보다 먼저 받아서, 브라우저가 움직인 것이면 되돌리고 감춘다
    window.addEventListener('popstate', function (e) {
        var to = idx(e.state);
        if (to === cur) { e.stopImmediatePropagation(); return; }   // 되돌리기가 끝난 자리
        if (allow > 0) { allow--; cur = to; return; }
        e.stopImmediatePropagation();
        go(cur - to);
    }, true);

    // 마우스 옆 버튼(뒤로, 앞으로), 키보드 단축키(Alt+←→, ⌘[ ⌘], 백스페이스)
    var side = function (e) { if (e.button === 3 || e.button === 4) e.preventDefault(); };
    window.addEventListener('mouseup', side, true);
    window.addEventListener('mousedown', side, true);
    window.addEventListener('keydown', function (e) {
        var k = e.key, t = e.target;
        var typing = t && t.closest && t.closest('input, textarea, select, [contenteditable]');
        if ((e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) ||
            (e.metaKey && (k === '[' || k === ']')) ||
            (k === 'Backspace' && !typing)) e.preventDefault();
    }, true);
})();
