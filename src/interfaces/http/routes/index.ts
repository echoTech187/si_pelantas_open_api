import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../../infrastructure/database/pgPool';
import { env } from '../../../config/env';
import {
  authenticatePoliceJwt,
  authorizePoliceRoles,
  authenticateSchoolBkJwt,
  authenticateAnyJwt,
} from '../middlewares/authMiddleware';
import { CreateViolationRequestDtoSchema } from '../../../application/dtos/ViolationDto';
import { CreateCounselingVisitDtoSchema } from '../../../application/dtos/CounselingDto';
import { CreateBkFeedbackDtoSchema } from '../../../application/dtos/FeedbackDto';
import { RecordTrafficViolationUseCase } from '../../../application/use-cases/RecordTrafficViolationUseCase';
import { FcmNotificationService } from '../../../infrastructure/services/FcmNotificationService';
import { WablasWhatsappService } from '../../../infrastructure/services/WablasWhatsappService';

export const apiRouter = Router();

const fcmService = new FcmNotificationService();
const wablasService = new WablasWhatsappService();
const recordViolationUseCase = new RecordTrafficViolationUseCase(fcmService, wablasService);

// ============================================================================
// BAGIAN 1: ENDPOINT KHUSUS APLIKASI MOBILE POLRI (`/api/v1/police/...`)
// Autentikasi ke tabel `police_accounts` (Role: POLANTAS & UNIT_KAMSEL)
// ============================================================================

