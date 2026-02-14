-- Migration: Add message_hash column to conversation_messages table
-- Date: January 5, 2026
-- Purpose: Fix MistakeTrackerService error - column "message_hash" does not exist

-- Add message_hash column to conversation_messages
ALTER TABLE conversation_messages 
  ADD COLUMN IF NOT EXISTS message_hash VARCHAR(64);

-- Add index for faster lookups on message_hash
CREATE INDEX IF NOT EXISTS idx_conversation_message_hash 
  ON conversation_messages(message_hash);

-- Add comment to column
COMMENT ON COLUMN conversation_messages.message_hash IS 'SHA-256 hash of message content for duplicate detection and pattern analysis';

-- Verify the column was added
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'conversation_messages' 
  AND column_name = 'message_hash';
