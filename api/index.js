const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const shortid = require('shortid');
const geoip = require('geoip-lite');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Database setup
let db = new sqlite3.Database(':memory:');

// Initialize database tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT NOT NULL,
    short_code TEXT UNIQUE NOT NULL,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_ip TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT NOT NULL,
    ip_address TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    user_agent TEXT,
    browser TEXT,
    os TEXT,
    device_type TEXT,
    referer TEXT,
    clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (short_code) REFERENCES urls (short_code)
  )`);
});

// Helper functions
function getClientIP(req) {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress || 
         '127.0.0.1';
}

function parseUserAgent(userAgent) {
  const ua = userAgent.toLowerCase();
  
  let browser = 'Неизвестно';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('opera')) browser = 'Opera';

  let os = 'Неизвестно';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  let deviceType = 'Desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    deviceType = 'Mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'Tablet';
  }

  return { browser, os, deviceType };
}

function getCountryName(countryCode) {
  const countries = {
    'US': 'США', 'RU': 'Россия', 'DE': 'Германия', 'GB': 'Великобритания',
    'FR': 'Франция', 'JP': 'Япония', 'CN': 'Китай', 'CA': 'Канада'
  };
  return countries[countryCode] || countryCode || 'Неизвестно';
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.post('/api/shorten', (req, res) => {
  const { url, tags } = req.body;
  
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }

  const shortCode = shortid.generate();
  const clientIP = getClientIP(req);
  const tagsString = tags ? tags.join(',') : '';

  db.run(
    'INSERT INTO urls (original_url, short_code, tags, creator_ip) VALUES (?, ?, ?, ?)',
    [url, shortCode, tagsString, clientIP],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to create short URL' });
      }

      const host = req.headers.host;
      res.json({
        success: true,
        shortUrl: `https://${host}/${shortCode}`,
        shortCode: shortCode,
        originalUrl: url,
        tags: tags || []
      });
    }
  );
});

app.get('/:shortCode', (req, res) => {
  const shortCode = req.params.shortCode;
  
  if (shortCode.includes('.') || shortCode.startsWith('api') || shortCode.startsWith('_')) {
    return res.status(404).send('Not found');
  }
  
  db.get('SELECT original_url FROM urls WHERE short_code = ?', [shortCode], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server error');
    }

    if (!row) {
      return res.status(404).send('Short URL not found');
    }

    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || '';
    
    let country = 'Неизвестная страна';
    let region = 'Неизвестный регион';
    let city = 'Неизвестный город';
    
    const geo = geoip.lookup(clientIP);
    if (geo) {
      country = getCountryName(geo.country);
      region = geo.region || 'Неизвестно';
      city = geo.city || 'Неизвестно';
    }
    
    const deviceInfo = parseUserAgent(userAgent);

    db.run(
      'INSERT INTO clicks (short_code, ip_address, country, region, city, user_agent, browser, os, device_type, referer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [shortCode, clientIP, country, region, city, userAgent, deviceInfo.browser, deviceInfo.os, deviceInfo.deviceType, referer],
      (err) => {
        if (err) console.error('Failed to log click:', err);
      }
    );

    let redirectUrl = row.original_url;
    const queryString = Object.keys(req.query).length > 0 ? 
      '?' + new URLSearchParams(req.query).toString() : '';
    
    if (queryString) {
      const separator = redirectUrl.includes('?') ? '&' : '?';
      redirectUrl += separator + queryString.substring(1);
    }

    res.redirect(redirectUrl);
  });
});

app.get('/api/analytics/:shortCode', (req, res) => {
  const shortCode = req.params.shortCode;

  db.get('SELECT * FROM urls WHERE short_code = ?', [shortCode], (err, urlData) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }

    if (!urlData) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    db.all('SELECT * FROM clicks WHERE short_code = ? ORDER BY clicked_at DESC', [shortCode], (err, clicks) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to get analytics' });
      }

      const totalClicks = clicks.length;
      const countries = {};
      const browsers = {};
      const devices = {};
      const operatingSystems = {};
      const dailyClicks = {};
      const recentClicks = clicks.slice(0, 10);

      clicks.forEach(click => {
        const country = click.country || 'Неизвестно';
        countries[country] = (countries[country] || 0) + 1;

        const browser = click.browser || 'Неизвестно';
        browsers[browser] = (browsers[browser] || 0) + 1;

        const device = click.device_type || 'Неизвестно';
        devices[device] = (devices[device] || 0) + 1;

        const os = click.os || 'Неизвестно';
        operatingSystems[os] = (operatingSystems[os] || 0) + 1;

        const date = click.clicked_at.split(' ')[0];
        dailyClicks[date] = (dailyClicks[date] || 0) + 1;
      });

      res.json({
        url: {
          original_url: urlData.original_url,
          short_code: shortCode,
          tags: urlData.tags ? urlData.tags.split(',') : [],
          created_at: urlData.created_at
        },
        analytics: {
          totalClicks,
          countries,
          browsers,
          devices,
          operatingSystems,
          dailyClicks,
          recentClicks: recentClicks.map(click => ({
            country: click.country,
            city: click.city,
            browser: click.browser,
            os: click.os,
            device_type: click.device_type,
            clicked_at: click.clicked_at,
            referer: click.referer
          }))
        }
      });
    });
  });
});

app.get('/api/my-urls', (req, res) => {
  const clientIP = getClientIP(req);
  
  db.all('SELECT * FROM urls WHERE creator_ip = ? ORDER BY created_at DESC', [clientIP], (err, urls) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }

    const urlsWithStats = [];
    let pending = urls.length;

    if (pending === 0) {
      return res.json([]);
    }

    urls.forEach(url => {
      db.get('SELECT COUNT(*) as clickCount FROM clicks WHERE short_code = ?', [url.short_code], (err, result) => {
        if (err) {
          console.error(err);
          url.clickCount = 0;
        } else {
          url.clickCount = result.clickCount;
        }
        
        url.tags = url.tags ? url.tags.split(',') : [];
        urlsWithStats.push(url);
        
        pending--;
        if (pending === 0) {
          res.json(urlsWithStats);
        }
      });
    });
  });
});

module.exports = app; 