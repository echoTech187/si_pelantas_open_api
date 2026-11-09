import { z } from 'zod';

export const CreateCounselingVisitDtoSchema = z.object({
  schoolId: z.string().uuid('ID Sekolah wajib berupa UUID valid'),
  coordinationChannel: z.enum(['WHATSAPP', 'TELEPON']).default('WHATSAPP'),
  visitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal kunjungan YYYY-MM-DD')
    .optional(),
  counselingTopic: z.string().min(3).max(200).optional(),
  counselingTopics: z.string().min(3).max(200).optional(),
  studentAttendeeCount: z.number().int().nonnegative().optional(),
  counselingNotes: z.string().max(2000).optional(),
  kamselDirectiveSummary: z.string().max(2000).optional(),
  schoolEvaluationResult: z.string().max(2000).optional(),
  schoolFollowUpCommitment: z.string().max(1500).optional(),
  documentationPhotoUrl: z.string().url().optional().nullable(),
}).transform((data) => {
  const now = new Date().toISOString().split('T')[0];
  const topic = data.counselingTopic ?? data.counselingTopics ?? 'Penyuluhan Kamsel & Sosialisasi Tata Tertib Lalu Lintas';
  const directive = data.kamselDirectiveSummary ?? data.counselingNotes ?? 'Pengarahan kedisiplinan berkendara dan kepatuhan helm SNI bagi seluruh siswa.';
  const evalResult = data.schoolEvaluationResult ?? 'Pihak sekolah berkomitmen meningkatkan razia internal kelengkapan berkendara siswa.';
  const commitment = data.schoolFollowUpCommitment ?? 'Sekolah menjamin siswa yang melanggar dibina secara edukatif oleh Guru BK.';

  return {
    ...data,
    visitDate: data.visitDate ?? now,
    counselingTopic: topic,
    kamselDirectiveSummary: directive,
    schoolEvaluationResult: evalResult,
    schoolFollowUpCommitment: commitment,
  };
});

export type CreateCounselingVisitDto = z.infer<typeof CreateCounselingVisitDtoSchema>;
