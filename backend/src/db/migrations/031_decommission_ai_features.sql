-- =============================================================================
-- Migration 031: Decommission AI Features — Archive & Cleanup
-- Created: 2026-10-27
-- Phase: 5 of the AI Decommissioning plan
-- Purpose: Remove all AI tables now that backend code no longer references them.
-- Safety rules:
--   - Drop in FK-dependency order (children before parents).
--   - Use IF EXISTS everywhere so this is safe to re-run on fresh DBs.
--   - NEVER touch: users, test_attempts, user_answers, writing_submissions,
--     speaking_submissions, tutor_grading_reports, tutor_feedback_reports,
--     or any table the live Tutor grading flow depends on.
--   - Drop the 'ai' value from grader_type enum only via a safe rename strategy
--     (Postgres does not support DROP ENUM VALUE; we deprecate it instead).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: speaking_analysis_artifacts
-- Child of ai_grading_jobs (source_job_id FK) and speaking_submissions.
-- Must be dropped BEFORE ai_grading_jobs.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS speaking_analysis_artifacts CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: ai_grading_reports
-- Has a soft FK to ai_grading_jobs (grading_job_id).
-- Must be dropped BEFORE ai_grading_jobs.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS ai_grading_reports CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: ai_grading_jobs
-- Parent of speaking_analysis_artifacts and ai_grading_reports.
-- References users(id) via user_id FK (ON DELETE CASCADE safe).
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS ai_grading_jobs CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: ai_usage_logs
-- References users(id) via user_id FK (ON DELETE SET NULL).
-- Standalone table — drop last among AI tables.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS ai_usage_logs CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: chatbot_messages / chatbot_sessions (Global AI Assistant)
-- chatbot_messages references chatbot_sessions; drop child first.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS chatbot_messages CASCADE;
DROP TABLE IF EXISTS chatbot_sessions CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Remove the submission_status enum value 'grading_failed'
-- Added in migration 025 purely for AI async pipeline.
-- Postgres does not support DROP VALUE on an enum directly.
-- We rename the enum and recreate it without the stale value, then swap.
-- Only execute if no row currently uses that value (safe guard).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  has_grading_failed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM writing_submissions  WHERE status::text = 'grading_failed'
    UNION ALL
    SELECT 1 FROM speaking_submissions WHERE status::text = 'grading_failed'
  ) INTO has_grading_failed;

  IF has_grading_failed THEN
    RAISE NOTICE 'Skipping submission_status cleanup: rows with grading_failed still exist. Migrate those rows first.';
  ELSE
    -- Rename old type so we can create a replacement
    ALTER TYPE submission_status RENAME TO submission_status_old;

    CREATE TYPE submission_status AS ENUM (
      'pending',
      'ai_graded',     -- keep for historical rows already in DB; new code never writes this
      'tutor_graded',
      'reviewed'
    );

    -- Migrate columns on both submission tables
    ALTER TABLE writing_submissions
      ALTER COLUMN status TYPE submission_status
        USING status::text::submission_status;

    ALTER TABLE speaking_submissions
      ALTER COLUMN status TYPE submission_status
        USING status::text::submission_status;

    DROP TYPE submission_status_old;

    RAISE NOTICE 'submission_status enum: removed grading_failed value successfully.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Record this migration in the applied_migrations table (if it exists)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO applied_migrations (filename)
  SELECT '031_decommission_ai_features.sql'
  WHERE NOT EXISTS (
    SELECT 1 FROM applied_migrations WHERE filename = '031_decommission_ai_features.sql'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'applied_migrations'
  );

COMMIT;
