-- 방문 통계 (cjarchive-stats). IP는 저장하지 않고, 하루 단위로 바뀌는 익명 ID만 남김.
CREATE TABLE IF NOT EXISTS hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,          -- ms
  day TEXT NOT NULL,            -- KST YYYY-MM-DD
  vid TEXT NOT NULL,            -- 익명 방문자 ID (해시, 매일 바뀜)
  path TEXT NOT NULL,
  ref TEXT,                     -- 유입 출처 호스트
  country TEXT,
  region TEXT,
  city TEXT,
  device TEXT,
  browser TEXT
);
CREATE INDEX IF NOT EXISTS hits_day ON hits(day);
CREATE INDEX IF NOT EXISTS hits_ts ON hits(ts);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