apiRouter.post('/police/auth/login', async (req: Request, res: Response) => {
  try {
    const loginSchema = z.object({
      identifier: z.string().min(3, 'Masukkan NRP atau Username Anggota Polri'),
      password: z.string().min(4),
      fcmToken: z.string().optional(),
    });
    const { identifier, password, fcmToken } = loginSchema.parse(req.body);

    const accountRes = await dbQuery(
      `SELECT * FROM police_accounts
       WHERE nrp = $1 AND is_active = TRUE`,
      [identifier]
    );

    if (accountRes.rowCount === 0) {
      res.status(401).json({ success: false, message: 'NRP atau kata sandi dinas Polri salah. Hanya NRP resmi yang diizinkan.' });
      return;
    }

    const officer = accountRes.rows[0];
    const isMatch = await bcrypt.compare(password, officer.password_hash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'NRP atau kata sandi dinas Polri salah. Hanya NRP resmi yang diizinkan.' });
      return;
    }

    // Hanya daftarkan FCM token ke database jika akun ber-role 'UNIT_KAMSEL'.
    // Akun POLANTAS lapangan tidak menerima push alert ambang batas Kamsel.
    const tokenToSave = officer.role === 'UNIT_KAMSEL' ? (fcmToken ?? null) : null;

    await dbQuery(
      `UPDATE police_accounts
       SET fcm_token = $1, last_login_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [tokenToSave, officer.id]
    );

    const accessToken = jwt.sign(
      {
        accountId: officer.id,
        nrp: officer.nrp,
        username: officer.username,
        institution: 'POLRI',
        role: officer.role,
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
    );

    res.json({
      success: true,
      data: {
        accessToken,
        institution: 'POLRI',
        officer: {
          id: officer.id,
          nrp: officer.nrp,
          username: officer.username,
          fullName: officer.full_name,
          rankTitle: officer.rank_title,
          role: officer.role, // 'POLANTAS' | 'UNIT_KAMSEL'
          division: officer.division,
          sectorArea: officer.sector_area,
          phoneWa: officer.phone_wa,
          photoUrl: officer.photo_url ?? null,
        },
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message ?? 'Invalid login request' });
  }
});

// Master Tipe Pelanggaran Lalu Lintas (Khusus App Polri - Memerlukan Login)
apiRouter.get('/police/violation-types', authenticatePoliceJwt, async (_req: Request, res: Response) => {
  try {
    const result = await dbQuery(
      `SELECT id, code, title, uu_llaj_article, severity_weight, max_fine_idr
       FROM violation_master_types
       WHERE is_active = TRUE
       ORDER BY severity_weight DESC, code ASC`
    );
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal mengambil master pelanggaran' });
  }
});

// Radar & Daftar Sekolah Wilayah Mojokerto untuk Aplikasi Polri (Khusus App Polri - Memerlukan Login)
apiRouter.get('/police/schools', authenticatePoliceJwt, async (_req: Request, res: Response) => {
  const result = await dbQuery(
    `SELECT
       s.id AS "schoolId",
       s.npsn,
       s.name AS "schoolName",
       s.education_level AS "educationLevel",
       d.name AS "districtName",
       d.region_type AS "regionType",
       s.address,
       bk.id AS "bkAccountId",
       COALESCE(bk.full_name, 'Belum Ditentukan') AS "bkTeacherName",
       COALESCE(bk.phone_wa, '-') AS "bkPhoneWa",
       c.id AS "activeCycleId",
       COALESCE(c.cycle_number, 1) AS "cycleNumber",
       COALESCE(c.violation_count, 0) AS "activeViolationCount",
       COALESCE(c.status, 'AMAN') AS "kamselStatus",
       (SELECT COUNT(*)::int FROM traffic_violations tv WHERE tv.school_id = s.id) AS "totalHistoricalViolations",
       (SELECT COUNT(*)::int FROM kamsel_inspection_logs kil WHERE kil.school_id = s.id) AS "totalInspectionsCount",
       (SELECT MAX(kv.visit_date)::text FROM kamsel_counseling_visits kv WHERE kv.school_id = s.id) AS "lastCounselingVisitDate"
     FROM schools s
     JOIN districts d ON d.id = s.district_id
     LEFT JOIN school_bk_accounts bk ON bk.school_id = s.id AND bk.is_primary_pic = TRUE AND bk.is_active = TRUE
     LEFT JOIN kamsel_evaluation_cycles c ON c.school_id = s.id AND c.status <> 'SELESAI_DIEVALUASI'
     WHERE s.is_active = TRUE
     ORDER BY COALESCE(c.violation_count, 0) DESC, s.name ASC`
  );

  res.json({
    success: true,
    meta: {
      warningThreshold: env.KAMSEL_WARNING_THRESHOLD,
      visitThreshold: env.KAMSEL_VISIT_THRESHOLD,
    },
    data: result.rows,
  });
});

// Endpoint untuk melihat daftar pelanggar secara detail per sekolah (Untuk App Polri Unit Kamsel)
apiRouter.get('/police/schools/:schoolId/violations', authenticatePoliceJwt, async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const result = await dbQuery(
      `SELECT
         v.id,
         v.ticket_number AS "ticketNumber",
         st.full_name AS "studentName",
         st.nisn AS "studentNisn",
         st.class_name AS "studentClass",
         v.vehicle_plate_number AS "vehiclePlateNumber",
         v.vehicle_brand_type AS "vehicleType",
         v.incident_location AS "incidentLocation",
         v.officer_notes AS "officerNotes",
         v.incident_at AS "incidentAt",
         v.evidence_photo_url AS "evidencePhotoUrl",
         pa.full_name AS "polantasOfficer",
         COALESCE(
           (SELECT GROUP_CONCAT(vmt.title SEPARATOR ', ')
            FROM traffic_violation_items tvi
            JOIN violation_master_types vmt ON vmt.id = tvi.violation_type_id
            WHERE tvi.violation_id = v.id),
           '-'
         ) AS "violationSummary"
       FROM traffic_violations v
       JOIN students st ON st.id = v.student_id
       JOIN police_accounts pa ON pa.id = v.polantas_account_id
       WHERE v.school_id = $1
       ORDER BY v.incident_at DESC`,
      [schoolId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message ?? 'Gagal memuat detail pelanggaran sekolah',
    });
  }
});

// Input Penindakan Tilang Siswa di Lapangan (Khusus App Polri - Role: POLANTAS)
apiRouter.post(
  '/police/violations',
  authenticatePoliceJwt,
  authorizePoliceRoles('POLANTAS'),
  async (req: Request, res: Response) => {
    try {
      const dto = CreateViolationRequestDtoSchema.parse(req.body);
      const result = await recordViolationUseCase.execute(req.policeUser!.accountId, dto);
      res.status(201).json({
        success: true,
        message: 'Data tilang berhasil dicatat oleh Polantas & notifikasi dikirim ke App Guru BK (serta Unit Kamsel bila mencapai ambang batas).',
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        message: err?.message ?? 'Gagal menyimpan data pelanggaran lalu lintas',
      });
    }
  }
);

// Input Berita Acara Kunjungan Penyuluhan & Evaluasi Sekolah (Khusus App Polri - Role: UNIT_KAMSEL)
apiRouter.post(
  ['/police/counseling-visits', '/police/kamsel/visits'],
  authenticatePoliceJwt,
  authorizePoliceRoles('UNIT_KAMSEL'),
  async (req: Request, res: Response) => {
    try {
      const dto = CreateCounselingVisitDtoSchema.parse(req.body);
      const visitResult = await withTransaction(async (client) => {
        const activeCycleRes = await client.query(
          `SELECT c.*, bk.id AS bk_account_id
           FROM kamsel_evaluation_cycles c
           LEFT JOIN school_bk_accounts bk ON bk.school_id = c.school_id AND bk.is_primary_pic = TRUE AND bk.is_active = TRUE
           WHERE c.school_id = $1 AND c.status <> 'SELESAI_DIEVALUASI'
           FOR UPDATE OF c`,
          [dto.schoolId]
        );

        if (activeCycleRes.rowCount === 0) {
          throw new Error('Tidak ditemukan siklus evaluasi aktif untuk sekolah ini');
        }
        const currentCycle = activeCycleRes.rows[0];

        const insertVisit = await client.query(
          `INSERT INTO kamsel_counseling_visits (
             cycle_id, school_id, kamsel_account_id, bk_account_id,
             coordination_channel, visit_date, violation_count_at_visit,
             counseling_topic, kamsel_directive_summary, school_evaluation_result,
             school_follow_up_commitment, documentation_photo_url
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            currentCycle.id,
            dto.schoolId,
            req.policeUser!.accountId,
            currentCycle.bk_account_id ?? null,
            dto.coordinationChannel,
            dto.visitDate,
            currentCycle.violation_count,
            dto.counselingTopic,
            dto.kamselDirectiveSummary,
            dto.schoolEvaluationResult,
            dto.schoolFollowUpCommitment,
            dto.documentationPhotoUrl ?? null,
          ]
        );

        // ---------------------------------------------------------------------
        // LOG AUDIT TERPISAH SIDAK & ARAHAN PEMBINAAN KAMSEL (Sesuai RULES.md)
        // 1. Dapatkan nomor urut sidak sekolah ini (Sidak ke-1, ke-2, dst.)
        // 2. Simpan snapshot detail pelanggaran siswa saat sidak
        // ---------------------------------------------------------------------
        const seqRes = await client.query(
          `SELECT COALESCE(MAX(inspection_sequence), 0) + 1 AS next_seq
           FROM kamsel_inspection_logs
           WHERE school_id = $1`,
          [dto.schoolId]
        );
        const nextSequence = Number(seqRes.rows[0]?.next_seq ?? 1);

        const violationsSnapshotRes = await client.query(
          `SELECT
             v.ticket_number AS "ticketNumber",
             st.full_name AS "studentName",
             st.class_name AS "studentClass",
             v.vehicle_plate_number AS "vehiclePlateNumber",
             v.incident_location AS "incidentLocation",
             v.incident_at AS "incidentAt",
             COALESCE(
               (SELECT GROUP_CONCAT(vmt.title SEPARATOR ', ')
                FROM traffic_violation_items tvi
                JOIN violation_master_types vmt ON vmt.id = tvi.violation_type_id
                WHERE tvi.violation_id = v.id),
               '-'
             ) AS "violationSummary"
           FROM traffic_violations v
           JOIN students st ON st.id = v.student_id
           WHERE v.school_id = $1
           ORDER BY v.incident_at DESC
           LIMIT 50`,
          [dto.schoolId]
        );

        const insertInspection = await client.query(
          `INSERT INTO kamsel_inspection_logs (
             school_id, cycle_id, kamsel_account_id, bk_account_id,
             inspection_sequence, visit_date, counseling_topic,
             kamsel_directive_summary, school_evaluation_result,
             school_follow_up_commitment, student_attendee_count,
             violation_count_at_visit, violations_snapshot,
             documentation_photo_url
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *`,
          [
            dto.schoolId,
            currentCycle.id,
            req.policeUser!.accountId,
            currentCycle.bk_account_id ?? null,
            nextSequence,
            dto.visitDate,
            dto.counselingTopic,
            dto.kamselDirectiveSummary,
            dto.schoolEvaluationResult,
            dto.schoolFollowUpCommitment,
            dto.studentAttendeeCount ?? 0,
            currentCycle.violation_count,
            JSON.stringify(violationsSnapshotRes.rows),
            dto.documentationPhotoUrl ?? null,
          ]
        );

        await client.query(
          `UPDATE kamsel_evaluation_cycles
           SET status = 'SELESAI_DIEVALUASI', closed_at = NOW()
           WHERE id = $1`,
          [currentCycle.id]
        );

        await client.query(
          `INSERT INTO kamsel_evaluation_cycles (
             school_id, cycle_number, violation_count,
             warning_threshold_snapshot, visit_threshold_snapshot, status
           ) VALUES ($1, $2, 0, $3, $4, 'AMAN')`,
          [
            dto.schoolId,
            Number(currentCycle.cycle_number) + 1,
            env.KAMSEL_WARNING_THRESHOLD,
            env.KAMSEL_VISIT_THRESHOLD,
          ]
        );

        return {
          ...insertVisit.rows[0],
          inspectionLog: insertInspection.rows[0],
        };
      });

      // Memicu notifikasi FCM ke Guru BK agar memberikan feedback
      if (visitResult.bk_account_id) {
        dbQuery(
          `SELECT fcm_token, full_name FROM school_bk_accounts WHERE id = $1`,
          [visitResult.bk_account_id]
        ).then((bkAccRes) => {
          const bkAcc = bkAccRes.rows[0];
          if (bkAcc?.fcm_token) {
            fcmService.sendToSchoolBk({
              schoolId: dto.schoolId,
              recipientInstitution: 'SCHOOL_BK',
              bkAccountId: visitResult.bk_account_id,
              fcmTokens: [bkAcc.fcm_token],
              title: '📝 [FEEDBACK KAMSEL] Berikan Penilaian Kunjungan Kamsel',
              body: `Unit Kamsel telah menyelesaikan kunjungan sidak/arahan di sekolah. Silakan berikan penilaian & feedback Anda.`,
              dataPayload: {
                targetApp: 'SCHOOL_BK_APP',
                type: 'KAMSEL_FEEDBACK_REQUEST',
                inspectionLogId: visitResult.inspectionLog.id,
              },
            }).catch(console.error);
          }
        }).catch(console.error);
      }

      res.status(201).json({
        success: true,
        message: 'Berita acara penyuluhan & evaluasi Unit Kamsel berhasil disimpan dan siklus sekolah telah di-reset ke 0.',
        data: visitResult,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        message: err?.message ?? 'Gagal menyimpan evaluasi penyuluhan Unit Kamsel',
      });
    }
  }
);

