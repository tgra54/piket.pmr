// =====================================================================
// CEK LOGIN: mencoba login SUNGGUHAN ke Supabase memakai username + password
// dari Excel (seperti yang dilakukan website). Password tidak pernah dicetak.
// Jalankan setelah "npm run import":   npm run cek
// Catatan: anggota yang sudah mengganti password akan gagal di sini (wajar).
// =====================================================================
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'node:fs';
const cariFile = (...nama) => nama.find((n) => fs.existsSync(n)) ?? nama[0];

const EMAIL_DOMAIN = 'pmr.smkn2pati.id'; // harus sama dengan script.js & import.js
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Isi SUPABASE_URL dan SUPABASE_ANON_KEY di file .env (kunci anon, bukan service_role)');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function bacaExcel(file) {
  const wb = XLSX.readFile(file);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])));
}

async function coba(username, password, peranDiharapkan) {
  const { error } = await sb.auth.signInWithPassword({ email: `${username.toLowerCase()}@${EMAIL_DOMAIN}`, password });
  if (error) return 'GAGAL login (' + (error.code || error.status || error.message) + ')';
  const { data: { session } } = await sb.auth.getSession();
  const { data: prof } = await sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
  await sb.auth.signOut();
  if (!prof) return 'login jalan, tapi baris profiles tidak ada';
  if (prof.role !== peranDiharapkan) return 'peran salah: ' + prof.role;
  return null; // sukses
}

let ok = 0, gagal = 0;
const anggota = bacaExcel(cariFile('DATA PMR GEN 10.xlsx', 'DATA_PMR_GEN_10.xlsx')).filter((r) => r['username']);
for (const r of anggota) {
  const masalah = await coba(r['username'], r['password awal'], 'member');
  if (masalah) { gagal++; console.log(`  ✗ ${r['username']} (${r['nama anggota']}): ${masalah}`); } else ok++;
}
console.log(`Anggota: ${ok} berhasil login, ${gagal} gagal, dari ${anggota.length} akun di Excel.`);

for (const r of bacaExcel(cariFile('admin piket.xlsx', 'admin_piket.xlsx')).filter((r) => r['username admin'])) {
  const masalah = await coba(r['username admin'], r['password admin'], 'admin');
  console.log(`Admin ${r['username admin']}: ${masalah ? '✗ ' + masalah : '✓ berhasil login'}`);
}
