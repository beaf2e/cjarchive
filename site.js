// 사이트 공통 동작 — 이미지, 링크, 글자를 끌어서 옮기지 못하게 (파이어폭스까지)
document.addEventListener('dragstart', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
});
