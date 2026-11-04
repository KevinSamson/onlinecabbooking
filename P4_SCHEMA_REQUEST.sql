-- P4 integration request for P1. DO NOT apply independently.
-- P1 owns schema.sql. Please review and incorporate these columns into the shared schema.
ALTER TABLE fare_splits
  ADD COLUMN invite_token CHAR(48) NULL UNIQUE;

ALTER TABLE lost_found_reports
  ADD COLUMN response TEXT NULL,
  ADD COLUMN responded_by BIGINT UNSIGNED NULL,
  ADD COLUMN responded_at TIMESTAMP NULL,
  ADD CONSTRAINT fk_lost_found_responded_by
    FOREIGN KEY (responded_by) REFERENCES users(id);
