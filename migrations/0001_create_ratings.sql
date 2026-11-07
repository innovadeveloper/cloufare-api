CREATE TABLE story_ratings (
  story_id INTEGER NOT NULL,
  reader_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (story_id, reader_id)
) WITHOUT ROWID;
CREATE TABLE story_rating_stats (
  story_id INTEGER PRIMARY KEY,
  rating_sum INTEGER NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0)
);
CREATE TRIGGER rating_key_immutable BEFORE UPDATE OF story_id, reader_id ON story_ratings
WHEN OLD.story_id <> NEW.story_id OR OLD.reader_id <> NEW.reader_id
BEGIN SELECT RAISE(ABORT, 'rating key is immutable'); END;
CREATE TRIGGER rating_insert AFTER INSERT ON story_ratings BEGIN
  INSERT INTO story_rating_stats (story_id, rating_sum, rating_count) VALUES (NEW.story_id, NEW.rating, 1)
  ON CONFLICT(story_id) DO UPDATE SET rating_sum = rating_sum + NEW.rating, rating_count = rating_count + 1;
END;
CREATE TRIGGER rating_update AFTER UPDATE OF rating ON story_ratings WHEN OLD.rating <> NEW.rating BEGIN
  UPDATE story_rating_stats SET rating_sum = rating_sum - OLD.rating + NEW.rating WHERE story_id = NEW.story_id;
END;
CREATE TRIGGER rating_delete AFTER DELETE ON story_ratings BEGIN
  UPDATE story_rating_stats SET rating_sum = rating_sum - OLD.rating, rating_count = rating_count - 1 WHERE story_id = OLD.story_id;
END;
