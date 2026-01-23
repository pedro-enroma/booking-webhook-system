-- Add language column to activities table
-- This captures the language/locale from Bokun OCTO API

ALTER TABLE activities
ADD COLUMN IF NOT EXISTS language VARCHAR(10);

COMMENT ON COLUMN activities.language IS 'Language/locale code from Bokun (e.g., es_ES, en_US)';
