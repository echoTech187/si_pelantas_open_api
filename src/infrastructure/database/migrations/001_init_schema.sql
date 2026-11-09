-- ============================================================================
-- SKEMA DATABASE TERNORMALISASI (3NF) & STRICT INDEXING
-- PEMISAHAN FISIK AKUN INSTANSI KEPOLISIAN (POLANTAS & UNIT_KAMSEL)
-- DAN AKUN INSTANSI SEKOLAH (GURU_BK TIAP SEKOLAH)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
CREATE TYPE police_role_type AS ENUM (
  'POLANTAS',      -- Petugas Polisi Lalu Lintas di lapangan (Penindak/Pencatat Tilang)
  'UNIT_KAMSEL'    -- Petugas Unit Keamanan & Keselamatan Satlantas (Koordinator Penyuluhan & Evaluasi)
);

CREATE TYPE police_unit_division AS ENUM (
  'TURJAWALI_LANTAS',
  'GAKKUM_LANTAS',
  'UNIT_KAMSEL'
);

CREATE TYPE institution_type AS ENUM (
  'POLRI',         -- Instansi Kepolisian (Polres Mojokerto)
  'SCHOOL_BK'      -- Instansi Sekolah (Guru BK SMA/SMK/MA Mojokerto)
);

CREATE TYPE school_education_level AS ENUM ('SMA', 'SMK', 'MA');

CREATE TYPE mojokerto_region_type AS ENUM ('KABUPATEN_MOJOKERTO', 'KOTA_MOJOKERTO');

CREATE TYPE kamsel_cycle_status AS ENUM (
  'AMAN',                          -- < 5 Pelanggar
  'SIAGA_5_PELANGGAR',             -- 5 s/d 6 Pelanggar (Warning / Siaga Pembinaan)
  'WAJIB_PENYULUHAN_7_PELANGGAR',  -- >= 7 Pelanggar (Wajib Dikunjungi Unit Kamsel)
  'SELESAI_DIEVALUASI'             -- Siklus ditutup setelah Unit Kamsel datang penyuluhan & evaluasi
);

CREATE TYPE notification_channel_type AS ENUM ('FCM', 'WABLAS');

CREATE TYPE notification_delivery_status AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- ----------------------------------------------------------------------------
-- 1. TABEL MASTER KECAMATAN WILAYAH MOJOKERTO (3NF)
-- ----------------------------------------------------------------------------
CREATE TABLE districts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bps_code VARCHAR(15) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  region_type mojokerto_region_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. TABEL MASTER SEKOLAH (3NF)
-- ----------------------------------------------------------------------------
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  npsn VARCHAR(20) UNIQUE NOT NULL CHECK (npsn ~ '^[0-9]{8}$'),
  name VARCHAR(150) NOT NULL,
  education_level school_education_level NOT NULL,
  district_id UUID NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  address TEXT NOT NULL,
  official_phone VARCHAR(25),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. TABEL AKUN INSTANSI KEPOLISIAN (`police_accounts` - KHUSUS APP POLRI)
-- Dipisahkan secara fisik dari akun sekolah karena berbeda instansi & aturan kredensial (NRP)
-- Mencakup 2 Role Polri: 'POLANTAS' dan 'UNIT_KAMSEL'
-- ----------------------------------------------------------------------------
CREATE TABLE police_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nrp VARCHAR(25) UNIQUE NOT NULL CHECK (nrp ~ '^[0-9]{8,12}$'),
  username VARCHAR(60) UNIQUE NOT NULL CHECK (char_length(username) >= 4),
  password_hash TEXT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  rank_title VARCHAR(40) NOT NULL, -- contoh: Bripda, Briptu, Brigadir, Bripka, Aipda, Ipda, Iptu
  role police_role_type NOT NULL,
  division police_unit_division NOT NULL,
  sector_area VARCHAR(100) NOT NULL DEFAULT 'Wilayah Hukum Polres Mojokerto',
  phone_wa VARCHAR(25) NOT NULL CHECK (phone_wa ~ '^628[0-9]{7,13}$'),
  fcm_token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraint integritas role vs divisi kepolisian:
  CONSTRAINT chk_police_role_division CHECK (
    (role = 'UNIT_KAMSEL' AND division = 'UNIT_KAMSEL') OR
    (role = 'POLANTAS' AND division IN ('TURJAWALI_LANTAS', 'GAKKUM_LANTAS'))
  )
);

-- ----------------------------------------------------------------------------
-- 4. TABEL AKUN INSTANSI SEKOLAH / GURU BK (`school_bk_accounts` - KHUSUS APP GURU BK)
-- Dipisahkan secara fisik dari akun kepolisian, wajib terikat ke `school_id`
-- ----------------------------------------------------------------------------
CREATE TABLE school_bk_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nip_or_nuptk VARCHAR(35) UNIQUE NOT NULL,
  username VARCHAR(60) UNIQUE NOT NULL CHECK (char_length(username) >= 4),
  password_hash TEXT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone_wa VARCHAR(25) NOT NULL CHECK (phone_wa ~ '^628[0-9]{7,13}$'),
  fcm_token TEXT,
  is_primary_pic BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. TABEL MASTER SISWA (3NF)
