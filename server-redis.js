const express = require('express');
const { createClient } = require('redis');
const cors = require('cors');
const shortid = require('shortid');
const geoip = require('geoip-lite');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3001; // Changed to 3001 to avoid conflict

// Redis client setup
let redis;

async function initializeRedis() {
  try {
    redis = createClient({
      url: config.REDIS_URL
    });
    
    redis.on('error', (err) => console.log('Redis Client Error', err));
    redis.on('connect', () => console.log('✅ Connected to Redis'));
    redis.on('ready', () => console.log('🚀 Redis client ready'));
    
    await redis.connect();
    console.log('Redis connection established');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    process.exit(1);
  }
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

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
app.post('/api/shorten', async (req, res) => {
  try {
    const { url, tags } = req.body;
    
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Please provide a valid URL' });
    }

    const shortCode = shortid.generate();
    const clientIP = getClientIP(req);
    const tagsString = tags ? tags.join(',') : '';

    // Store URL data in Redis
    const urlData = {
      original_url: url,
      short_code: shortCode,
      tags: tagsString,
      creator_ip: clientIP,
      created_at: new Date().toISOString()
    };

    await redis.hSet(`url:${shortCode}`, urlData);
    await redis.sAdd(`user_urls:${clientIP}`, shortCode);

    res.json({
      success: true,
      shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`,
      shortCode: shortCode,
      originalUrl: url,
      tags: tags || []
    });
  } catch (error) {
    console.error('Error creating short URL:', error);
    res.status(500).json({ error: 'Failed to create short URL' });
  }
});

// Redirect short URL
app.get('/:shortCode', async (req, res) => {
  try {
    const shortCode = req.params.shortCode;
    
    // Skip if it's a static file or API request
    if (shortCode.includes('.') || shortCode.startsWith('api')) {
      return res.status(404).send('Not found');
    }
    
    // Get original URL from Redis
    const urlData = await redis.hGetAll(`url:${shortCode}`);
    
    if (!urlData.original_url) {
      return res.status(404).send('Short URL not found');
    }

    // Log the click with enhanced analytics
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || '';
    
    // Get geo location
    let country = 'Локальная сеть';
    let region = 'Разработка';
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

    // Store click data in Redis
    const clickData = {
      short_code: shortCode,
      ip_address: clientIP,
      country: country,
      region: region,
      city: city,
      user_agent: userAgent,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      device_type: deviceInfo.deviceType,
      referer: referer,
      clicked_at: new Date().toISOString()
    };

    // Store click data with unique ID
    const clickId = `${shortCode}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    await redis.hSet(`click:${clickId}`, clickData);
    await redis.lPush(`clicks:${shortCode}`, clickId);

    // Redirect to original URL with all parameters preserved
    let redirectUrl = urlData.original_url;
    
    // Preserve query parameters
    const queryString = Object.keys(req.query).length > 0 ? 
      '?' + new URLSearchParams(req.query).toString() : '';
    
    if (queryString) {
      const separator = redirectUrl.includes('?') ? '&' : '?';
      redirectUrl += separator + queryString.substring(1);
    }

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error processing redirect:', error);
    res.status(500).send('Server error');
  }
});

// Get analytics for a short code
app.get('/api/analytics/:shortCode', async (req, res) => {
  try {
    const shortCode = req.params.shortCode;

    // Get URL info from Redis
    const urlData = await redis.hGetAll(`url:${shortCode}`);
    
    if (!urlData.original_url) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    // Get click IDs for this short code
    const clickIds = await redis.lRange(`clicks:${shortCode}`, 0, -1);
    
    // Get click data
    const clicks = [];
    for (const clickId of clickIds) {
      const clickData = await redis.hGetAll(`click:${clickId}`);
      if (clickData.clicked_at) {
        clicks.push(clickData);
      }
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
      const date = click.clicked_at.split('T')[0];
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
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Get all URLs created by user (by IP)
app.get('/api/my-urls', async (req, res) => {
  try {
    const clientIP = getClientIP(req);
    
    // Get all short codes for this user
    const shortCodes = await redis.sMembers(`user_urls:${clientIP}`);
    
    const urlsWithStats = [];
    
    for (const shortCode of shortCodes) {
      const urlData = await redis.hGetAll(`url:${shortCode}`);
      if (urlData.original_url) {
        // Get click count
        const clickCount = await redis.lLen(`clicks:${shortCode}`);
        
        urlsWithStats.push({
          id: shortCode,
          original_url: urlData.original_url,
          short_code: shortCode,
          tags: urlData.tags ? urlData.tags.split(',') : [],
          created_at: urlData.created_at,
          creator_ip: urlData.creator_ip,
          clickCount: clickCount
        });
      }
    }
    
    // Sort by creation date (newest first)
    urlsWithStats.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json(urlsWithStats);
  } catch (error) {
    console.error('Error getting user URLs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Test Redis connection endpoint
app.get('/api/test-redis', async (req, res) => {
  try {
    // Test Redis connection
    const testKey = 'test:connection';
    await redis.set(testKey, 'Redis is working!');
    const testValue = await redis.get(testKey);
    await redis.del(testKey);
    
    res.json({
      success: true,
      message: 'Redis connection is working!',
      testValue: testValue
    });
  } catch (error) {
    console.error('Redis test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Redis connection failed',
      details: error.message
    });
  }
});

// Initialize Redis and start server
async function startServer() {
  await initializeRedis();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} to access the URL shortener`);
    console.log('📊 Enhanced analytics enabled - tracks countries, devices, browsers, and OS');
    console.log('🔴 Redis database connected for persistent storage');
    console.log(`🧪 Test Redis: http://localhost:${PORT}/api/test-redis`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  try {
    await redis.quit();
    console.log('✅ Redis connection closed.');
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error);
  }
  process.exit(0);
});

// Start the application
startServer().catch(console.error); 