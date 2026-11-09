export type TrafficViolationCategory =
  | 'TIDAK_PAKAI_HELM_SNI'
  | 'BELUM_CUKUP_UMUR_TANPA_SIM'
  | 'KNALPOT_BRONG_TIDAK_STANDAR'
  | 'BERBONCENGAN_LEBIH_DARI_SATU'
  | 'MELANGGAR_RAMBU_APIL'
  | 'TIDAK_MEMBAWA_STNK_KELENGKAPAN'
  | 'BALAP_LIAR_UUD_LANTAS';

export interface ViolationEntity {
  id: string;
  ticketNumber: string;
  schoolId: string;
  schoolName?: string;
  reportedByUserId: string;
  officerName?: string;
  studentName: string;
  studentNisn?: string | null;
  studentClass: string;
  vehiclePlateNumber: string;
  vehicleType: string;
  violationCategory: TrafficViolationCategory;
  violationArticle: string;
  incidentLocation: string;
  evidencePhotoUrl?: string | null;
  officerNotes?: string | null;
  isCountedInActiveCycle: boolean;
  incidentAt: Date;
}
