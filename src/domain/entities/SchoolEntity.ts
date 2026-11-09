export type KamselCycleStatus =
  | 'AMAN'
  | 'SIAGA_5_PELANGGAR'
  | 'WAJIB_PENYULUHAN_7_PELANGGAR'
  | 'SELESAI_DIEVALUASI';

export interface SchoolRadarEntity {
  schoolId: string;
  npsn: string;
  schoolName: string;
  educationLevel: 'SMA' | 'SMK' | 'MA';
  districtName: string;
  regionType: string;
  address: string;
  bkUserId: string | null;
  bkTeacherName: string;
  bkPhoneWa: string;
  activeCycleId: string;
  cycleNumber: number;
  activeViolationCount: number;
  totalHistoricalViolations: number;
  kamselStatus: KamselCycleStatus;
  lastCounselingVisitDate: string | null;
}
