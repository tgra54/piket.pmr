// Opsional - hanya untuk Cloudflare Pages yang terhubung ke GitHub (bukan Direct Upload).
// Cloudflare Pages: Settings > Build:  Build command = node build-config.js   Output directory = web
// Settings > Variables: isi SUPABASE_URL dan SUPABASE_ANON_KEY (kunci anon, BUKAN service_role).
// Script ini menulis web/config.js dari variabel tersebut saat deploy.
const fs = require('fs');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Variabel SUPABASE_URL dan/atau SUPABASE_ANON_KEY belum diisi di Cloudflare.');
  process.exit(1);
}
fs.writeFileSync('web/config.js',
  'window.APP_CONFIG = ' + JSON.stringify({ SUPABASE_URL, SUPABASE_ANON_KEY }, null, 2) + ';\n');
console.log('web/config.js dibuat dari variabel lingkungan.');
