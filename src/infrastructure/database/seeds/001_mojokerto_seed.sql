-- ============================================================================
-- SEED DATA WILAYAH MOJOKERTO: 2 TABEL AKUN TERPISAH (POLRI VS GURU BK SEKOLAH)
-- ============================================================================

-- 1. Master Kecamatan di Kab/Kota Mojokerto
INSERT INTO districts (id, bps_code, name, region_type) VALUES
  ('4966ca5f-49e9-4aef-82b7-11209711cc93', '35.16.11', 'Kec. Sooko', 'KABUPATEN_MOJOKERTO'),
  ('a316446f-520d-4a03-86a1-6afab022b7a5', '35.76.02', 'Kec. Magersari', 'KOTA_MOJOKERTO'),
  ('05258624-71d4-4945-95bc-cd6fb4dd2ee8', '35.16.09', 'Kec. Puri', 'KABUPATEN_MOJOKERTO'),
  ('2cc624e3-499f-495b-b91e-26d223b50ca9', '35.16.06', 'Kec. Pungging', 'KABUPATEN_MOJOKERTO')
ON CONFLICT (bps_code) DO NOTHING;

-- 2. Master Sekolah di Wilayah Mojokerto
INSERT INTO schools (id, npsn, name, education_level, district_id, address, official_phone) VALUES
  ('e16a924b-82f4-4403-92fe-33335c5fd9f6', '20502721', 'SMAN 1 Sooko Mojokerto', 'SMA', '4966ca5f-49e9-4aef-82b7-11209711cc93', 'Jl. R.A. Basuni No. 361, Sooko, Kab. Mojokerto', '0321322637'),
  ('696fa5a1-f7e0-439c-ad8d-8b00cec54d60', '20534789', 'SMKN 1 Kota Mojokerto', 'SMK', 'a316446f-520d-4a03-86a1-6afab022b7a5', 'Jl. Kedungsari, Magersari, Kota Mojokerto', '0321381974'),
  ('63d46764-061f-42ad-942b-6518a0156014', '20502735', 'SMAN 1 Puri Mojokerto', 'SMA', '05258624-71d4-4945-95bc-cd6fb4dd2ee8', 'Jl. Jayanegara No. 2, Puri, Kab. Mojokerto', '0321322636'),
  ('0d05f128-13ed-490d-bba6-f653b73740ac', '20502710', 'SMKN 1 Pungging Mojokerto', 'SMK', '2cc624e3-499f-495b-b91e-26d223b50ca9', 'Jl. Raya Trawas, Pungging, Kab. Mojokerto', '0321593255')
ON CONFLICT (npsn) DO NOTHING;

-- 3. Master Jenis Pelanggaran Lalu Lintas & Pasal UU LLAJ No. 22 Tahun 2009
INSERT INTO violation_master_types (id, code, title, uu_llaj_article, severity_weight, max_fine_idr) VALUES
  ('5ff8b3b5-6def-42a1-bfda-874795455cd7', 'TIDAK_PAKAI_HELM_SNI', 'Tidak Menggunakan Helm Standar Nasional Indonesia (SNI)', 'Pasal 291 Ayat (1) jo. Pasal 106 Ayat (8) UU LLAJ', 5, 250000),
  ('e3a0b947-b98f-4170-a24f-b764ab3652f6', 'BELUM_CUKUP_UMUR_TANPA_SIM', 'Mengemudikan Kendaraan Bermotor Tanpa Memiliki SIM C (Belum Cukup Umur)', 'Pasal 281 jo. Pasal 77 Ayat (1) UU LLAJ', 8, 1000000),
  ('87a35509-b24d-4333-a821-57b3028c4f13', 'KNALPOT_BRONG_TIDAK_STANDAR', 'Menggunakan Knalpot Tidak Sesuai Spesifikasi Teknis (Knalpot Brong)', 'Pasal 285 Ayat (1) jo. Pasal 106 Ayat (3) UU LLAJ', 7, 250000),
  ('42364648-c6c6-4765-a258-4993f5747a3f', 'BERBONCENGAN_LEBIH_DARI_SATU', 'Sepeda Motor Membawa Penumpang Lebih dari 1 (Satu) Orang', 'Pasal 292 jo. Pasal 106 Ayat (9) UU LLAJ', 4, 250000),
  ('b361ec17-29cb-404e-80eb-0cd7187bdb7e', 'MELANGGAR_RAMBU_APIL', 'Melanggar Rambu Lalu Lintas atau Alat Pemberi Isyarat Lalu Lintas (APILL)', 'Pasal 287 Ayat (1) jo. Pasal 106 Ayat (4) UU LLAJ', 6, 500000),
  ('53dd2834-35d1-4f18-a8cc-f5009c1673bc', 'TIDAK_MEMBAWA_STNK_KELENGKAPAN', 'Tidak Membawa STNK yang Sah atau Kelengkapan Teknis Kendaraan', 'Pasal 288 Ayat (1) jo. Pasal 106 Ayat (5) UU LLAJ', 5, 500000)