-- ----------------------------------------------------------------------------
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nisn VARCHAR(20) UNIQUE CHECK (nisn IS NULL OR nisn ~ '^[0-9]{10}$'),
  full_name VARCHAR(120) NOT NULL,
  class_grade VARCHAR(10) NOT NULL CHECK (class_grade IN ('X', 'XI', 'XII')),
  class_name VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. TABEL MASTER JENIS PELANGGARAN & PASAL UU LLAJ NO. 22/2009 (3NF)
-- ----------------------------------------------------------------------------
CREATE TABLE violation_master_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(150) NOT NULL,
  uu_llaj_article VARCHAR(120) NOT NULL,
  severity_weight SMALLINT NOT NULL DEFAULT 1 CHECK (severity_weight BETWEEN 1 AND 10),
  max_fine_idr NUMERIC(12, 2) NOT NULL DEFAULT 250000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ----------------------------------------------------------------------------
-- 7. TABEL SIKLUS MONITORING & AMBANG BATAS KAMSEL PER SEKOLAH (3NF)
-- ----------------------------------------------------------------------------
CREATE TABLE kamsel_evaluation_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cycle_number INT NOT NULL CHECK (cycle_number >= 1),
  violation_count INT NOT NULL DEFAULT 0 CHECK (violation_count >= 0),
  warning_threshold_snapshot INT NOT NULL DEFAULT 5 CHECK (warning_threshold_snapshot >= 1),
  visit_threshold_snapshot INT NOT NULL DEFAULT 7 CHECK (visit_threshold_snapshot >= warning_threshold_snapshot),
  status kamsel_cycle_status NOT NULL DEFAULT 'AMAN',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  warning_reached_at TIMESTAMPTZ,
  visit_threshold_reached_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  UNIQUE (school_id, cycle_number)
);

-- ----------------------------------------------------------------------------
-- 8. TABEL HEADER TRANSAKSI PENINDAKAN TILANG SISWA
-- Foreign Key `polantas_account_id` langsung mengacu ke `police_accounts(id)`
-- ----------------------------------------------------------------------------
CREATE TABLE traffic_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(50) UNIQUE NOT NULL,
  cycle_id UUID NOT NULL REFERENCES kamsel_evaluation_cycles(id) ON DELETE RESTRICT,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  polantas_account_id UUID NOT NULL REFERENCES police_accounts(id) ON DELETE RESTRICT,
  incident_district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
  vehicle_plate_number VARCHAR(20) NOT NULL,
  vehicle_brand_type VARCHAR(80) NOT NULL,
  incident_location VARCHAR(200) NOT NULL,
  evidence_photo_url TEXT,
  officer_notes TEXT,
  incident_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. TABEL DETAIL ITEM PASAL PELANGGARAN (1-KE-BANYAK - 3NF)
-- ----------------------------------------------------------------------------
CREATE TABLE traffic_violation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  violation_id UUID NOT NULL REFERENCES traffic_violations(id) ON DELETE CASCADE,
  violation_type_id UUID NOT NULL REFERENCES violation_master_types(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (violation_id, violation_type_id)
);

-- ----------------------------------------------------------------------------
-- 10. TABEL TRANSAKSI KUNJUNGAN PENYULUHAN & EVALUASI UNIT KAMSEL
-- Foreign Key `kamsel_account_id` mengacu ke `police_accounts(id)`
-- Foreign Key `bk_account_id` mengacu ke `school_bk_accounts(id)`
-- ----------------------------------------------------------------------------
CREATE TABLE kamsel_counseling_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id UUID UNIQUE NOT NULL REFERENCES kamsel_evaluation_cycles(id) ON DELETE RESTRICT,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  kamsel_account_id UUID NOT NULL REFERENCES police_accounts(id) ON DELETE RESTRICT,
  bk_account_id UUID REFERENCES school_bk_accounts(id) ON DELETE SET NULL,
  coordination_channel VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP' CHECK (coordination_channel IN ('WHATSAPP', 'TELEPON')),
  coordinated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visit_date DATE NOT NULL,
  violation_count_at_visit INT NOT NULL CHECK (violation_count_at_visit >= 0),
  counseling_topic VARCHAR(200) NOT NULL,
  kamsel_directive_summary TEXT NOT NULL,
  school_evaluation_result TEXT NOT NULL,
  school_follow_up_commitment TEXT NOT NULL,
  documentation_photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. TABEL LOG AUDIT NOTIFIKASI LINTAS INSTANSI (FCM & WABLAS)
