# Absen Piket PMR – SMK N 2 Pati

Website absensi piket dengan foto bukti kamera. HTML + CSS + JavaScript biasa (tanpa build), database Supabase.

```
web/                 <- HANYA folder ini yang di-deploy
  index.html  style.css  script.js
supabase/schema.sql  <- dijalankan sekali di Supabase
import/              <- jangan di-deploy (berisi Excel dengan password)
  DATA_PMR_GEN_10.xlsx  admin_piket.xlsx  nama-panggilan.json
  import.js  package.json  .env.example
```

## Alur: Excel → Import → Database → Website

### 1. Buat proyek Supabase
- Daftar di supabase.com → **New project**.
- **Authentication → Sign In / Providers → Email**: matikan **Allow new users to sign up** (agar tidak ada yang bisa mendaftar sendiri).

### 2. Buat tabel, aturan keamanan, dan jadwal
- **SQL Editor → New query**, tempel isi `supabase/schema.sql`, klik **Run**.
- Ini membuat tabel, jadwal resmi, aturan akses, dan bucket foto **private** bernama `bukti`.

### 3. Import akun dari Excel (sekali)
Butuh Node.js 20.6 atau lebih baru.
```
cd import
npm install
cp .env.example .env      # lalu isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY
npm run import
```
- URL dan kunci ada di **Project Settings → API**. Kunci `service_role` rahasia: hanya untuk file `.env` di komputer Anda.
- Aman dijalankan ulang. Akun yang sudah ada tidak diubah passwordnya (supaya password baru anggota tidak tertimpa). Pakai `npm run import -- --reset-password` jika ingin mengembalikan ke password Excel.
- Di akhir, script menampilkan **nama jadwal yang belum cocok** dengan Excel.

### 4. Isi pengaturan website
Buka `web/config.js`, isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (kunci **anon/publishable**, bukan service_role). Jika salah isi, halaman login menampilkan penyebabnya dan tombol login terkunci.

Untuk Cloudflare Pages yang terhubung ke GitHub, nilai ini bisa diisi lewat Variables dengan build command `node build-config.js` dan output directory `web` (lihat komentar di `build-config.js`).

### 5. Deploy (Cloudflare Pages)
- Cloudflare → Workers & Pages → Create → Pages → **Direct Upload**, unggah folder **`web`** saja.
- Kamera hanya jalan di **https** (Cloudflare Pages sudah https). Untuk uji lokal pakai `http://localhost`.

Alamat anggota: `https://situsanda.pages.dev/` — alamat admin: `https://situsanda.pages.dev/#/admin`

## Mengonfirmasi nama jadwal
Jadwal memakai nama panggilan. Pencocokan ke nama lengkap Excel ada di `import/nama-panggilan.json`. Yang bernilai `null` belum dikonfirmasi: anggotanya tetap punya akun, tapi belum terhubung ke jadwal (muncul "Anda tidak memiliki jadwal piket hari ini"). Isi nama lengkap persis seperti di Excel, lalu `npm run import` lagi.

## Keamanan singkat
- Password disimpan sebagai hash oleh Supabase Auth; tidak ada yang bisa melihatnya, termasuk admin.
- Absensi tidak bisa ditulis langsung dari browser. Semua lewat fungsi `submit_attendance()` yang memeriksa jadwal, absen ganda, dan foto, memakai jam server (WIB).
- Foto di bucket private; hanya pemilik dan admin yang bisa membuka.
- Jangan upload folder `import/` ke GitHub publik atau hosting (isinya password awal).
