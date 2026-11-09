import { dbQuery } from '../pgPool';
import bcrypt from 'bcrypt';

const MOCK_TEACHERS = [
  { name: 'Dra. Endang Sri Wahyuni, M.Pd.', gender: 'F' },
  { name: 'Drs. H. Mulyadi, M.M.', gender: 'M' },
  { name: 'Sri Rahayu, S.Pd., M.Si.', gender: 'F' },
  { name: 'Agus Setiawan, S.Pd.', gender: 'M' },
  { name: 'Nurul Hidayati, S.Psi.', gender: 'F' },
  { name: 'Budi Santoso, S.Pd.', gender: 'M' },
  { name: 'Dewi Lestari, S.Pd., Kons.', gender: 'F' },
  { name: 'Ahmad Fauzi, S.Ag., M.Pd.I.', gender: 'M' },
  { name: 'Tri Wahyuni, S.Psi.', gender: 'F' },
  { name: 'Eko Prasetyo, S.Pd.', gender: 'M' },
  { name: 'Siti Fatimah, S.Pd.', gender: 'F' },
  { name: 'Hadi Prayitno, S.Pd.', gender: 'M' },
  { name: 'Ratna Juwita, S.Psi.', gender: 'F' },
  { name: 'Supriyanto, S.Pd., M.M.', gender: 'M' },
  { name: 'Yuni Astuti, S.Pd.', gender: 'F' },
  { name: 'Wahyu Hidayat, S.Pd.', gender: 'M' },
  { name: 'Anis Sulistowati, S.Pd.', gender: 'F' },
  { name: 'Aris Munandar, S.Pd.', gender: 'M' },
  { name: 'Fitri Handayani, S.Psi.', gender: 'F' },
  { name: 'Didik Kurniawan, S.Pd.', gender: 'M' },
  { name: 'Wulan Dari, S.Pd.', gender: 'F' },
  { name: 'Totok Sugiyanto, S.Pd.', gender: 'M' },
  { name: 'Lilik Suryani, S.Pd.', gender: 'F' },
  { name: 'Sugeng Riyadi, S.Pd.', gender: 'M' },
  { name: 'Maya Indah Permata, S.Psi.', gender: 'F' },
  { name: 'Nanang Hermanto, S.Pd.', gender: 'M' },
  { name: 'Rina Indriani, S.Pd.', gender: 'F' },
  { name: 'Yusuf Habibi, S.Pd.I.', gender: 'M' },
  { name: 'Erna Susanti, S.Pd.', gender: 'F' },
  { name: 'Bambang Irawan, S.Pd.', gender: 'M' },
  { name: 'Ika Nuraini, S.Psi.', gender: 'F' },
  { name: 'Slamet Raharjo, S.Pd.', gender: 'M' },
  { name: 'Titik Kusuma Wardani, S.Pd.', gender: 'F' },
  { name: 'Dani Prasetyo, S.Kom.', gender: 'M' },
  { name: 'Kusuma Ningrum, S.Pd.', gender: 'F' },
  { name: 'Joko Susilo, S.Pd.', gender: 'M' },
  { name: 'Eni Purwanti, S.Pd.', gender: 'F' },
  { name: 'Rudi Hartono, S.Pd.', gender: 'M' },
  { name: 'Hartatik, S.Pd., M.Pd.', gender: 'F' },
  { name: 'Sunardi, S.Pd.', gender: 'M' },
  { name: 'Indah Purnamasari, S.Psi.', gender: 'F' },
];

async function seedAllBkAccounts() {
  console.log('Seeding official BK accounts for all schools in Mojokerto...');
  const passwordHash = await bcrypt.hash('bk123', 10);

  // 1. Ambil seluruh sekolah
  const schoolsRes = await dbQuery(`SELECT id, name, npsn FROM schools ORDER BY name ASC`);
  const schools = schoolsRes.rows;
  console.log(`Found ${schools.length} schools in database.`);

  let index = 0;
  for (const s of schools) {
    // Cek apakah sudah punya akun BK
    const checkBk = await dbQuery(`SELECT id, nip_or_nuptk, full_name FROM school_bk_accounts WHERE school_id = $1`, [s.id]);
    
    if (checkBk.rowCount === 0) {
      const teacher = MOCK_TEACHERS[index % MOCK_TEACHERS.length];
      const year = 1978 + (index % 15);
      const month = String(1 + (index % 12)).padStart(2, '0');
      const day = String(10 + (index % 18)).padStart(2, '0');
      const hireYear = 2005 + (index % 15);
      const hireMonth = String(1 + ((index + 3) % 12)).padStart(2, '0');
      const genderCode = teacher.gender === 'M' ? '1' : '2';
      const seq = String(100 + index).slice(-3);
      
      const nip = `${year}${month}${day}${hireYear}${hireMonth}${genderCode}${seq}`;
      const username = `bk_${s.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}_${seq}`;
      const phoneWa = `628123456${String(7000 + index).slice(-4)}`;

      await dbQuery(
        `INSERT INTO school_bk_accounts (
           school_id, nip_or_nuptk, username, password_hash, full_name, phone_wa, is_primary_pic, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)`,
        [s.id, nip, username, passwordHash, teacher.name, phoneWa]
      );
      console.log(`Created BK account for ${s.name}: ${teacher.name} (NIP: ${nip})`);
    } else {
      console.log(`School ${s.name} already has BK account: ${checkBk.rows[0].full_name} (${checkBk.rows[0].nip_or_nuptk})`);
    }
    index++;
  }

  console.log('All schools now have official BK accounts.');
  process.exit(0);
}

seedAllBkAccounts().catch(e => {
  console.error(e);
  process.exit(1);
});