-- Memiliki CHECK Constraint Eksklusif (XOR) antara `police_account_id` dan `bk_account_id`
-- ----------------------------------------------------------------------------
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES kamsel_evaluation_cycles(id) ON DELETE SET NULL,
  violation_id UUID REFERENCES traffic_violations(id) ON DELETE SET NULL,
  recipient_institution institution_type NOT NULL,
  police_account_id UUID REFERENCES police_accounts(id) ON DELETE SET NULL,
  bk_account_id UUID REFERENCES school_bk_accounts(id) ON DELETE SET NULL,
  channel notification_channel_type NOT NULL,
  destination_target VARCHAR(180) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message_body TEXT NOT NULL,
  delivery_status notification_delivery_status NOT NULL,
  provider_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_notification_recipient_institution CHECK (
    (recipient_institution = 'POLRI' AND bk_account_id IS NULL) OR
    (recipient_institution = 'SCHOOL_BK' AND police_account_id IS NULL)
  )
);

-- ============================================================================
-- STRICT DATABASE INDEXING STRATEGY (PERFORMANCE & DATA INTEGRITY)
-- ============================================================================

-- 1. Partial Unique Index: Menjamin 1 sekolah HANYA memiliki 1 siklus evaluasi aktif
CREATE UNIQUE INDEX idx_kamsel_cycles_single_active_per_school
  ON kamsel_evaluation_cycles (school_id)
  WHERE status <> 'SELESAI_DIEVALUASI';

-- 2. Partial Unique Index: Menjamin 1 sekolah memiliki tepat 1 PIC Utama Guru BK aktif
CREATE UNIQUE INDEX idx_school_bk_single_primary_pic
  ON school_bk_accounts (school_id)
  WHERE is_primary_pic = TRUE AND is_active = TRUE;

-- 3. Composite & Covering Index untuk Login & Lookup Cepat Akun Kepolisian (`police_accounts`)
CREATE INDEX idx_police_accounts_role_active
  ON police_accounts (role, is_active)
  INCLUDE (nrp, full_name, rank_title, phone_wa, fcm_token);

-- 4. Composite & Covering Index untuk Login & Lookup Cepat Akun Guru BK (`school_bk_accounts`)
CREATE INDEX idx_school_bk_accounts_school_active
  ON school_bk_accounts (school_id, is_active)
  INCLUDE (nip_or_nuptk, full_name, phone_wa, fcm_token, is_primary_pic);

-- 5. Partial Covering Index untuk Radar Komando UNIT_KAMSEL (Index-Only Scan)
CREATE INDEX idx_kamsel_cycles_active_radar
  ON kamsel_evaluation_cycles (status, violation_count DESC, school_id)
  INCLUDE (cycle_number, warning_threshold_snapshot, visit_threshold_snapshot, opened_at)
  WHERE status <> 'SELESAI_DIEVALUASI';

-- 6. Composite Covering Index untuk Riwayat Pelanggaran per Sekolah & Siklus (App Guru BK & App Polri)
CREATE INDEX idx_traffic_violations_school_cycle_date
  ON traffic_violations (school_id, cycle_id, incident_at DESC)
  INCLUDE (ticket_number, student_id, polantas_account_id, vehicle_plate_number, incident_location);

-- 7. Composite Covering Index untuk Riwayat Penindakan Lapangan per Anggota POLANTAS
CREATE INDEX idx_traffic_violations_polantas_account
  ON traffic_violations (polantas_account_id, incident_at DESC)
  INCLUDE (ticket_number, school_id, student_id, vehicle_plate_number);

-- 8. B-Tree Index untuk Pencarian Cepat Plat Nomor Kendaraan
CREATE INDEX idx_traffic_violations_plate_number
  ON traffic_violations (vehicle_plate_number, incident_at DESC);

-- 9. Foreign Key Join Index pada Tabel Detail Item Pelanggaran
CREATE INDEX idx_traffic_violation_items_violation_id
  ON traffic_violation_items (violation_id)
  INCLUDE (violation_type_id);

-- 10. Composite Index pada Tabel Siswa per Sekolah & Kelas
CREATE INDEX idx_students_school_class
  ON students (school_id, class_grade, class_name)
  INCLUDE (full_name, nisn);

-- 11. Trigram GIN Indexes (`pg_trgm`) untuk Autocomplete Nama Siswa & Nama Sekolah
CREATE INDEX idx_students_full_name_trgm
  ON students USING GIN (full_name gin_trgm_ops);

CREATE INDEX idx_schools_name_trgm
  ON schools USING GIN (name gin_trgm_ops);

-- 12. Partial Covering Indexes untuk Log Notifikasi per Instansi (Polri vs Guru BK)
CREATE INDEX idx_notification_logs_polri_recipient
  ON notification_logs (police_account_id, created_at DESC)
  INCLUDE (channel, title, delivery_status)
  WHERE recipient_institution = 'POLRI';

CREATE INDEX idx_notification_logs_bk_recipient
  ON notification_logs (bk_account_id, created_at DESC)
  INCLUDE (channel, title, delivery_status)
  WHERE recipient_institution = 'SCHOOL_BK';
