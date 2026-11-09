import { z } from 'zod';

/**
 * Sesuai Konfirmasi Klien:
 * "Kalo polisi nilang cukup: 1) Nama Sekolah, 2) Jenis Pelanggaran, 3) Nama + Kelas, 4) Plat Nomor"
 */
export const CreateViolationRequestDtoSchema = z.object({
  schoolId: z.string().uuid('ID Sekolah harus berupa UUID valid'),
  studentName: z.string().min(2, 'Nama siswa wajib diisi').max(120),
  studentClassGrade: z.enum(['X', 'XI', 'XII']).default('XI'),
  studentClassName: z.string().min(1, 'Kelas siswa wajib diisi').max(40).optional(),
  studentClass: z.string().min(1).max(40).optional(),
  vehiclePlateNumber: z
    .string()
    .min(3, 'Plat nomor kendaraan wajib diisi (contoh: S 4521 NB)')
    .max(20)
    .transform((val) => val.toUpperCase().trim()),
  violationCodes: z
    .array(
      z.enum([
        'TIDAK_PAKAI_HELM_SNI',
        'BELUM_CUKUP_UMUR_TANPA_SIM',
        'KNALPOT_BRONG_TIDAK_STANDAR',
        'BERBONCENGAN_LEBIH_DARI_SATU',
        'MELANGGAR_RAMBU_APIL',
        'TIDAK_MEMBAWA_STNK_KELENGKAPAN',
      ])
    )
    .min(1, 'Pilih minimal 1 jenis pelanggaran lalu lintas')
    .optional(),
  violationTypes: z
    .array(
      z.enum([
        'TIDAK_PAKAI_HELM_SNI',
        'BELUM_CUKUP_UMUR_TANPA_SIM',
        'KNALPOT_BRONG_TIDAK_STANDAR',
        'BERBONCENGAN_LEBIH_DARI_SATU',
        'MELANGGAR_RAMBU_APIL',
        'TIDAK_MEMBAWA_STNK_KELENGKAPAN',
      ])
    )
    .min(1, 'Pilih minimal 1 jenis pelanggaran lalu lintas')
    .optional(),
  locationDescription: z.string().max(200).optional(),
  // Field opsional (otomatis terisi default jika tidak diisi saat penindakan cepat)
  studentNisn: z.string().regex(/^[0-9]{10}$/).optional().nullable(),
  vehicleBrandType: z.string().max(80).default('Sepeda Motor Roda 2'),
  incidentDistrictId: z.string().uuid().optional().nullable(),
  incidentLocation: z.string().max(200).default('Wilayah Hukum Polres Mojokerto'),
  evidencePhotoUrl: z.string().url().optional().nullable(),
  officerNotes: z.string().max(500).optional().nullable(),
}).transform((data) => {
  const codes = data.violationCodes ?? data.violationTypes ?? ['TIDAK_PAKAI_HELM_SNI'];
  const className = data.studentClassName ?? data.studentClass ?? 'XI MIPA';
  const loc = data.incidentLocation ?? data.locationDescription ?? 'Wilayah Hukum Polres Mojokerto';
  
  // Deteksi otomatis grade X, XI, XII dari nama kelas bila ada
  let grade: 'X' | 'XI' | 'XII' = 'XI';
  const upperClass = className.toUpperCase();
  if (upperClass.startsWith('XII') || upperClass.includes('12')) {
    grade = 'XII';
  } else if (upperClass.startsWith('XI') || upperClass.includes('11')) {
    grade = 'XI';
  } else if (upperClass.startsWith('X') || upperClass.includes('10')) {
    grade = 'X';
  }

  return {
    ...data,
    violationCodes: codes,
    studentClassName: className,
    studentClassGrade: data.studentClassGrade ?? grade,
    incidentLocation: loc,
  };
});

export type CreateViolationRequestDto = z.infer<typeof CreateViolationRequestDtoSchema>;
