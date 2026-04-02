import express from 'express'
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import "dotenv/config";
import Cloudflare from 'cloudflare';
const cf = new Cloudflare({
  token: process.env.CLOUDFLARE_API_TOKEN
});

const PORT = process.env.PORT;
const HOST = process.env.HOST;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const activeIPs = {};
const limit = 20;
const interval = 60 * 1000;
const blockDuration = 30 * 60 * 1000;
let cachedZoneId = null;
const domain = 'tipix.onrender.com';

let app = express();
app.use((req, res, next) =>{
    const ip = req.ip;
    const now = Date.now();

    if (!activeIPs[ip]) activeIPs[ip] = { count: 0, lastTime: now, blockTimeout: null, unblockTimeout: null };
    const ipData = activeIPs[ip];

    // If IP is already blocked, return 503
    if (ipData.blockTimeout) return res.status(503).send('Too many requests. Try again later.');

    // Update activity
    ipData.count++;
    ipData.lastTime = now;

    // Check limit
    if (ipData.count > limit && !ipData.blockTimeout) {
      ipData.blockTimeout = setTimeout(async () => {
        if (Date.now() - ipData.lastTime < interval) {
          try {
            // Detect Cloudflare zone if not cached
            if (!cachedZoneId) {
              const zones = await cf.zones.browse({ name: domain });
              if (!zones.result.length) {
                console.error('Cloudflare zone not found for domain:', domain);
                return;
              }
              cachedZoneId = zones.result[0].id;
            }

            await cf.firewall.accessRules.create(cachedZoneId, {
              mode: 'block',
              configuration: { target: 'ip', value: ip },
              notes: 'Auto-block via Express middleware'
            });

            console.log(`IP ${ip} has been blocked via Cloudflare for ${blockDuration / 60000} minutes`);
          } catch (err) {
            console.error('Cloudflare API error:', err);
          }

          // Unblock IP after blockDuration
          ipData.unblockTimeout = setTimeout(() => {
            console.log(`IP ${ip} unblocked`);
            delete activeIPs[ip];
          }, blockDuration);

        } else {
          delete activeIPs[ip];
        }
      }, interval);
    }

    next();
});
app.set('view engine', 'ejs');
app.use(express.static(join(__dirname, "public")));

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/projects', (req, res) => {
    res.render("projects");
});

app.listen(PORT, HOST, () => {
    console.info(`http://${HOST}:${PORT}`);
});
