// =====================================================================
// IMPORT AKUN: Excel  ->  Supabase
//   DATA_PMR_GEN_10.xlsx  -> akun anggota (username + password awal)
//   admin_piket.xlsx      -> akun admin
// Dijalankan SEKALI dari komputer Anda (bukan dari website). Aman diulang:
//   - akun yang sudah ada TIDAK diubah passwordnya (agar password baru anggota aman)
//   - tambahkan  --reset-password  jika ingin mengembalikan ke password Excel
// =====================================================================
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'node:fs';

const EMAIL_DOMAIN = 'pmr.smkn2pati.id'; // HARUS sama dengan EMAIL_DOMAIN di web/script.js
// Nama file dipakai apa adanya; versi dengan spasi atau underscore sama-sama diterima.
const cariFile = (...nama) => nama.find((n) => fs.existsSync(n)) ?? nama[0];
const FILE_ANGGOTA = cariFile('DATA PMR GEN 10.xlsx', 'DATA_PMR_GEN_10.xlsx');
const FILE_ADMIN = cariFile('admin piket.xlsx', 'admin_piket.xlsx');
const resetPassword = process.argv.includes('--reset-password');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di file .env (lihat .env.example)');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Baca sheet pertama; rapikan nama kolom (di Excel ada spasi di depan) dan isi sel.
function bacaExcel(file) {
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])
    )
  );
}
// Untuk membandingkan nama: huruf kecil, buang spasi/tanda baca
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const toEmail = (u) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

async function cariUser(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
}

// Buat akun login; jika sudah ada, pakai yang lama.
async function pastikanUser(email, password) {
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error) return { id: data.user.id, baru: true };
  const u = await cariUser(email);
  if (!u) throw error;
  if (resetPassword) await sb.auth.admin.updateUserById(u.id, { password });
  return { id: u.id, baru: false };
}

async function simpanProfil(p) {
  const { error } = await sb.from('profiles').upsert(p, { onConflict: 'id' });
  if (error) throw error;
}

// ---------- ANGGOTA ----------
const peta = JSON.parse(fs.readFileSync('nama-panggilan.json', 'utf8'));
const namaKePanggilan = new Map();
for (const [panggilan, lengkap] of Object.entries(peta)) {
  if (panggilan.startsWith('_') || !lengkap) continue;
  namaKePanggilan.set(norm(lengkap), panggilan);
}

const anggota = bacaExcel(FILE_ANGGOTA).filter((r) => r['username']);
const terpakai = new Set();
let baru = 0, lama = 0;

for (const r of anggota) {
  const nama = r['nama anggota'];
  const panggilan = namaKePanggilan.get(norm(nama)) ?? null;
  if (panggilan) terpakai.add(panggilan);
  const u = await pastikanUser(toEmail(r['username']), r['password awal']);
  await simpanProfil({
    id: u.id, username: r['username'].toLowerCase(), full_name: nama,
    nickname: panggilan, role: 'member',
  });
  u.baru ? baru++ : lama++;
}
console.log(`Anggota: ${baru} akun baru, ${lama} sudah ada (dari ${anggota.length} baris Excel).`);

// ---------- ADMIN ----------
const admin = bacaExcel(FILE_ADMIN).filter((r) => r['username admin']);
for (const r of admin) {
  const u = await pastikanUser(toEmail(r['username admin']), r['password admin']);
  await simpanProfil({
    id: u.id, username: r['username admin'].toLowerCase(), full_name: 'Admin',
    nickname: null, role: 'admin',
  });
}
console.log(`Admin: ${admin.length} akun diproses.`);

// ---------- LAPORAN KETIDAKCOCOKAN ----------
const belum = Object.entries(peta).filter(([k, v]) => !k.startsWith('_') && !terpakai.has(k)).map(([k]) => k);
if (belum.length) {
  console.log('\nPERLU DIKONFIRMASI - nama jadwal ini belum terhubung ke anggota:');
  belum.forEach((k) => console.log('  - ' + k + (peta[k] ? '  (nama di JSON tidak ditemukan di Excel: ' + peta[k] + ')' : '')));
  console.log('Isi nama lengkapnya di nama-panggilan.json lalu jalankan: npm run import');
}
console.log('\nSelesai.');
