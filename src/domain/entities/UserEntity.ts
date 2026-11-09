export type PoliceRoleType = 'POLANTAS' | 'UNIT_KAMSEL';
export type InstitutionType = 'POLRI' | 'SCHOOL_BK';

export interface PoliceAccountEntity {
  id: string;
  nrp: string;
  username: string;
  fullName: string;
  rankTitle: string;
  role: PoliceRoleType;
  division: 'TURJAWALI_LANTAS' | 'GAKKUM_LANTAS' | 'UNIT_KAMSEL';
  sectorArea: string;
  phoneWa: string;
  fcmToken: string | null;
}

export interface SchoolBkAccountEntity {
  id: string;
  schoolId: string;
  schoolName?: string;
  nipOrNuptk: string;
  username: string;
  fullName: string;
  phoneWa: string;
  fcmToken: string | null;
  isPrimaryPic: boolean;
}
