-- Add explicit columns for commonly queried profile fields
-- These were previously stored only in JSONB (personality_traits, food_preferences)
-- but are frequently filtered/queried, so separate columns improve performance

DO $$ 
BEGIN
  -- Spice level (was in personality_traits JSONB)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'spice_level'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN spice_level VARCHAR(20);
    COMMENT ON COLUMN user_profiles.spice_level IS 'mild, medium, hot, extra-hot';
  END IF;

  -- Preferred area in Nashik
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'preferred_area'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN preferred_area VARCHAR(100);
    COMMENT ON COLUMN user_profiles.preferred_area IS 'User preferred delivery area in Nashik';
  END IF;

  -- Language preference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'language_preference'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN language_preference VARCHAR(10) DEFAULT 'hinglish';
    COMMENT ON COLUMN user_profiles.language_preference IS 'en, hi, hinglish, mr';
  END IF;

  -- Family size (for portion/quantity recommendations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'family_size'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN family_size INTEGER;
    COMMENT ON COLUMN user_profiles.family_size IS 'Number of family members';
  END IF;

  -- Occupation (student/professional — affects recommendations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'occupation'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN occupation VARCHAR(50);
    COMMENT ON COLUMN user_profiles.occupation IS 'student, professional, homemaker, etc.';
  END IF;

  -- Age group
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'age_group'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN age_group VARCHAR(20);
    COMMENT ON COLUMN user_profiles.age_group IS '18-25, 26-35, 36-45, 45+';
  END IF;

  -- Last profile question asked timestamp (for progressive profiling rate limiting)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'last_profile_question_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN last_profile_question_at TIMESTAMP;
  END IF;

  -- Profile questions asked this week counter
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'profile_questions_this_week'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN profile_questions_this_week INTEGER DEFAULT 0;
  END IF;
END $$;
