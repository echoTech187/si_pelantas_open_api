-- ============================================================================
-- 002_inspection_logs_and_feedbacks.sql
-- TABEL LOG AUDIT SIDAK/ARAHAN KAMSEL & SISTEM FEEDBACK GURU BK
-- Mematuhi Aturan Emas RULES.md (Zero Regression, Strict Foreign Keys & Indexes)
-- ============================================================================

-- 1. TABEL LOG AUDIT TERPISAH SIDAK & ARAHAN PEMBINAAN KAMSEL
CREATE TABLE IF NOT EXISTS kamsel_inspection_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES kamsel_evaluation_cycles(id) ON DELETE SET NULL,
  kamsel_account_id UUID NOT NULL REFERENCES police_accounts(id) ON DELETE RESTRICT,
  bk_account_id UUID REFERENCES school_bk_accounts(id) ON DELETE SET NULL,
  inspection_sequence INT NOT NULL CHECK (inspection_sequence >= 1),
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  counseling_topic VARCHAR(200) NOT NULL,
  kamsel_directive_summary TEXT NOT NULL,
  school_evaluation_result TEXT,
  school_follow_up_commitment TEXT,
  student_attendee_count INT DEFAULT 0,
  violation_count_at_visit INT NOT NULL DEFAULT 0,
  violations_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  documentation_photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeks untuk pencarian cepat riwayat sidak per sekolah & petugas
CREATE INDEX IF NOT EXISTS idx_kamsel_inspection_school_seq 
  ON kamsel_inspection_logs (school_id, inspection_sequence DESC);

CREATE INDEX IF NOT EXISTS idx_kamsel_inspection_officer 
  ON kamsel_inspection_logs (kamsel_account_id, created_at DESC);

-- 2. TABEL FEEDBACK GURU BK UNTUK PETUGAS UNIT KAMSEL
CREATE TABLE IF NOT EXISTS kamsel_counseling_feedbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_log_id UUID UNIQUE NOT NULL REFERENCES kamsel_inspection_logs(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  bk_account_id UUID NOT NULL REFERENCES school_bk_accounts(id) ON DELETE RESTRICT,
  kamsel_account_id UUID NOT NULL REFERENCES police_accounts(id) ON DELETE RESTRICT,
  rating_stars INT NOT NULL CHECK (rating_stars >= 1 AND rating_stars <= 5),
  clarity_rating INT CHECK (clarity_rating >= 1 AND clarity_rating <= 5),
  helpfulness_rating INT CHECK (helpfulness_rating >= 1 AND helpfulness_rating <= 5),
  attitude_rating INT CHECK (attitude_rating >= 1 AND attitude_rating <= 5),
  feedback_notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeks untuk leaderboard performa feedback petugas Kamsel
CREATE INDEX IF NOT EXISTS idx_kamsel_feedbacks_officer_stars 
  ON kamsel_counseling_feedbacks (kamsel_account_id, rating_stars DESC);

CREATE INDEX IF NOT EXISTS idx_kamsel_feedbacks_school 
  ON kamsel_counseling_feedbacks (school_id, created_at DESC);