// ============================================================================
// BAGIAN 2: ENDPOINT KHUSUS APLIKASI MOBILE GURU BK (`/api/v1/school-bk/...`)
// Autentikasi ke tabel `school_bk_accounts` (Terkunci ketat per `school_id`)
// ============================================================================

// Endpoint Publik Daftar Akun Guru BK Sekolah Binaan Mojokerto (untuk dropdown login BK & aplikasi)
apiRouter.get(['/school-bk/auth/schools', '/schools/bk-accounts'], async (req: Request, res: Response) => {
  try {
    const result = await dbQuery(
      `SELECT
         s.id AS "schoolId",
         s.name AS "schoolName",
         s.npsn,
         d.name AS "districtName",
         bk.id AS "bkAccountId",
         bk.nip_or_nuptk AS "nip",
         bk.full_name AS "teacherName",
         bk.phone_wa AS "phoneWa"
       FROM schools s
       JOIN districts d ON d.id = s.district_id
       JOIN school_bk_accounts bk ON bk.school_id = s.id AND bk.is_active = TRUE
       ORDER BY s.name ASC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message ?? 'Gagal memuat daftar sekolah dan akun BK',
    });
  }
});

apiRouter.post('/school-bk/auth/login', async (req: Request, res: Response) => {
  try {
    const loginSchema = z.object({
      identifier: z.string().min(3, 'Masukkan NIP/NUPTK atau Username Guru BK'),
      password: z.string().min(4),
      fcmToken: z.string().optional(),
    });
    const { identifier, password, fcmToken } = loginSchema.parse(req.body);

    const bkRes = await dbQuery(
      `SELECT bk.*, s.name AS school_name, s.npsn, d.name AS district_name
       FROM school_bk_accounts bk
       JOIN schools s ON s.id = bk.school_id
       JOIN districts d ON d.id = s.district_id
       WHERE bk.nip_or_nuptk = $1 AND bk.is_active = TRUE`,
      [identifier]
    );

    if (bkRes.rowCount === 0) {
      res.status(401).json({ success: false, message: 'NIP/NUPTK atau kata sandi Guru BK salah. Hanya NIP/NUPTK resmi yang diizinkan.' });
      return;
    }

    const bkTeacher = bkRes.rows[0];
    const isMatch = await bcrypt.compare(password, bkTeacher.password_hash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'NIP/NUPTK atau kata sandi Guru BK salah. Hanya NIP/NUPTK resmi yang diizinkan.' });
      return;
    }

    const prevLoginAt = bkTeacher.last_login_at;

    await dbQuery(
      `UPDATE school_bk_accounts
       SET fcm_token = COALESCE($1, fcm_token), last_login_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [fcmToken ?? null, bkTeacher.id]
    );

    // -------------------------------------------------------------------------
    // MISSED / UNACKNOWLEDGED NOTIFICATION RESEND PADA SAAT LOGIN GURU BK
    // Skenario:
    // 1. Tilang dibuat saat Guru BK sedang logout atau token kosong (status SKIPPED/FAILED)
    // 2. Tilang dibuat saat Kamsel aktif di perangkat dan Guru BK baru login belakangan
    //    (created_at >= prevLoginAt, belum pernah di-resend ke session login ini)
    // 3. Notifikasi Wajib Penyuluhan Kamsel (>= 7) atau tilang siswa dalam 24 jam terakhir
    // -------------------------------------------------------------------------
    if (fcmToken) {
      setTimeout(async () => {
        try {
          const missedNotifs = await dbQuery(
            `SELECT nl.id, nl.school_id, nl.cycle_id, nl.violation_id,
                    nl.bk_account_id, nl.title, nl.message_body, nl.created_at
             FROM notification_logs nl
             WHERE (nl.bk_account_id = $1 OR (nl.school_id = $2 AND nl.recipient_institution = 'SCHOOL_BK'))
               AND nl.channel = 'FCM'
               AND (
                 nl.delivery_status IN ('SKIPPED', 'FAILED')
                 OR (
                   $3::timestamptz IS NOT NULL
                   AND nl.created_at >= ($3::timestamptz - INTERVAL '30 seconds')
                   AND (nl.provider_response IS NULL OR (nl.provider_response NOT LIKE '%RESENT_ON_LOGIN%' AND nl.provider_response NOT LIKE '%RESENT_COPY%'))
                 )
                 OR (
                   $3::timestamptz IS NULL
                   AND nl.created_at >= (NOW() - INTERVAL '24 hours')
                   AND (nl.provider_response IS NULL OR (nl.provider_response NOT LIKE '%RESENT_ON_LOGIN%' AND nl.provider_response NOT LIKE '%RESENT_COPY%'))
                 )
               )
               AND nl.created_at >= NOW() - INTERVAL '7 days'
             ORDER BY nl.created_at ASC
             LIMIT 5`,
            [bkTeacher.id, bkTeacher.school_id, prevLoginAt]
          );

          let resentCount = 0;
          for (const missed of missedNotifs.rows) {
            await fcmService.sendToSchoolBk({
              schoolId: missed.school_id,
              violationId: missed.violation_id ?? undefined,
              cycleId: missed.cycle_id ?? undefined,
              recipientInstitution: 'SCHOOL_BK',
              bkAccountId: bkTeacher.id,
              fcmTokens: [fcmToken],
              title: missed.title,
              body: missed.message_body,
              dataPayload: {
                targetApp: 'SCHOOL_BK_APP',
                missedNotification: 'true',
                title: missed.title,
                body: missed.message_body,
                ...(missed.violation_id ? { violationId: missed.violation_id } : {}),
                ...(missed.school_id ? { schoolId: missed.school_id } : {}),
              },
            });

            // Tandai log lama agar tidak di-resend berulang
            await dbQuery(
              `UPDATE notification_logs
               SET delivery_status = 'SENT', provider_response = 'RESENT_ON_LOGIN'
               WHERE id = $1`,
              [missed.id]
            );
            resentCount++;
          }

          if (resentCount > 0) {
            console.log(
              `[MISSED-NOTIF] Berhasil mengirim ulang ${resentCount} notifikasi terlewat ke Guru BK: ${bkTeacher.full_name} (${bkTeacher.id})`
            );
          }
        } catch (missedErr: any) {
          console.error('[MISSED-NOTIF] Error saat resend notifikasi terlewat:', missedErr?.message);
        }
      }, 1500);
    }

    const accessToken = jwt.sign(
      {
        accountId: bkTeacher.id,
        nipOrNuptk: bkTeacher.nip_or_nuptk,
        username: bkTeacher.username,
        institution: 'SCHOOL_BK',
        role: 'GURU_BK',
        schoolId: bkTeacher.school_id,
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
    );

    res.json({
      success: true,
      data: {
        accessToken,
        institution: 'SCHOOL_BK',
        bkTeacher: {
          id: bkTeacher.id,
          nipOrNuptk: bkTeacher.nip_or_nuptk,
          username: bkTeacher.username,
          fullName: bkTeacher.full_name,
          phoneWa: bkTeacher.phone_wa,
          isPrimaryPic: bkTeacher.is_primary_pic == 1 || bkTeacher.is_primary_pic === true || bkTeacher.is_primary_pic === '1',
          schoolId: bkTeacher.school_id,
          schoolName: bkTeacher.school_name,
          npsn: bkTeacher.npsn,
          districtName: bkTeacher.district_name,
          photoUrl: bkTeacher.photo_url ?? null,
        },
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message ?? 'Invalid login request' });
  }
});

// Logout Guru BK (Membersihkan FCM token di server)
apiRouter.post('/school-bk/auth/logout', authenticateSchoolBkJwt, async (req: Request, res: Response) => {
  try {
    await dbQuery(
      `UPDATE school_bk_accounts SET fcm_token = NULL, updated_at = NOW() WHERE id = $1`,
      [req.bkUser!.accountId]
    );
    res.json({ success: true, message: 'Berhasil logout dan membersihkan FCM token.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal logout' });
  }
});

// Logout Personel Polri (Membersihkan FCM token di server)
apiRouter.post('/police/auth/logout', authenticatePoliceJwt, async (req: Request, res: Response) => {
  try {
    await dbQuery(
      `UPDATE police_accounts SET fcm_token = NULL, updated_at = NOW() WHERE id = $1`,
      [req.policeUser!.accountId]
    );
    res.json({ success: true, message: 'Berhasil logout dan membersihkan FCM token.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal logout' });
  }
});

// Ringkasan Dashboard & Daftar Pelanggaran Siswa Khusus Sekolah Tempat Guru BK Bertugas
apiRouter.get('/school-bk/dashboard', authenticateSchoolBkJwt, async (req: Request, res: Response) => {
  try {
    const schoolId = req.bkUser!.schoolId;

  const [schoolSummaryRes, violationsRes, visitsRes, pendingFeedbackRes, inspectionsCountRes] = await Promise.all([
    dbQuery(
      `SELECT
         s.id AS "schoolId",
         s.npsn,
         s.name AS "schoolName",
         d.name AS "districtName",
         s.address,
         COALESCE(c.cycle_number, 1) AS "cycleNumber",
         COALESCE(c.violation_count, 0) AS "activeViolationCount",
         COALESCE(c.status, 'AMAN') AS "kamselStatus",
         (SELECT COUNT(*)::int FROM traffic_violations tv WHERE tv.school_id = s.id) AS "totalHistoricalViolations"
       FROM schools s
       JOIN districts d ON d.id = s.district_id
       LEFT JOIN kamsel_evaluation_cycles c ON c.school_id = s.id AND c.status <> 'SELESAI_DIEVALUASI'
       WHERE s.id = $1`,
      [schoolId]
    ),
    dbQuery(
      `SELECT
         v.id,
         v.ticket_number AS "ticketNumber",
         st.full_name AS "studentName",
         st.nisn AS "studentNisn",
         st.class_name AS "studentClass",
         v.vehicle_plate_number AS "vehiclePlateNumber",
         v.vehicle_brand_type AS "vehicleType",
         v.incident_location AS "incidentLocation",
         v.officer_notes AS "officerNotes",
         v.incident_at AS "incidentAt",
         CONCAT(pa.rank_title, ' ', pa.full_name) AS "polantasOfficer",
         COALESCE(
           (SELECT GROUP_CONCAT(vmt.title SEPARATOR ', ')
            FROM traffic_violation_items tvi
            JOIN violation_master_types vmt ON vmt.id = tvi.violation_type_id
            WHERE tvi.violation_id = v.id),
           '-'
         ) AS "violationSummary"
       FROM traffic_violations v
       JOIN students st ON st.id = v.student_id
       JOIN police_accounts pa ON pa.id = v.polantas_account_id
       WHERE v.school_id = $1
       ORDER BY v.incident_at DESC
       LIMIT 50`,
      [schoolId]
    ),
    dbQuery(
      `SELECT
         kv.id,
         kv.visit_date AS "visitDate",
         kv.violation_count_at_visit AS "violationCountAtVisit",
         kv.counseling_topic AS "counselingTopic",
         kv.kamsel_directive_summary AS "kamselDirectiveSummary",
         kv.school_evaluation_result AS "schoolEvaluationResult",
         kv.school_follow_up_commitment AS "schoolFollowUpCommitment",
         CONCAT(pa.rank_title, ' ', pa.full_name) AS "kamselOfficerName"
       FROM kamsel_counseling_visits kv
       JOIN police_accounts pa ON pa.id = kv.kamsel_account_id
       WHERE kv.school_id = $1
       ORDER BY kv.visit_date DESC`,
      [schoolId]
    ),
    dbQuery(
      `SELECT
         il.id,
         il.inspection_sequence AS "inspectionSequence",
         il.visit_date AS "visitDate",
         il.counseling_topic AS "counselingTopic",
         il.kamsel_directive_summary AS "kamselDirectiveSummary",
         pa.full_name AS "kamselOfficerName",
         pa.rank_title AS "kamselOfficerRank"
       FROM kamsel_inspection_logs il
       JOIN police_accounts pa ON pa.id = il.kamsel_account_id
       LEFT JOIN kamsel_counseling_feedbacks fb ON fb.inspection_log_id = il.id
       WHERE il.school_id = $1 AND fb.id IS NULL
       ORDER BY il.inspection_sequence DESC
       LIMIT 1`,
      [schoolId]
    ),
    dbQuery(
      `SELECT COUNT(*)::int AS count FROM kamsel_inspection_logs WHERE school_id = $1`,
      [schoolId]
    ),
  ]);

  const schoolData = schoolSummaryRes.rows[0] ?? null;
  const violationsList = violationsRes.rows ?? [];
  const totalViolationsCount = schoolData ? (schoolData.activeViolationCount ?? violationsList.length) : violationsList.length;

  res.json({
    success: true,
    data: {
      school: schoolData,
      violations: violationsList,
      counselingVisits: visitsRes.rows ?? [],
      pendingFeedback: pendingFeedbackRes.rows[0] ?? null,
      totalInspectionsCount: inspectionsCountRes.rows[0]?.count ?? 0,
      // Compatibility alias fields expected by Flutter frontend
      recent_violations: violationsList.map((v: any) => ({
        id: v.id,
        ticket_number: v.ticketNumber,
        student_name: v.studentName,
        student_nisn: v.studentNisn,
        student_class: v.studentClass,
        vehicle_plate_number: v.vehiclePlateNumber,
        vehicle_brand_type: v.vehicleType,
        incident_location: v.incidentLocation,
        officer_notes: v.officerNotes,
        violation_date: v.incidentAt,
        polantas_officer: v.polantasOfficer,
        violation_types: v.violationSummary ? v.violationSummary.split(', ') : ['Pelanggaran Lalu Lintas'],
        counseling_status: 'PENDING',
      })),
      stats: {
        total_violations: totalViolationsCount,
        treated_violations: 0,
        pending_counseling: totalViolationsCount,
        school_safety_index: Math.max(100 - (totalViolationsCount * 3), 60),
      },
      active_cycle: schoolData ? {
        cycle_number: schoolData.cycleNumber,
        violation_count: schoolData.activeViolationCount,
        status: schoolData.kamselStatus,
      } : null,
    },
  });
} catch (err: any) {
  console.error('Error in /school-bk/dashboard:', err);
  res.status(500).json({ success: false, message: err?.message ?? 'Gagal memuat dashboard BK' });
}
});


// ============================================================================
// BAGIAN 3: ENDPOINT TARIK DATA LAPORAN KE EXCEL (.CSV) & PDF DATA
// Sesuai Konfirmasi Klien: "Data bisa ditarik ke pdf/excel"
// ============================================================================

apiRouter.get('/police/reports/export-csv', authenticatePoliceJwt, async (req: Request, res: Response) => {
  const schoolId = req.query.schoolId as string | undefined;
  const result = await dbQuery(
    `SELECT
       v.ticket_number AS "No_Tilang",
       DATE_FORMAT(v.incident_at, '%Y-%m-%d %H:%i') AS "Waktu_Kejadian",
       s.name AS "Nama_Sekolah",
       d.name AS "Kecamatan",
       st.full_name AS "Nama_Siswa",
       st.class_name AS "Kelas",
       v.vehicle_plate_number AS "Plat_Nomor",
       COALESCE(
         (SELECT GROUP_CONCAT(vmt.title SEPARATOR '; ')
          FROM traffic_violation_items tvi
          JOIN violation_master_types vmt ON vmt.id = tvi.violation_type_id
          WHERE tvi.violation_id = v.id),
         '-'
       ) AS "Jenis_Pelanggaran",
       c.cycle_number AS "Siklus_Ke",
       c.status AS "Status_Kamsel_Sekolah",
       CONCAT(pa.rank_title, ' ', pa.full_name) AS "Petugas_Polantas"
     FROM traffic_violations v
     JOIN schools s ON s.id = v.school_id
     JOIN districts d ON d.id = s.district_id
     JOIN students st ON st.id = v.student_id
     JOIN kamsel_evaluation_cycles c ON c.id = v.cycle_id
     JOIN police_accounts pa ON pa.id = v.polantas_account_id
     ${schoolId ? 'WHERE v.school_id = $1' : ''}
     ORDER BY v.incident_at DESC`,
    schoolId ? [schoolId] : []
  );

  const headers = [
    'No_Tilang', 'Waktu_Kejadian', 'Nama_Sekolah', 'Kecamatan',
    'Nama_Siswa', 'Kelas', 'Plat_Nomor', 'Jenis_Pelanggaran',
    'Siklus_Ke', 'Status_Kamsel_Sekolah', 'Petugas_Polantas'
  ];
  const csvRows = [
    headers.join(','),
    ...result.rows.map((r: any) =>
      headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="Rekap_Pelanggaran_Polantas_Mojokerto.csv"');
  res.send(csvRows.join('\n'));
});

apiRouter.get('/school-bk/reports/export-csv', authenticateSchoolBkJwt, async (req: Request, res: Response) => {
  const schoolId = req.bkUser!.schoolId;
  const result = await dbQuery(
    `SELECT
       v.ticket_number AS "No_Tilang",
       DATE_FORMAT(v.incident_at, '%Y-%m-%d %H:%i') AS "Waktu_Kejadian",
       s.name AS "Nama_Sekolah",
       st.full_name AS "Nama_Siswa",
       st.class_name AS "Kelas",
       v.vehicle_plate_number AS "Plat_Nomor",
       COALESCE(
         (SELECT GROUP_CONCAT(vmt.title SEPARATOR '; ')
          FROM traffic_violation_items tvi
          JOIN violation_master_types vmt ON vmt.id = tvi.violation_type_id
          WHERE tvi.violation_id = v.id),
         '-'
       ) AS "Jenis_Pelanggaran",
       CONCAT(pa.rank_title, ' ', pa.full_name) AS "Petugas_Penindak"
     FROM traffic_violations v
     JOIN schools s ON s.id = v.school_id
     JOIN students st ON st.id = v.student_id
     JOIN police_accounts pa ON pa.id = v.polantas_account_id
     WHERE v.school_id = $1
     ORDER BY v.incident_at DESC`,
    [schoolId]
  );

  const headers = [
    'No_Tilang', 'Waktu_Kejadian', 'Nama_Sekolah',
    'Nama_Siswa', 'Kelas', 'Plat_Nomor', 'Jenis_Pelanggaran', 'Petugas_Penindak'
  ];
  const csvRows = [
    headers.join(','),
    ...result.rows.map((r: any) =>
      headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="Rekap_Pelanggaran_BK_Sekolah.csv"');
  res.send(csvRows.join('\n'));
});

// ----------------------------------------------------------------------------
// BAGIAN 3: ENDPOINTS PENGATURAN PROFIL & KATA SANDI (POLRI & GURU BK)
// ----------------------------------------------------------------------------

// Update Profile Polri
apiRouter.patch('/police/profile', authenticatePoliceJwt, async (req: Request, res: Response) => {
  try {
    const accountId = req.policeUser!.accountId;
    const { fullName, phoneWa, photoUrl } = req.body;

    const result = await dbQuery(
      `UPDATE police_accounts
       SET full_name = COALESCE($1, full_name),
           phone_wa = COALESCE($2, phone_wa),
           photo_url = COALESCE($3, photo_url),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, nrp, username, full_name AS "fullName", rank_title AS "rankTitle", role, division, sector_area AS "sectorArea", phone_wa AS "phoneWa", photo_url AS "photoUrl"`,
      [fullName ?? null, phoneWa ?? null, photoUrl ?? null, accountId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Akun Polri tidak ditemukan' });
      return;
    }

    res.json({
      success: true,
      message: 'Profil anggota Polri berhasil diperbarui',
      data: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal memperbarui profil' });
  }
});

// Ganti Password Polri
apiRouter.post('/police/change-password', authenticatePoliceJwt, async (req: Request, res: Response) => {
  try {
    const accountId = req.policeUser!.accountId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ success: false, message: 'Kata sandi baru minimal 6 karakter' });
      return;
    }

    const check = await dbQuery('SELECT password_hash FROM police_accounts WHERE id = $1', [accountId]);
    if (check.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Akun Polri tidak ditemukan' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, check.rows[0].password_hash);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Kata sandi saat ini tidak sesuai' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await dbQuery('UPDATE police_accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, accountId]);

    res.json({ success: true, message: 'Kata sandi berhasil diperbarui' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal mengubah kata sandi' });
  }
});

// Update Token FCM Guru BK
apiRouter.post('/school-bk/fcm-token', authenticateSchoolBkJwt, async (req: Request, res: Response) => {
  try {
    const accountId = req.bkUser!.accountId;
    const { fcmToken } = req.body;
    if (!fcmToken) {
      res.status(400).json({ success: false, message: 'fcmToken required' });
      return;
    }
    await dbQuery(
      'UPDATE school_bk_accounts SET fcm_token = $1, updated_at = NOW() WHERE id = $2',
      [fcmToken, accountId]
    );
    res.json({ success: true, message: 'FCM Token Guru BK berhasil diperbarui' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal memperbarui FCM token' });
  }
});

// Update Profile Guru BK
apiRouter.patch('/school-bk/profile', authenticateSchoolBkJwt, async (req: Request, res: Response) => {
  try {
    const accountId = req.bkUser!.accountId;
    const { fullName, phoneWa, photoUrl } = req.body;

    const result = await dbQuery(
      `UPDATE school_bk_accounts
       SET full_name = COALESCE($1, full_name),
           phone_wa = COALESCE($2, phone_wa),
           photo_url = COALESCE($3, photo_url),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, school_id AS "schoolId", nip_or_nuptk AS "nipOrNuptk", username, full_name AS "fullName", phone_wa AS "phoneWa", photo_url AS "photoUrl"`,
      [fullName ?? null, phoneWa ?? null, photoUrl ?? null, accountId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Akun Guru BK tidak ditemukan' });
      return;
    }

    res.json({
      success: true,
      message: 'Profil Guru BK berhasil diperbarui',
      data: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal memperbarui profil' });
  }
});

// Ganti Password Guru BK
apiRouter.post('/school-bk/change-password', authenticateSchoolBkJwt, async (req: Request, res: Response) => {
  try {
    const accountId = req.bkUser!.accountId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 4) {
      res.status(400).json({ success: false, message: 'Kata sandi baru minimal 4 karakter' });
      return;
    }

    const check = await dbQuery('SELECT password_hash FROM school_bk_accounts WHERE id = $1', [accountId]);
    if (check.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Akun Guru BK tidak ditemukan' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, check.rows[0].password_hash);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Kata sandi saat ini tidak sesuai' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await dbQuery('UPDATE school_bk_accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, accountId]);

    res.json({ success: true, message: 'Kata sandi berhasil diperbarui' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal mengubah kata sandi' });
  }
});

// ============================================================================
// BAGIAN 4: AUDIT LOG SIDAK KAMSEL, RIWAYAT PENANGANAN, FEEDBACK GURU BK,
// & LEADERBOARD EVALUASI KAMSEL (SESUAI RULES.md & PERMINTAAN PENGGUNA)
// ============================================================================

// 1. Riwayat Log Sidak & Penanganan Sekolah Tertentu (Aplikasi Polri / Unit Kamsel)
apiRouter.get('/police/inspections/school/:schoolId', authenticatePoliceJwt, async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;

    const schoolRes = await dbQuery(
      `SELECT s.id, s.name, s.npsn, d.name AS "districtName",
              (SELECT COUNT(*)::int FROM kamsel_inspection_logs kil WHERE kil.school_id = s.id) AS "totalInspectionsCount",
              (SELECT COALESCE(ROUND(AVG(fb.rating_stars)::numeric, 1), 0.0)::float
               FROM kamsel_counseling_feedbacks fb
               WHERE fb.school_id = s.id) AS "averageFeedbackRating"
       FROM schools s
       JOIN districts d ON d.id = s.district_id
       WHERE s.id = $1`,
      [schoolId]
    );

    if (schoolRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Sekolah tidak ditemukan' });
      return;
    }

    const inspectionsRes = await dbQuery(
      `SELECT
         il.id,
         il.school_id AS "schoolId",
         il.cycle_id AS "cycleId",
         il.inspection_sequence AS "inspectionSequence",
         il.visit_date AS "visitDate",
         il.counseling_topic AS "counselingTopic",
         il.kamsel_directive_summary AS "kamselDirectiveSummary",
         il.school_evaluation_result AS "schoolEvaluationResult",
         il.school_follow_up_commitment AS "schoolFollowUpCommitment",
         il.student_attendee_count AS "studentAttendeeCount",
         il.violation_count_at_visit AS "violationCountAtVisit",
         il.violations_snapshot AS "violationsSnapshot",
         il.documentation_photo_url AS "documentationPhotoUrl",
         il.created_at AS "createdAt",
         pa.full_name AS "officerName",
         pa.rank_title AS "officerRank",
         pa.nrp AS "officerNrp",
         fb.id AS "feedbackId",
         fb.rating_stars AS "feedbackRating",
         fb.clarity_rating AS "feedbackClarity",
         fb.helpfulness_rating AS "feedbackHelpfulness",
         fb.attitude_rating AS "feedbackAttitude",
         fb.feedback_notes AS "feedbackNotes",
         fb.created_at AS "feedbackSubmittedAt",
         bk.full_name AS "bkTeacherName"
       FROM kamsel_inspection_logs il
       JOIN police_accounts pa ON pa.id = il.kamsel_account_id
       LEFT JOIN kamsel_counseling_feedbacks fb ON fb.inspection_log_id = il.id
       LEFT JOIN school_bk_accounts bk ON bk.id = fb.bk_account_id
       WHERE il.school_id = $1
       ORDER BY il.inspection_sequence DESC`,
      [schoolId]
    );

    res.json({
      success: true,
      data: {
        school: schoolRes.rows[0],
        inspections: inspectionsRes.rows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal memuat riwayat sidak' });
  }
});

// 2. Leaderboard Kinerja Personel Unit Kamsel (Aplikasi Polri)
apiRouter.get('/police/kamsel/leaderboard', authenticatePoliceJwt, async (_req: Request, res: Response) => {
  try {
    const leaderboardRes = await dbQuery(
      `SELECT
         pa.id AS "kamselAccountId",
         pa.full_name AS "officerName",
         pa.rank_title AS "rankTitle",
         pa.nrp AS "badgeNumber",
         pa.photo_url AS "photoUrl",
         COUNT(DISTINCT il.id)::int AS "totalInspections",
         COUNT(DISTINCT fb.id)::int AS "totalFeedbacks",
         COALESCE(ROUND(AVG(fb.rating_stars)::numeric, 1), 0.0)::float AS "averageRating",
         COALESCE(ROUND(AVG(fb.clarity_rating)::numeric, 1), 0.0)::float AS "avgClarity",
         COALESCE(ROUND(AVG(fb.helpfulness_rating)::numeric, 1), 0.0)::float AS "avgHelpfulness",
         COALESCE(ROUND(AVG(fb.attitude_rating)::numeric, 1), 0.0)::float AS "avgAttitude"
       FROM police_accounts pa
       LEFT JOIN kamsel_inspection_logs il ON il.kamsel_account_id = pa.id
       LEFT JOIN kamsel_counseling_feedbacks fb ON fb.kamsel_account_id = pa.id
       WHERE pa.division = 'UNIT_KAMSEL' OR pa.role = 'UNIT_KAMSEL'
       GROUP BY pa.id, pa.full_name, pa.rank_title, pa.nrp, pa.photo_url
       ORDER BY "averageRating" DESC, "totalFeedbacks" DESC, "totalInspections" DESC`
    );

    // Ambil testimoni terbaru dari guru BK untuk apresiasi kinerja
    const recentFeedbacksRes = await dbQuery(
      `SELECT
         fb.id,
         fb.rating_stars AS "ratingStars",
         fb.feedback_notes AS "feedbackNotes",
         fb.created_at AS "createdAt",
         s.name AS "schoolName",
         bk.full_name AS "bkTeacherName",
         pa.full_name AS "kamselOfficerName",
         pa.rank_title AS "kamselOfficerRank"
       FROM kamsel_counseling_feedbacks fb
       JOIN schools s ON s.id = fb.school_id
       JOIN school_bk_accounts bk ON bk.id = fb.bk_account_id
       JOIN police_accounts pa ON pa.id = fb.kamsel_account_id
       ORDER BY fb.created_at DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        leaderboard: leaderboardRes.rows,
        recentFeedbacks: recentFeedbacksRes.rows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal memuat leaderboard kamsel' });
  }
});

// 3. Riwayat Sidak Kamsel untuk Guru BK (Aplikasi BK Sekolah)
apiRouter.get('/school-bk/inspections', authenticateSchoolBkJwt, async (req: Request, res: Response) => {
  try {
    const schoolId = req.bkUser!.schoolId;

    const inspectionsRes = await dbQuery(
      `SELECT
         il.id,
         il.inspection_sequence AS "inspectionSequence",
         il.visit_date AS "visitDate",
         il.counseling_topic AS "counselingTopic",
         il.kamsel_directive_summary AS "kamselDirectiveSummary",
         il.school_evaluation_result AS "schoolEvaluationResult",
         il.school_follow_up_commitment AS "schoolFollowUpCommitment",
         il.student_attendee_count AS "studentAttendeeCount",
         il.violation_count_at_visit AS "violationCountAtVisit",
         il.violations_snapshot AS "violationsSnapshot",
         il.documentation_photo_url AS "documentationPhotoUrl",
         il.created_at AS "createdAt",
         pa.full_name AS "officerName",
         pa.rank_title AS "officerRank",
         fb.id AS "feedbackId",
         fb.rating_stars AS "feedbackRating",
         fb.clarity_rating AS "feedbackClarity",
         fb.helpfulness_rating AS "feedbackHelpfulness",
         fb.attitude_rating AS "feedbackAttitude",
         fb.feedback_notes AS "feedbackNotes",
         fb.created_at AS "feedbackSubmittedAt"
       FROM kamsel_inspection_logs il
       JOIN police_accounts pa ON pa.id = il.kamsel_account_id
       LEFT JOIN kamsel_counseling_feedbacks fb ON fb.inspection_log_id = il.id
       WHERE il.school_id = $1
       ORDER BY il.inspection_sequence DESC`,
      [schoolId]
    );

    res.json({
      success: true,
      data: {
        inspections: inspectionsRes.rows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal memuat riwayat sidak sekolah' });
  }
});

// 4. Submit Feedback dari Guru BK untuk Petugas Kamsel (Aplikasi BK Sekolah)
apiRouter.post('/school-bk/feedbacks', authenticateSchoolBkJwt, async (req: Request, res: Response) => {
  try {
    const parsedBody = CreateBkFeedbackDtoSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        success: false,
        message: parsedBody.error.errors[0]?.message ?? 'Format data feedback tidak valid',
      });
      return;
    }

    const { inspectionLogId, ratingStars, clarityRating, helpfulnessRating, attitudeRating, feedbackNotes } = parsedBody.data;
    const schoolId = req.bkUser!.schoolId;
    const bkAccountId = req.bkUser!.accountId;

    // Pastikan log sidak ada dan ditujukan untuk sekolah guru BK yang sedang login
    const logCheck = await dbQuery(
      `SELECT id, school_id, kamsel_account_id, inspection_sequence
       FROM kamsel_inspection_logs
       WHERE id = $1 AND school_id = $2`,
      [inspectionLogId, schoolId]
    );

    if ((logCheck.rowCount ?? 0) === 0) {
      res.status(404).json({
        success: false,
        message: 'Log sidak tidak ditemukan atau bukan milik sekolah Anda',
      });
      return;
    }

    const log = logCheck.rows[0];

    // Cek apakah feedback sudah pernah diberikan sebelumnya
    const existingFeedback = await dbQuery(
      `SELECT id FROM kamsel_counseling_feedbacks WHERE inspection_log_id = $1`,
      [inspectionLogId]
    );

    if ((existingFeedback.rowCount ?? 0) > 0) {
      res.status(400).json({
        success: false,
        message: 'Feedback untuk kunjungan sidak ini sudah pernah dikirimkan sebelumnya',
      });
      return;
    }

    // Simpan feedback
    const insertRes = await dbQuery(
      `INSERT INTO kamsel_counseling_feedbacks (
         inspection_log_id, school_id, bk_account_id, kamsel_account_id,
         rating_stars, clarity_rating, helpfulness_rating, attitude_rating,
         feedback_notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        inspectionLogId,
        schoolId,
        bkAccountId,
        log.kamsel_account_id,
        ratingStars,
        clarityRating ?? ratingStars,
        helpfulnessRating ?? ratingStars,
        attitudeRating ?? ratingStars,
        feedbackNotes,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Terima kasih, ulasan & penilaian Anda untuk Unit Kamsel berhasil disimpan!',
      data: insertRes.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? 'Gagal menyimpan feedback guru BK' });
  }
});
