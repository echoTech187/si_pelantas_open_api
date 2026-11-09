import { withTransaction, dbQuery } from '../../infrastructure/database/pgPool';
import { CreateViolationRequestDto } from '../dtos/ViolationDto';
import { WhatsappMessageTemplates } from '../dtos/WhatsappMessageTemplates';
import { FcmNotificationService } from '../../infrastructure/services/FcmNotificationService';
import { WablasWhatsappService } from '../../infrastructure/services/WablasWhatsappService';
import { env } from '../../config/env';
import { KamselCycleStatus } from '../../domain/entities/SchoolEntity';

export class RecordTrafficViolationUseCase {
  constructor(
    private readonly fcmService: FcmNotificationService,
    private readonly wablasService: WablasWhatsappService
  ) {}

  async execute(polantasAccountId: string, dto: CreateViolationRequestDto) {
    const ticketNumber = `TILANG-MJK-${Date.now().toString().slice(-8)}`;

    const txResult = await withTransaction(async (client) => {
      // 1. Ambil profil petugas POLANTAS dari tabel khusus `police_accounts`
      const polantasRes = await client.query(
        `SELECT id, nrp, full_name, rank_title, division
         FROM police_accounts
         WHERE id = $1 AND role = 'POLANTAS' AND is_active = TRUE`,
        [polantasAccountId]
      );
      if (polantasRes.rowCount === 0) {
        throw new Error('Akun petugas Polantas tidak valid atau tidak aktif');
      }
      const polantas = polantasRes.rows[0];

      // 2. Ambil data Sekolah + Kecamatan + Akun Guru BK Utama dari `school_bk_accounts`
      const schoolRes = await client.query(
        `SELECT s.id, s.name AS school_name, s.address, d.id AS district_id, d.name AS district_name,
                bk.id AS bk_account_id, bk.full_name AS bk_name, bk.phone_wa AS bk_phone_wa, bk.fcm_token AS bk_fcm_token
         FROM schools s
         JOIN districts d ON d.id = s.district_id
         LEFT JOIN school_bk_accounts bk ON bk.school_id = s.id AND bk.is_primary_pic = TRUE AND bk.is_active = TRUE
         WHERE s.id = $1 AND s.is_active = TRUE`,
        [dto.schoolId]
      );
      if (schoolRes.rowCount === 0) {
        throw new Error('Sekolah tidak ditemukan di database wilayah Mojokerto');
      }
      const school = schoolRes.rows[0];

      // 3. Upsert atau Insert data Siswa pada tabel ternormalisasi `students` (3NF)
      let studentId: string;
      if (dto.studentNisn) {
        const upsertStudent = await client.query(
          `INSERT INTO students (school_id, nisn, full_name, class_grade, class_name)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (nisn) DO UPDATE
             SET full_name = EXCLUDED.full_name,
                 class_grade = EXCLUDED.class_grade,
                 class_name = EXCLUDED.class_name,
                 updated_at = NOW()
           RETURNING id`,
          [
            dto.schoolId,
            dto.studentNisn,
            dto.studentName,
            dto.studentClassGrade,
            dto.studentClassName,
          ]
        );
        studentId = upsertStudent.rows[0].id;
      } else {
        const insertStudent = await client.query(
          `INSERT INTO students (school_id, full_name, class_grade, class_name)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [dto.schoolId, dto.studentName, dto.studentClassGrade, dto.studentClassName]
        );
        studentId = insertStudent.rows[0].id;
      }

      // 4. Pastikan terdapat Siklus Evaluasi Kamsel Aktif pada `kamsel_evaluation_cycles`
      let cycleRes = await client.query(
        `SELECT * FROM kamsel_evaluation_cycles
         WHERE school_id = $1 AND status <> 'SELESAI_DIEVALUASI'
         FOR UPDATE`,
        [dto.schoolId]
      );

      if (cycleRes.rowCount === 0) {
        const lastCycleRes = await client.query(
          `SELECT COALESCE(MAX(cycle_number), 0) AS max_cycle
           FROM kamsel_evaluation_cycles WHERE school_id = $1`,
          [dto.schoolId]
        );
        const nextCycleNum = Number(lastCycleRes.rows[0].max_cycle) + 1;
        cycleRes = await client.query(
          `INSERT INTO kamsel_evaluation_cycles (
             school_id, cycle_number, violation_count, warning_threshold_snapshot, visit_threshold_snapshot, status
           ) VALUES ($1, $2, 0, $3, $4, 'AMAN')
           RETURNING *`,
          [dto.schoolId, nextCycleNum, env.KAMSEL_WARNING_THRESHOLD, env.KAMSEL_VISIT_THRESHOLD]
        );
      }
      const activeCycle = cycleRes.rows[0];

      // 5. Insert Header Transaksi Pelanggaran (`traffic_violations` -> FK ke `police_accounts`)
      const violationRes = await client.query(
        `INSERT INTO traffic_violations (
           ticket_number, cycle_id, school_id, student_id, polantas_account_id,
           incident_district_id, vehicle_plate_number, vehicle_brand_type,
           incident_location, evidence_photo_url, officer_notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          ticketNumber,
          activeCycle.id,
          dto.schoolId,
          studentId,
          polantasAccountId,
          dto.incidentDistrictId ?? school.district_id,
          dto.vehiclePlateNumber,
          dto.vehicleBrandType,
          dto.incidentLocation,
          dto.evidencePhotoUrl ?? null,
          dto.officerNotes ?? null,
        ]
      );
      const violation = violationRes.rows[0];

      // 6. Insert Detail Pasal Pelanggaran (`traffic_violation_items` - 3NF)
      const masterTypesRes = await client.query(
        `SELECT id, code, title, uu_llaj_article
         FROM violation_master_types
         WHERE code = ANY($1::varchar[])`,
        [dto.violationCodes]
      );

      for (const vType of masterTypesRes.rows) {
        await client.query(
          `INSERT INTO traffic_violation_items (violation_id, violation_type_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [violation.id, vType.id]
        );
      }

      // 7. Update jumlah pelanggar di siklus aktif & evaluasi status ambang batas (5 / 7)
      const countRes = await client.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM traffic_violations WHERE cycle_id = $1`,
        [activeCycle.id]
      );
      const newCount = parseInt(countRes.rows[0].total, 10);

      let newStatus: KamselCycleStatus = 'AMAN';
      if (newCount >= env.KAMSEL_VISIT_THRESHOLD) {
        newStatus = 'WAJIB_PENYULUHAN_7_PELANGGAR';
      } else if (newCount >= env.KAMSEL_WARNING_THRESHOLD) {
        newStatus = 'SIAGA_5_PELANGGAR';
      }

      await client.query(
        `UPDATE kamsel_evaluation_cycles
         SET violation_count = $1,
             status = $2,
             warning_reached_at = CASE
               WHEN $1 >= warning_threshold_snapshot AND warning_reached_at IS NULL THEN NOW()
               ELSE warning_reached_at
             END,
             visit_threshold_reached_at = CASE
               WHEN $1 >= visit_threshold_snapshot AND visit_threshold_reached_at IS NULL THEN NOW()
               ELSE visit_threshold_reached_at
             END
         WHERE id = $3`,
        [newCount, newStatus, activeCycle.id]
      );

      return {
        violation,
        polantas,
        school,
        violationTypes: masterTypesRes.rows,
        activeCycleId: activeCycle.id,
        newCount,
        newStatus,
      };
    });

    // 8. Kirim Notifikasi Otomatis ke Aplikasi Guru BK (`school_bk_accounts`)
    //    dan ke Aplikasi Polri Unit Kamsel (`police_accounts` role = 'UNIT_KAMSEL') bila >= 5 / >= 7
    const violationListText = txResult.violationTypes
      .map((vt: any) => `• *${vt.title}* (${vt.uu_llaj_article})`)
      .join('\n');

    const waBkMessage = WhatsappMessageTemplates.buildViolationAlertForGuruBk({
      ticketNumber: txResult.violation.ticket_number,
      incidentAt: txResult.violation.incident_at,
      polantasName: txResult.polantas.full_name,
      polantasRankNrp: `${txResult.polantas.rank_title} (NRP ${txResult.polantas.nrp})`,
      schoolName: txResult.school.school_name,
      districtName: txResult.school.district_name,
      bkTeacherName: txResult.school.bk_name ?? 'Koordinator BK',
      studentName: dto.studentName,
      studentNisn: dto.studentNisn ?? null,
      studentClassName: dto.studentClassName,
      vehiclePlateNumber: dto.vehiclePlateNumber,
      vehicleBrandType: dto.vehicleBrandType,
      violationListText,
      incidentLocation: dto.incidentLocation,
      officerNotes: dto.officerNotes ?? null,
      activeViolationCount: txResult.newCount,
      warningThreshold: env.KAMSEL_WARNING_THRESHOLD,
      visitThreshold: env.KAMSEL_VISIT_THRESHOLD,
    });

    // -------------------------------------------------------------------------
    // ATURAN NOTIFIKASI DISPOSISI & EVALUASI KAMSEL:
    // 1. Jika pelanggaran >= 7 (Wajib Kunjungan Penyuluhan Kamsel):
    //    - Buat notifikasi darurat ambang batas untuk Unit Kamsel (POLRI_COMMAND_APP)
    //    - Buat juga notifikasi darurat penyuluhan untuk Guru BK (SCHOOL_BK_APP)
    // 2. Jika pelanggaran < 7:
    //    - Cukup buat notifikasi tilang siswa untuk Guru BK sekolah terkait saja
    // -------------------------------------------------------------------------
    const isWajibPenyuluhan = txResult.newCount >= env.KAMSEL_VISIT_THRESHOLD;

    let bkNotifTitle = `[TILANG SISWA] ${dto.studentName} (${dto.studentClassName}) - ${txResult.school.school_name}`;
    let bkNotifBody = `Ditindak Polantas di ${dto.incidentLocation}. Akumulasi aktif sekolah: ${txResult.newCount} siswa (${txResult.newStatus}).`;

    if (isWajibPenyuluhan) {
      bkNotifTitle = `🚨 [WAJIB PENYULUHAN KAMSEL] ${txResult.school.school_name} (${txResult.newCount} Pelanggar)`;
      bkNotifBody = `Perhatian Guru BK: Tilang siswa ${dto.studentName} (${dto.studentClassName}) membuat akumulasi sekolah mencapai batas ${txResult.newCount} pelanggar aktif. Satlantas Unit Kamsel akan segera menjadwalkan kunjungan penyuluhan tatap muka.`;
    }

    const notificationPromises: Promise<any>[] = [];

    if (txResult.school.bk_phone_wa) {
      notificationPromises.push(
        this.wablasService.sendWhatsappAlert({
          schoolId: dto.schoolId,
          violationId: txResult.violation.id,
          cycleId: txResult.activeCycleId,
          recipientInstitution: 'SCHOOL_BK',
          bkAccountId: txResult.school.bk_account_id ?? undefined,
          phoneWa: txResult.school.bk_phone_wa,
          title: bkNotifTitle,
          message: waBkMessage,
        })
      );
    }

    if (txResult.school.bk_fcm_token) {
      notificationPromises.push(
        this.fcmService.sendToSchoolBk({
          schoolId: dto.schoolId,
          violationId: txResult.violation.id,
          cycleId: txResult.activeCycleId,
          recipientInstitution: 'SCHOOL_BK',
          bkAccountId: txResult.school.bk_account_id ?? undefined,
          fcmTokens: [txResult.school.bk_fcm_token],
          title: bkNotifTitle,
          body: bkNotifBody,
          dataPayload: {
            targetApp: 'SCHOOL_BK_APP',
            schoolId: dto.schoolId,
            violationId: txResult.violation.id,
            activeViolationCount: String(txResult.newCount),
            kamselStatus: txResult.newStatus,
          },
        })
      );
    } else {
      // Token BK kosong (sedang logout) — catat SKIPPED agar bisa di-resend saat login nanti
      notificationPromises.push(
        this.fcmService.sendToSchoolBk({
          schoolId: dto.schoolId,
          violationId: txResult.violation.id,
          cycleId: txResult.activeCycleId,
          recipientInstitution: 'SCHOOL_BK',
          bkAccountId: txResult.school.bk_account_id ?? undefined,
          fcmTokens: [], // kosong → FcmNotificationService akan catat SKIPPED
          title: bkNotifTitle,
          body: bkNotifBody,
          dataPayload: {
            targetApp: 'SCHOOL_BK_APP',
            schoolId: dto.schoolId,
            violationId: txResult.violation.id,
            activeViolationCount: String(txResult.newCount),
            kamselStatus: txResult.newStatus,
          },
        })
      );
    }

    // Notifikasi untuk Unit Kamsel Satlantas Polres Mojokerto (HANYA jika >= 7 kasus)
    if (isWajibPenyuluhan) {
      const kamselOfficersRes = await dbQuery<{
        id: string;
        phone_wa: string;
        fcm_token: string | null;
      }>(
        `SELECT id, phone_wa, fcm_token
         FROM police_accounts
         WHERE role = 'UNIT_KAMSEL' AND is_active = TRUE`
      );

      const kamselTitle = `🚨 [WAJIB PENYULUHAN KAMSEL] ${txResult.school.school_name} (${txResult.newCount} Pelanggar)`;
      const kamselBody = `Sekolah ${txResult.school.school_name} mencapai ${txResult.newCount} pelanggar aktif. Segera koordinasi kunjungan penyuluhan dengan Guru BK (${txResult.school.bk_name}).`;

      const kamselWaMessage = WhatsappMessageTemplates.buildThresholdAlertForUnitKamsel({
        schoolName: txResult.school.school_name,
        districtName: txResult.school.district_name,
        address: txResult.school.address,
        bkTeacherName: txResult.school.bk_name ?? 'Guru BK',
        bkPhoneWa: txResult.school.bk_phone_wa ?? '-',
        activeViolationCount: txResult.newCount,
        visitThreshold: env.KAMSEL_VISIT_THRESHOLD,
        latestStudentName: dto.studentName,
        latestStudentClass: dto.studentClassName,
      });

      const kamselFcmTokens = kamselOfficersRes.rows
        .map((r) => r.fcm_token)
        .filter((t): t is string => Boolean(t));

      const firstKamselOfficerId = kamselOfficersRes.rows[0]?.id;

      if (kamselFcmTokens.length > 0) {
        notificationPromises.push(
          this.fcmService.sendToSchoolBk({
            schoolId: dto.schoolId,
            violationId: txResult.violation.id,
            cycleId: txResult.activeCycleId,
            recipientInstitution: 'POLRI',
            policeAccountId: firstKamselOfficerId,
            fcmTokens: kamselFcmTokens,
            title: kamselTitle,
            body: kamselBody,
            dataPayload: {
              targetApp: 'POLRI_COMMAND_APP',
              targetRole: 'UNIT_KAMSEL',
              schoolId: dto.schoolId,
              activeViolationCount: String(txResult.newCount),
              kamselStatus: txResult.newStatus,
            },
          })
        );
      }

      for (const officer of kamselOfficersRes.rows) {
        notificationPromises.push(
          this.wablasService.sendWhatsappAlert({
            schoolId: dto.schoolId,
            violationId: txResult.violation.id,
            cycleId: txResult.activeCycleId,
            recipientInstitution: 'POLRI',
            policeAccountId: officer.id,
            phoneWa: officer.phone_wa,
            title: kamselTitle,
            message: kamselWaMessage,
          })
        );
      }
    }

    await Promise.allSettled(notificationPromises);

    const waSimUrl = txResult.school.bk_phone_wa
      ? `https://wa.me/${txResult.school.bk_phone_wa}?text=${encodeURIComponent(waBkMessage)}`
      : null;

    return {
      violationId: txResult.violation.id,
      ticketNumber: txResult.violation.ticket_number,
      schoolId: dto.schoolId,
      schoolName: txResult.school.school_name,
      studentName: dto.studentName,
      studentClassName: dto.studentClassName,
      vehiclePlateNumber: dto.vehiclePlateNumber,
      activeCycleId: txResult.activeCycleId,
      activeViolationCount: txResult.newCount,
      kamselStatus: txResult.newStatus,
      unitKamselNotified: isWajibPenyuluhan,
      whatsappSimulationMessage: waBkMessage,
      whatsappSimulationUrl: waSimUrl,
    };
  }
}
