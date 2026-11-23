// Generates the PWA / home-screen icons from public/logo.png.
// Run with:  npm run icons
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const LOGO = 'public/logo.png';
const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

// White square with the wide logo centred. `fill` is how much of the width the logo may use.
async function makeIcon(size, fill, file) {
  const logoWidth = Math.round(size * fill);
  const logo = await sharp(LOGO).resize({ width: logoWidth }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: '#ffffff' },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`);
  console.log('created', `${OUT}/${file}`);
}

await makeIcon(192, 0.82, 'icon-192.png');
await makeIcon(512, 0.82, 'icon-512.png');
// Maskable icons are cropped by the phone, so keep the logo inside the safe zone (about 60%).
await makeIcon(512, 0.6, 'maskable-512.png');
await makeIcon(180, 0.82, 'apple-touch-icon.png');
await makeIcon(64, 0.9, 'favicon-64.png');
