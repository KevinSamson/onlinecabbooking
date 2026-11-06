-- Run after schema.sql when upgrading a database created from the original P1 schema.
USE online_cab_booking;
DELIMITER $$
CREATE PROCEDURE add_integrated_column(IN p_table_name VARCHAR(64), IN p_column_name VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = p_table_name AND column_name = p_column_name) THEN
    SET @statement = CONCAT('ALTER TABLE `', p_table_name, '` ADD COLUMN ', p_definition);
    PREPARE migration FROM @statement;
    EXECUTE migration;
    DEALLOCATE PREPARE migration;
  END IF;
END$$
DELIMITER ;
CALL add_integrated_column('rides', 'vehicle_category', "vehicle_category ENUM('economy','comfort','premium','xl') NOT NULL DEFAULT 'economy' AFTER vehicle_id");
CALL add_integrated_column('fare_splits', 'invite_token', 'invite_token CHAR(48) NULL UNIQUE AFTER total_amount');
CALL add_integrated_column('lost_found_reports', 'response', 'response TEXT NULL AFTER description');
CALL add_integrated_column('lost_found_reports', 'responded_by', 'responded_by BIGINT UNSIGNED NULL AFTER response');
CALL add_integrated_column('lost_found_reports', 'responded_at', 'responded_at TIMESTAMP NULL AFTER responded_by');
DROP PROCEDURE add_integrated_column;
DELIMITER $$
CREATE PROCEDURE add_integrated_lost_found_fk()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE() AND table_name = 'lost_found_reports'
        AND column_name = 'responded_by' AND referenced_table_name = 'users') THEN
    ALTER TABLE lost_found_reports ADD CONSTRAINT fk_lost_found_responded_by
      FOREIGN KEY (responded_by) REFERENCES users(id);
  END IF;
END$$
DELIMITER ;
CALL add_integrated_lost_found_fk();
DROP PROCEDURE add_integrated_lost_found_fk;
UPDATE rides r JOIN vehicles v ON v.id = r.vehicle_id SET r.vehicle_category = v.category;
