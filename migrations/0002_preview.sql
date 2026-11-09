-- Used only by the managed demonstration preview.
CREATE TABLE IF NOT EXISTS demo_installation (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  install_owner TEXT NOT NULL
);
