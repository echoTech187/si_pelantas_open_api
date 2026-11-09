export class WhatsappMessageTemplates {
  private static formatDateIndo(date: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(date);
  }

  /**
   * 1. Template Wablas Otomatis ke GURU_BK saat POLANTAS menginput Tilang Siswa
   */
  static buildViolationAlertForGuruBk(params: {
    ticketNumber: string;
    incidentAt: Date;
    polantasName: string;
    polantasRankNrp: string;
    schoolName: string;
    districtName: string;
    bkTeacherName: string;
    studentName: string;
    studentNisn: string | null;
    studentClassName: string;
    vehiclePlateNumber: string;
    vehicleBrandType: string;
    violationListText: string;
    incidentLocation: string;
    officerNotes: string | null;
    activeViolationCount: number;
    warningThreshold: number;
    visitThreshold: number;
  }): string {
    const count = params.activeViolationCount;
    const isMandatoryVisit = count >= params.visitThreshold;
    const isWarning = count >= params.warningThreshold && !isMandatoryVisit;

    const statusBlock = isMandatoryVisit
      ? [
          `🚨 *STATUS KAMSEL: WAJIB KUNJUNGAN PENYULUHAN & EVALUASI (${count}/${params.visitThreshold} PELANGGAR)*`,
          `Akumulasi pelanggaran siswa *${params.schoolName}* pada siklus berjalan telah mencapai *${count} pelanggar*.`,
          `Data ini telah diteruskan secara otomatis kepada *Unit Kamsel Satlantas Polres Mojokerto*. Petugas *Unit Kamsel* akan segera menghubungi Bapak/Ibu Guru BK melalui *Telepon / WhatsApp* untuk mengoordinasikan jadwal kunjungan penyuluhan & evaluasi di sekolah.`,
        ].join('\n')
      : isWarning
        ? [
            `⚠️ *STATUS KAMSEL: SIAGA PEMBINAAN (${count}/${params.visitThreshold} PELANGGAR)*`,
            `Akumulasi pelanggar aktif di *${params.schoolName}* telah mencapai *${count} siswa* (mendekati ambang kunjungan wajib Unit Kamsel sebanyak ${params.visitThreshold} pelanggar). Mohon segera dilakukan pembinaan internal oleh Guru BK.`,
          ].join('\n')
        : [
            `🟢 *STATUS KAMSEL: PEMANTAUAN AKTIF (${count}/${params.visitThreshold} PELANGGAR)*`,
            `Mohon kerja sama pihak *Guru BK ${params.schoolName}* untuk melakukan pembinaan disiplin berlalu lintas kepada siswa yang bersangkutan.`,
          ].join('\n');

    return [
      `*KEPOLISIAN NEGARA REPUBLIK INDONESIA*`,
      `*DAERAH JAWA TIMUR — RESOR MOJOKERTO*`,
      `*SATUAN LALU LINTAS*`,
      `====================================`,
      `*LAPORAN PENINDAKAN PELANGGARAN LALU LINTAS SISWA*`,
      `No. Registrasi : *${params.ticketNumber}*`,
      `Waktu Kejadian : ${this.formatDateIndo(params.incidentAt)} WIB`,
      `Petugas Penindak : ${params.polantasRankNrp} ${params.polantasName}`,
      ``,
      `Yth. Guru Bimbingan Konseling (BK)`,
      `*${params.schoolName}* (${params.districtName})`,
      `Bapak/Ibu *${params.bkTeacherName}*`,
      `di Tempat`,
      ``,
      `Dengan hormat, diberitahukan bahwa petugas Polantas di lapangan telah menindak pelanggaran lalu lintas terhadap siswa dari sekolah Bapak/Ibu:`,
      ``,
      `*I. IDENTITAS SISWA & KENDARAAN*`,
      `• Nama Siswa : *${params.studentName}*`,
      `• Kelas / NISN : *${params.studentClassName}* / ${params.studentNisn ?? '-'}`,
      `• Kendaraan : ${params.vehicleBrandType} (*${params.vehiclePlateNumber}*)`,
      ``,
      `*II. RINCIAN PASAL PELANGGARAN (UU LLAJ NO. 22/2009)*`,
      params.violationListText,
      `• Lokasi Penindakan : ${params.incidentLocation}`,
      `• Catatan Polantas : ${params.officerNotes || 'Diberikan penindakan & edukasi di lokasi.'}`,
      ``,
      `*III. STATUS AKUMULASI SIKLUS KAMSEL SEKOLAH*`,
      statusBlock,
      `====================================`,
      `_Sistem Informasi Pelanggaran Lalu Lintas Siswa (SI-PELANTAS) Polres Mojokerto_`,
    ].join('\n');
  }

  /**
   * 2. Template Wablas Otomatis Khusus ke Petugas UNIT_KAMSEL saat Sekolah Mencapai Ambang Batas (5 / 7 Pelanggar)
   */
  static buildThresholdAlertForUnitKamsel(params: {
    schoolName: string;
    districtName: string;
    address: string;
    bkTeacherName: string;
    bkPhoneWa: string;
    activeViolationCount: number;
    visitThreshold: number;
    latestStudentName: string;
    latestStudentClass: string;
  }): string {
    const isMandatory = params.activeViolationCount >= params.visitThreshold;
    return [
      `*KOMANDO SATLANTAS POLRES MOJOKERTO*`,
      `*NOTIFIKASI PRIORITAS UNIT KAMSEL*`,
      `====================================`,
      isMandatory
        ? `🚨 *INSTRUKSI KUNJUNGAN PENYULUHAN KAMSEL (${params.activeViolationCount} PELANGGAR)*`
        : `⚠️ *PERINGATAN SIAGA KAMSEL (${params.activeViolationCount} PELANGGAR)*`,
      ``,
      `Yth. Personel *Unit Kamsel Satlantas Polres Mojokerto*,`,
      `Berdasarkan data penindakan *Polantas* di lapangan, sekolah berikut telah mencapai ambang batas evaluasi:`,
      ``,
      `• Nama Sekolah : *${params.schoolName}* (${params.districtName})`,
      `• Alamat : ${params.address}`,
      `• Total Pelanggar Aktif : *${params.activeViolationCount} Siswa*`,
      `• Pelanggar Terakhir : ${params.latestStudentName} (${params.latestStudentClass})`,
      `• PIC Guru BK : *${params.bkTeacherName}*`,
      `• Kontak WA/Telp BK : *+${params.bkPhoneWa}*`,
      ``,
      `*TINDAK LANJUT UNIT KAMSEL:*`,
      `Silakan buka dasbor *Unit Kamsel* pada aplikasi mobile untuk menghubungi Guru BK melalui *Telepon / WhatsApp* guna menetapkan jadwal kunjungan penyuluhan serta evaluasi keselamatan berlalu lintas di *${params.schoolName}*.`,
      `====================================`,
    ].join('\n');
  }
}