ON CONFLICT (code) DO NOTHING;

-- 4. Tabel Akun Instansi Kepolisian (`police_accounts` - POLANTAS & UNIT_KAMSEL)
INSERT INTO police_accounts (id, nrp, username, password_hash, full_name, rank_title, role, division, sector_area, phone_wa) VALUES
  ('da0208b5-4d5b-4e1d-92ca-b8c024357fe7', '89040123', 'polantas.lapangan', '$2b$10$CwTycUXWue0Thq9StjUM0uJ8D0R6V5aH.1kM6l5f7C8O1y2Z3a4bK', 'Bripka Andi Pratama, S.H.', 'Bripka', 'POLANTAS', 'TURJAWALI_LANTAS', 'Satlantas Polres Mojokerto', '628113009901'),
  ('d54bc9f9-4d1f-4c8a-b0b9-4e035d0ab4fe', '94080511', 'kamsel.mojokerto', '$2b$10$CwTycUXWue0Thq9StjUM0uJ8D0R6V5aH.1kM6l5f7C8O1y2Z3a4bK', 'Ipda Bagus Setiawan, S.Tr.K.', 'Ipda', 'UNIT_KAMSEL', 'UNIT_KAMSEL', 'Unit Kamsel Satlantas Polres Mojokerto', '628113009902')
ON CONFLICT (nrp) DO NOTHING;

-- 5. Tabel Akun Instansi Sekolah / Guru BK (`school_bk_accounts` - Tiap Sekolah)
INSERT INTO school_bk_accounts (id, school_id, nip_or_nuptk, username, password_hash, full_name, phone_wa, is_primary_pic) VALUES
  ('ccd3e58c-8148-4b8b-b29d-f68a6e1e606d', 'e16a924b-82f4-4403-92fe-33335c5fd9f6', '197504122005012008', 'bk.sman1sooko', '$2b$10$CwTycUXWue0Thq9StjUM0uJ8D0R6V5aH.1kM6l5f7C8O1y2Z3a4bK', 'Dra. Siti Aminah, M.Pd.', '6281234567801', TRUE),
  ('f3dced17-f1c9-4806-9967-172f94dce93b', '696fa5a1-f7e0-439c-ad8d-8b00cec54d60', '198208192009021004', 'bk.smkn1kota', '$2b$10$CwTycUXWue0Thq9StjUM0uJ8D0R6V5aH.1kM6l5f7C8O1y2Z3a4bK', 'Hendra Wijaya, S.Pd.', '6281234567802', TRUE),
  ('a36f669b-f914-417c-a71b-dd461eaf6656', '63d46764-061f-42ad-942b-6518a0156014', '198811032014032002', 'bk.sman1puri', '$2b$10$CwTycUXWue0Thq9StjUM0uJ8D0R6V5aH.1kM6l5f7C8O1y2Z3a4bK', 'Rina Kartika, S.Psi.', '6281234567803', TRUE),
  ('ff913594-9916-4cea-8984-93ead5511d43', '0d05f128-13ed-490d-bba6-f653b73740ac', '197906212008011009', 'bk.smkn1pungging', '$2b$10$CwTycUXWue0Thq9StjUM0uJ8D0R6V5aH.1kM6l5f7C8O1y2Z3a4bK', 'Bambang Sudibyo, S.Pd.', '6281234567804', TRUE)
ON CONFLICT (nip_or_nuptk) DO NOTHING;

-- 6. Siklus Evaluasi Kamsel Aktif untuk Masing-Masing Sekolah
INSERT INTO kamsel_evaluation_cycles (id, school_id, cycle_number, violation_count, warning_threshold_snapshot, visit_threshold_snapshot, status, warning_reached_at, visit_threshold_reached_at) VALUES
  ('e71b000c-744e-4def-8f6e-a211a4eda126', 'e16a924b-82f4-4403-92fe-33335c5fd9f6', 1, 5, 5, 7, 'SIAGA_5_PELANGGAR', NOW() - INTERVAL '1 day', NULL),
  ('a4a6dc7d-3299-40a0-9a8c-05398dd59ff1', '696fa5a1-f7e0-439c-ad8d-8b00cec54d60', 1, 7, 5, 7, 'WAJIB_PENYULUHAN_7_PELANGGAR', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 hours'),
  ('589dc17b-26ed-400b-873c-3d3ef4defe19', '63d46764-061f-42ad-942b-6518a0156014', 1, 2, 5, 7, 'AMAN', NULL, NULL),
  ('0e01f37d-ab16-40cf-a62a-de73169c2629', '0d05f128-13ed-490d-bba6-f653b73740ac', 1, 6, 5, 7, 'SIAGA_5_PELANGGAR', NOW() - INTERVAL '6 hours', NULL)
ON CONFLICT (school_id, cycle_number) DO NOTHING;
