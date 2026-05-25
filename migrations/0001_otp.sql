CREATE TABLE otp_observations (
  date          TEXT    NOT NULL,  -- 'YYYY-MM-DD' Denver time
  trip_hash     INTEGER NOT NULL,
  stop_id_hash  INTEGER NOT NULL,
  observed_at   INTEGER NOT NULL,  -- unix seconds, first STOPPED_AT
  scheduled_at  INTEGER NOT NULL,  -- unix seconds
  delay_seconds INTEGER NOT NULL,
  route         TEXT    NOT NULL,
  direction     TEXT    NOT NULL,
  PRIMARY KEY (date, trip_hash, stop_id_hash)
) WITHOUT ROWID;

CREATE INDEX idx_obs_date_route ON otp_observations(date, route);

CREATE TABLE otp_daily (
  date         TEXT    NOT NULL,
  route        TEXT    NOT NULL,
  direction    TEXT    NOT NULL,
  observations INTEGER NOT NULL,
  on_time      INTEGER NOT NULL,  -- |delay| <= 60s
  late         INTEGER NOT NULL,  -- 60s < delay <= 300s
  very_late    INTEGER NOT NULL,  -- delay > 300s
  PRIMARY KEY (date, route, direction)
) WITHOUT ROWID;
