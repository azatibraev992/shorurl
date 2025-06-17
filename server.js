const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const shortid = require('shortid');
const geoip = require('geoip-lite');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('shorurl.db');

// Initialize database tables
db.serialize(() => {
  // URLs table
  db.run(`CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT NOT NULL,
    short_code TEXT UNIQUE NOT NULL,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_ip TEXT
  )`);

  // Enhanced Clicks table for analytics
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

// Helper function to get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
}

// Helper function to parse User-Agent
function parseUserAgent(userAgent) {
  const ua = userAgent.toLowerCase();
  
  // Browser detection
  let browser = 'Неизвестно';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('opera')) browser = 'Opera';

  // OS detection
  let os = 'Неизвестно';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  // Device type detection
  let deviceType = 'Desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    deviceType = 'Mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'Tablet';
  }

  return { browser, os, deviceType };
}

// Helper function to get country name from code
function getCountryName(countryCode) {
  const countries = {
    'US': 'США',
    'RU': 'Россия',
    'DE': 'Германия',
    'GB': 'Великобритания',
    'FR': 'Франция',
    'JP': 'Япония',
    'CN': 'Китай',
    'CA': 'Канада',
    'AU': 'Австралия',
    'BR': 'Бразилия',
    'IN': 'Индия',
    'IT': 'Италия',
    'ES': 'Испания',
    'NL': 'Нидерланды',
    'SE': 'Швеция',
    'NO': 'Норвегия',
    'DK': 'Дания',
    'FI': 'Финляндия',
    'PL': 'Польша',
    'TR': 'Турция',
    'UA': 'Украина',
    'KZ': 'Казахстан',
    'BY': 'Беларусь'
  };
  
  return countries[countryCode] || countryCode || 'Неизвестно';
}

// Helper function to validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Routes

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create short URL
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

      res.json({
        success: true,
        shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`,
        shortCode: shortCode,
        originalUrl: url,
        tags: tags || []
      });
    }
  );
});

// Redirect short URL
app.get('/:shortCode', (req, res) => {
  const shortCode = req.params.shortCode;
  
  // Skip if it's a static file or API request
  if (shortCode.includes('.') || shortCode.startsWith('api')) {
    return res.status(404).send('Not found');
  }
  
  // Get original URL
  db.get('SELECT original_url FROM urls WHERE short_code = ?', [shortCode], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server error');
    }

    if (!row) {
      return res.status(404).send('Short URL not found');
    }

    // Log the click with enhanced analytics
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || '';
    
    // Get geo location
    let country = 'Локальная сеть';
    let region = 'Развработка';
    let city = 'localhost';
    
    // For localhost/development, use test data, otherwise try geoip
    if (clientIP !== '127.0.0.1' && clientIP !== '::1' && !clientIP.startsWith('192.168.') && !clientIP.startsWith('10.0.')) {
      const geo = geoip.lookup(clientIP);
      if (geo) {
        country = getCountryName(geo.country);
        region = geo.region || 'Неизвестно';
        city = geo.city || 'Неизвестно';
      } else {
        country = 'Неизвестная страна';
        region = 'Неизвестный регион';
        city = 'Неизвестный город';
      }
    }
    
    // Parse user agent
    const deviceInfo = parseUserAgent(userAgent);

    console.log(`Click logged: ${shortCode} from ${country}, ${city} using ${deviceInfo.browser} on ${deviceInfo.os} (${deviceInfo.deviceType})`);

    db.run(
      'INSERT INTO clicks (short_code, ip_address, country, region, city, user_agent, browser, os, device_type, referer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        shortCode, 
        clientIP, 
        country,
        region,
        city,
        userAgent,
        deviceInfo.browser,
        deviceInfo.os,
        deviceInfo.deviceType,
        referer
      ],
      (err) => {
        if (err) console.error('Failed to log click:', err);
      }
    );

    // Redirect to original URL with all parameters preserved
    let redirectUrl = row.original_url;
    
    // Preserve query parameters
    const queryString = Object.keys(req.query).length > 0 ? 
      '?' + new URLSearchParams(req.query).toString() : '';
    
    if (queryString) {
      const separator = redirectUrl.includes('?') ? '&' : '?';
      redirectUrl += separator + queryString.substring(1);
    }

    res.redirect(redirectUrl);
  });
});

// Get analytics for a short code
app.get('/api/analytics/:shortCode', (req, res) => {
  const shortCode = req.params.shortCode;

  // Get URL info
  db.get('SELECT * FROM urls WHERE short_code = ?', [shortCode], (err, urlData) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }

    if (!urlData) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    // Get click statistics
    db.all('SELECT * FROM clicks WHERE short_code = ? ORDER BY clicked_at DESC', [shortCode], (err, clicks) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to get analytics' });
      }

      // Process analytics data
      const totalClicks = clicks.length;
      const countries = {};
      const browsers = {};
      const devices = {};
      const operatingSystems = {};
      const dailyClicks = {};
      const recentClicks = clicks.slice(0, 10);

      clicks.forEach(click => {
        // Count by country
        const country = click.country || 'Неизвестно';
        countries[country] = (countries[country] || 0) + 1;

        // Count by browser
        const browser = click.browser || 'Неизвестно';
        browsers[browser] = (browsers[browser] || 0) + 1;

        // Count by device type
        const device = click.device_type || 'Неизвестно';
        devices[device] = (devices[device] || 0) + 1;

        // Count by OS
        const os = click.os || 'Неизвестно';
        operatingSystems[os] = (operatingSystems[os] || 0) + 1;

        // Count by day
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

// Get all URLs created by user (by IP)
app.get('/api/my-urls', (req, res) => {
  const clientIP = getClientIP(req);
  
  db.all('SELECT * FROM urls WHERE creator_ip = ? ORDER BY created_at DESC', [clientIP], (err, urls) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }

    // Get click counts for each URL
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to access the URL shortener`);
  console.log('📊 Enhanced analytics enabled - tracks countries, devices, browsers, and OS');
  console.log('💾 All data is stored persistently in shorurl.db file');
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
}); 