CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  draft TEXT NOT NULL CHECK(json_valid(draft)),
  live TEXT CHECK(live IS NULL OR json_valid(live)),
  live_slug TEXT UNIQUE,
  live_media TEXT NOT NULL DEFAULT '[]',
  published_at TEXT,
  updated_at TEXT NOT NULL,
  trashed INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  CHECK((live IS NULL) = (live_slug IS NULL))
);
CREATE INDEX IF NOT EXISTS published_dates ON posts(published_at DESC) WHERE live IS NOT NULL;
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  data TEXT NOT NULL CHECK(json_valid(data)),
  media TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  variants TEXT NOT NULL DEFAULT '[]'
);
