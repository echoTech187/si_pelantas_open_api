import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5433'),
  database: process.env.DB_NAME || 'sipelantas_mojokerto',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'echoAdza32',
});

async function runRealisticSeeder() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔄 Memulai pembaruan seeder realistis SI-PELANTAS Mojokerto...');

    // 1. Bersihkan data dummy lama (relasi traffic_violations, items, students)
    await client.query('DELETE FROM notification_logs');
    await client.query('DELETE FROM traffic_violation_items');
    await client.query('DELETE FROM traffic_violations');
    await client.query('DELETE FROM students');

    // 2. Ambil referensi master types, districts, police officer
    const vTypesRes = await client.query('SELECT id, code FROM violation_master_types');
    const vTypeMap: Record<string, string> = {};
    for (const row of vTypesRes.rows) {
      vTypeMap[row.code] = row.id;
    }

    const officerRes = await client.query("SELECT id FROM police_accounts WHERE role = 'POLANTAS' LIMIT 1");
    const polantasId = officerRes.rows[0]?.id || 'da0208b5-4d5b-4e1d-92ca-b8c024357fe7';

    // Ambil data sekolah & siklus kamsel terkait
    const schoolsRes = await client.query(`
      SELECT s.id, s.name, s.district_id, c.id as cycle_id
      FROM schools s
      LEFT JOIN kamsel_evaluation_cycles c ON c.school_id = s.id
      WHERE s.name IN ('SMKN 1 Kota Mojokerto', 'SMKN 1 Pungging Mojokerto', 'SMAN 1 Sooko', 'SMAN 1 Puri Mojokerto')
    `);

    const schoolMap: Record<string, { id: string; districtId: string; cycleId: string }> = {};
    for (const s of schoolsRes.rows) {
      schoolMap[s.name] = { id: s.id, districtId: s.district_id, cycleId: s.cycle_id };
    }

    // 3. Dataset Realistis SMKN 1 Kota Mojokerto (7 Pelanggar -> WAJIB_PENYULUHAN_7_PELANGGAR)
    const smkn1KotaData = [
      {
        fullName: 'Rizky Pratama Yudha',
        nisn: '0067823911',
        className: 'XII Teknik Kendaraan Ringan 2',
        ticketNumber: 'TILANG-MJK-2026-001',
        plateNumber: 'S 4821 NA',
        brandType: 'Yamaha Aerox 155 (Hitam Doff)',
        location: 'Simpang Empat Empunala, Magersari, Kota Mojokerto',
        incidentAt: '2026-11-04 07:15:00+07',
        notes: 'Siswa berangkat sekolah tidak memakai helm SNI dan menggunakan knalpot brong bersuara bising.',
        violations: ['TIDAK_PAKAI_HELM_SNI', 'KNALPOT_BRONG_TIDAK_STANDAR'],
      },
      {
        fullName: 'Dimas Aditya Saputra',
        nisn: '0071934822',
        className: 'XI Teknik Komputer & Jaringan 1',
        ticketNumber: 'TILANG-MJK-2026-002',
        plateNumber: 'S 2930 NB',
        brandType: 'Honda Vario 125 (Putih)',
        location: 'Jl. Pahlawan, Magersari, Kota Mojokerto',
        incidentAt: '2026-11-04 07:22:00+07',
        notes: 'Belum cukup umur (16 tahun) dan belum memiliki SIM C.',
        violations: ['BELUM_CUKUP_UMUR_TANPA_SIM'],
      },
      {
        fullName: 'Fajar Kurniawan',
        nisn: '0068341905',
        className: 'XII Rekayasa Perangkat Lunak 1',
        ticketNumber: 'TILANG-MJK-2026-003',
        plateNumber: 'S 5184 ND',
        brandType: 'Honda Beat FI (Merah Putih)',
        location: 'Simpang Gajah Mada - Benteng Pancasila',
        incidentAt: '2026-11-04 12:45:00+07',
        notes: 'Menerobos lampu merah saat jam pulang sekolah dan berboncengan lebih dari satu.',
        violations: ['MELANGGAR_RAMBU_APIL', 'BERBONCENGAN_LEBIH_DARI_SATU'],
      },
      {
        fullName: 'Muhammad Bintang Ramadhan',
        nisn: '0074128933',
        className: 'XI Desain Komunikasi Visual 2',
        ticketNumber: 'TILANG-MJK-2026-004',
        plateNumber: 'S 3419 TF',
        brandType: 'Yamaha NMAX 155 (Biru)',
        location: 'Jl. Raya Ijen, Wates, Magersari',
        incidentAt: '2026-11-03 07:10:00+07',
        notes: 'Tidak dapat menunjukkan STNK dan kendaraan tidak dilengkapi spion standar.',
        violations: ['TIDAK_MEMBAWA_STNK_KELENGKAPAN'],
      },
      {
        fullName: 'Aldi Bagus Wicaksono',
        nisn: '0069214755',
        className: 'XII Teknik Instalasi Tenaga Listrik 1',
        ticketNumber: 'TILANG-MJK-2026-005',
        plateNumber: 'S 6720 NE',
        brandType: 'Honda Scoopy Prestige (Hitam)',
        location: 'Jl. Kedungsari Depan Gerbang Sekolah',
        incidentAt: '2026-11-03 07:25:00+07',
        notes: 'Mengemudikan sepeda motor tanpa helm pengaman SNI.',
        violations: ['TIDAK_PAKAI_HELM_SNI'],
      },
      {
        fullName: 'Bayu Aji Pamungkas',
        nisn: '0075631289',
        className: 'X Teknik Otomasi Industri 1',
        ticketNumber: 'TILANG-MJK-2026-006',
        plateNumber: 'W 3842 QD',
        brandType: 'Suzuki Satria F150 (Merah Hitam)',
        location: 'Simpang Tiga Jl. Empunala Mojokerto',
        incidentAt: '2026-11-02 13:10:00+07',
        notes: 'Knalpot brong tanpa peredam, plat nopol dari luar daerah Sidoarjo (W), tanpa SIM C.',
        violations: ['KNALPOT_BRONG_TIDAK_STANDAR', 'BELUM_CUKUP_UMUR_TANPA_SIM'],
      },
      {
        fullName: 'Satria Wahyu Pratama',
        nisn: '0064928173',
        className: 'XII Teknik Pemesinan 2',
        ticketNumber: 'TILANG-MJK-2026-007',
        plateNumber: 'S 4109 NF',
        brandType: 'Yamaha Jupiter Z (Biru Perak)',
        location: 'Jl. Residen Pamuji, Magersari',
        incidentAt: '2026-11-01 13:30:00+07',
        notes: 'Membawa penumpang lebih dari satu orang (bonceng tiga) sepulang sekolah.',
        violations: ['BERBONCENGAN_LEBIH_DARI_SATU', 'TIDAK_PAKAI_HELM_SNI'],
      },
    ];

    // 4. Dataset Realistis SMKN 1 Pungging Mojokerto (6 Pelanggar -> SIAGA_5_PELANGGAR)
    const smkn1PunggingData = [
      {
        fullName: 'Ahmad Faisal Rahman',
        nisn: '0061928401',
        className: 'XII Teknik Kendaraan Ringan 1',
        ticketNumber: 'TILANG-MJK-2026-008',
        plateNumber: 'S 5291 QA',
        brandType: 'Honda CB150R Streetfire (Hitam)',
        location: 'Jl. Raya Trawas KM 3, Pungging',
        incidentAt: '2026-11-04 07:18:00+07',
        notes: 'Menggunakan knalpot racing/brong bising yang mengganggu ketertiban jalan raya.',
        violations: ['KNALPOT_BRONG_TIDAK_STANDAR'],
      },
      {
        fullName: 'Bagus Tri Handoko',
        nisn: '0073849120',
        className: 'XI Teknik Mesin 3',
        ticketNumber: 'TILANG-MJK-2026-009',
        plateNumber: 'S 3180 QC',
        brandType: 'Honda Vario 160 (Abu-abu Doff)',
        location: 'Simpang Tiga Pungging Sari',
        incidentAt: '2026-11-04 07:30:00+07',
        notes: 'Tidak memakai helm dan belum mempunyai SIM C.',
        violations: ['TIDAK_PAKAI_HELM_SNI', 'BELUM_CUKUP_UMUR_TANPA_SIM'],
      },
      {
        fullName: 'Eko Wahyudi',
        nisn: '0064719283',
        className: 'XII Teknik Komputer & Jaringan 2',
        ticketNumber: 'TILANG-MJK-2026-010',
        plateNumber: 'S 6041 QF',
        brandType: 'Yamaha Mio M3 (Kuning)',
        location: 'Jl. Brawijaya Pungging',
        incidentAt: '2026-11-03 12:50:00+07',
        notes: 'Berboncengan 3 orang tanpa helm.',
        violations: ['BERBONCENGAN_LEBIH_DARI_SATU', 'TIDAK_PAKAI_HELM_SNI'],
      },
      {
        fullName: 'Hendra Saputra',
        nisn: '0078192034',
        className: 'X Teknik Pengelasan 1',
        ticketNumber: 'TILANG-MJK-2026-011',
        plateNumber: 'L 4912 CD',
        brandType: 'Honda Beat Street (Silver)',
        location: 'Jl. Raya Pungging Barat',
        incidentAt: '2026-11-03 07:12:00+07',
        notes: 'Pelajar di bawah umur, motor plat Surabaya (L) tanpa spion lengkap.',
        violations: ['BELUM_CUKUP_UMUR_TANPA_SIM', 'TIDAK_MEMBAWA_STNK_KELENGKAPAN'],
      },
      {
        fullName: 'Ivan Maulana',
        nisn: '0065829103',
        className: 'XII Rekayasa Perangkat Lunak 2',
        ticketNumber: 'TILANG-MJK-2026-012',
        plateNumber: 'S 2715 QE',
        brandType: 'Yamaha Vixion 150 (Merah)',
        location: 'Pertigaan Lebaksono, Pungging',
        incidentAt: '2026-11-02 07:05:00+07',
        notes: 'Menerobos lampu pengatur lalu lintas saat jam padat pagi.',
        violations: ['MELANGGAR_RAMBU_APIL'],
      },
      {
        fullName: 'Yoga Permana Putra',
        nisn: '0072049182',
        className: 'XI Teknik Otomotif 2',
        ticketNumber: 'TILANG-MJK-2026-013',
        plateNumber: 'S 4892 QD',
        brandType: 'Honda Supra X 125 (Hitam Merah)',
        location: 'Jl. Raya Trawas Pungging',
        incidentAt: '2026-11-01 13:15:00+07',
        notes: 'Tidak menggunakan helm pelindung kepala SNI.',
        violations: ['TIDAK_PAKAI_HELM_SNI'],
      },
    ];

    // 5. Dataset Realistis SMAN 1 Sooko (5 Pelanggar -> SIAGA_5_PELANGGAR)
    const sman1SookoData = [
      {
        fullName: 'Kevin Ardiansyah',
        nisn: '0062849102',
        className: 'XII MIPA 3',
        ticketNumber: 'TILANG-MJK-2026-014',
        plateNumber: 'S 2819 SO',
        brandType: 'Honda Vario 150 (Hitam Eksklusif)',
        location: 'Jl. R.A. Basuni No. 120, Sooko',
        incidentAt: '2026-11-04 07:14:00+07',
        notes: 'Siswa belum memiliki SIM C dan mengendarai sepeda motor ke sekolah.',
        violations: ['BELUM_CUKUP_UMUR_TANPA_SIM'],
      },
      {
        fullName: 'Nanda Putra Dewantara',
        nisn: '0073910284',
        className: 'XI IPS 1',
        ticketNumber: 'TILANG-MJK-2026-015',
        plateNumber: 'S 5410 SB',
        brandType: 'Yamaha Fazzio (Cyan)',
        location: 'Simpang Lima Kenanten Sooko',
        incidentAt: '2026-11-04 07:28:00+07',
        notes: 'Tidak memakai helm pelindung SNI saat melintas jalan nasional.',
        violations: ['TIDAK_PAKAI_HELM_SNI'],
      },
      {
        fullName: 'Farhan Maulana Akbar',
        nisn: '0067182930',
        className: 'XII MIPA 1',
        ticketNumber: 'TILANG-MJK-2026-016',
        plateNumber: 'AG 3194 EF',
        brandType: 'Kawasaki KLX 150 (Hijau)',
        location: 'Jl. R.A. Basuni Depan SMAN 1 Sooko',
        incidentAt: '2026-11-03 13:20:00+07',
        notes: 'Knalpot brong suara bising, plat luar daerah Kediri (AG), tanpa spion.',
        violations: ['KNALPOT_BRONG_TIDAK_STANDAR', 'TIDAK_MEMBAWA_STNK_KELENGKAPAN'],
      },
      {
        fullName: 'Bagas Aditya Nugraha',
        nisn: '0074819203',
        className: 'XI MIPA 4',
        ticketNumber: 'TILANG-MJK-2026-017',
        plateNumber: 'S 4291 SD',
        brandType: 'Honda Genio (Coklat)',
        location: 'Pertigaan Gemekan Sooko',
        incidentAt: '2026-11-02 07:15:00+07',
        notes: 'Melanggar rambu marka larangan putar balik (APIL).',
        violations: ['MELANGGAR_RAMBU_APIL'],
      },
      {
        fullName: 'Rian Dwi Septiawan',
        nisn: '0069182374',
        className: 'XII IPS 3',
        ticketNumber: 'TILANG-MJK-2026-018',
        plateNumber: 'S 6032 SC',
        brandType: 'Yamaha Aerox Connected (Silver)',
        location: 'Jl. R.A. Basuni Sooko',
        incidentAt: '2026-11-01 12:45:00+07',
        notes: 'Membawa penumpang lebih dari satu orang tanpa helm perlindungan.',
        violations: ['BERBONCENGAN_LEBIH_DARI_SATU', 'TIDAK_PAKAI_HELM_SNI'],
      },
    ];

    // 6. Dataset Realistis SMAN 1 Puri (2 Pelanggar -> AMAN)
    const sman1PuriData = [
      {
        fullName: 'Dion Permadi',
        nisn: '0063920194',
        className: 'XII MIPA 2',
        ticketNumber: 'TILANG-MJK-2026-019',
        plateNumber: 'S 3912 PR',
        brandType: 'Honda Scoopy Stylish (Merah)',
        location: 'Jl. Jayanegara No. 45, Puri',
        incidentAt: '2026-11-04 07:12:00+07',
        notes: 'Tidak membawa STNK saat pemeriksaan berkala pelajar di kawasan tertib lantas.',
        violations: ['TIDAK_MEMBAWA_STNK_KELENGKAPAN'],
      },
      {
        fullName: 'Gilang Ramadhan',
        nisn: '0078192841',
        className: 'XI IPS 2',
        ticketNumber: 'TILANG-MJK-2026-020',
        plateNumber: 'S 4821 PT',
        brandType: 'Honda Vario 125 (Hitam)',
        location: 'Simpang Puri By Pass Mojokerto',
        incidentAt: '2026-11-03 07:20:00+07',
        notes: 'Belum cukup umur memiliki SIM C dan mengendarai motor ke sekolah.',
        violations: ['BELUM_CUKUP_UMUR_TANPA_SIM'],
      },
    ];

    // Helper untuk insert data siswa dan penindakan tilang
    async function seedSchoolViolations(schoolName: string, violationsData: typeof smkn1KotaData) {
      const sInfo = schoolMap[schoolName];
      if (!sInfo) {
        console.warn(`Sekolah "${schoolName}" tidak ditemukan dalam map.`);
        return;
      }

      for (const item of violationsData) {
        // A. Insert data siswa
        const studentRes = await client.query(
          `INSERT INTO students (school_id, full_name, nisn, class_name, class_grade)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            sInfo.id,
            item.fullName,
            item.nisn,
            item.className,
            item.className.startsWith('X ') ? 'X' : (item.className.startsWith('XI ') ? 'XI' : 'XII'),
          ]
        );
        const studentId = studentRes.rows[0].id;

        // B. Insert traffic violation
        const violationRes = await client.query(
          `INSERT INTO traffic_violations (
             ticket_number, school_id, student_id, polantas_account_id,
             incident_district_id, cycle_id, vehicle_plate_number, vehicle_brand_type,
             incident_location, officer_notes, incident_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            item.ticketNumber,
            sInfo.id,
            studentId,
            polantasId,
            sInfo.districtId,
            sInfo.cycleId,
            item.plateNumber,
            item.brandType,
            item.location,
            item.notes,
            item.incidentAt,
          ]
        );
        const violationId = violationRes.rows[0].id;

        // C. Insert violation items (pasal)
        for (const code of item.violations) {
          const typeId = vTypeMap[code];
          if (typeId) {
            await client.query(
              `INSERT INTO traffic_violation_items (violation_id, violation_type_id)
               VALUES ($1, $2)`,
              [violationId, typeId]
            );
          }
        }
      }

      // D. Sinkronisasi akumulasi pelanggaran di kamsel_evaluation_cycles
      const totalCount = violationsData.length;
      let status = 'AMAN';
      if (totalCount >= 7) {
        status = 'WAJIB_PENYULUHAN_7_PELANGGAR';
      } else if (totalCount >= 5) {
        status = 'SIAGA_5_PELANGGAR';
      }

      if (sInfo.cycleId) {
        await client.query(
          `UPDATE kamsel_evaluation_cycles
           SET violation_count = $1, status = $2
           WHERE id = $3`,
          [totalCount, status, sInfo.cycleId]
        );
      }
      console.log(`✅ ${schoolName}: berhasil dimasukkan ${totalCount} pelanggaran realistis (Status: ${status}).`);
    }

    await seedSchoolViolations('SMKN 1 Kota Mojokerto', smkn1KotaData);
    await seedSchoolViolations('SMKN 1 Pungging Mojokerto', smkn1PunggingData);
    await seedSchoolViolations('SMAN 1 Sooko', sman1SookoData);
    await seedSchoolViolations('SMAN 1 Puri Mojokerto', sman1PuriData);

    await client.query('COMMIT');
    console.log('🎉 Seeder realistis selesai sukses tanpa kendala!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Gagal menjalankan seeder realistis:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runRealisticSeeder();
