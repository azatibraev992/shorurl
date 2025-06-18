const express = require('express');
const { createClient } = require('redis');
const cors = require('cors');
const shortid = require('shortid');
const geoip = require('geoip-lite');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');

const app = express();

// Redis client setup
let redis = null;

async function getRedisClient() {
  if (!redis) {
    try {
      redis = createClient({
        url: process.env.REDIS_URL
      });
      
      redis.on('error', (err) => console.log('Redis Client Error', err));
      await redis.connect();
      console.log('✅ Connected to Redis');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      // Fallback to memory storage if Redis fails
      redis = null;
    }
  }
  return redis;
}

// In-memory storage as fallback
let memoryStorage = {
  urls: new Map(),
  clicks: new Map(),
  users: new Map() // user_id -> { password_hash, created_at }
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Helper functions
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
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
    'FR': 'Франция', 'JP': 'Япония', 'CN': 'Китай', 'CA': 'Канада',
    'AU': 'Австралия', 'BR': 'Бразилия', 'IN': 'Индия', 'IT': 'Италия',
    'ES': 'Испания', 'NL': 'Нидерланды', 'SE': 'Швеция', 'NO': 'Норвегия',
    'DK': 'Дания', 'FI': 'Финляндия', 'PL': 'Польша', 'TR': 'Турция',
    'UA': 'Украина', 'KZ': 'Казахстан', 'BY': 'Беларусь'
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

// Storage functions
async function saveUser(userId, userData) {
  const client = await getRedisClient();
  if (client) {
    try {
      await client.hSet(`user:${userId}`, userData);
    } catch (error) {
      console.error('Redis user save error:', error);
      memoryStorage.users.set(userId, userData);
    }
  } else {
    memoryStorage.users.set(userId, userData);
  }
}

async function getUser(userId) {
  const client = await getRedisClient();
  if (client) {
    try {
      const userData = await client.hGetAll(`user:${userId}`);
      return userData.password_hash ? userData : null;
    } catch (error) {
      console.error('Redis user get error:', error);
      return memoryStorage.users.get(userId);
    }
  } else {
    return memoryStorage.users.get(userId);
  }
}

async function getUserByPassword(password) {
  const passwordHash = hashPassword(password);
  const client = await getRedisClient();
  
  if (client) {
    try {
      // Scan all user keys
      const keys = await client.keys('user:*');
      for (const key of keys) {
        const userData = await client.hGetAll(key);
        if (userData.password_hash === passwordHash) {
          const userId = key.replace('user:', '');
          return { userId, ...userData };
        }
      }
      return null;
    } catch (error) {
      console.error('Redis user search error:', error);
      // Fallback to memory
      for (const [userId, userData] of memoryStorage.users.entries()) {
        if (userData.password_hash === passwordHash) {
          return { userId, ...userData };
        }
      }
      return null;
    }
  } else {
    for (const [userId, userData] of memoryStorage.users.entries()) {
      if (userData.password_hash === passwordHash) {
        return { userId, ...userData };
      }
    }
    return null;
  }
}

async function saveUrl(shortCode, urlData) {
  const client = await getRedisClient();
  if (client) {
    try {
      await client.hSet(`url:${shortCode}`, urlData);
      if (urlData.user_id) {
        await client.sAdd(`user_urls:${urlData.user_id}`, shortCode);
      }
      // Keep backward compatibility for IP-based tracking
      if (urlData.creator_ip) {
        await client.sAdd(`user_urls:${urlData.creator_ip}`, shortCode);
      }
    } catch (error) {
      console.error('Redis save error:', error);
      memoryStorage.urls.set(shortCode, urlData);
    }
  } else {
    memoryStorage.urls.set(shortCode, urlData);
  }
}

async function updateUrl(shortCode, updateData) {
  const client = await getRedisClient();
  if (client) {
    try {
      // Get existing data first
      const existingData = await client.hGetAll(`url:${shortCode}`);
      if (!existingData.original_url) {
        return false;
      }
      
      // Update with new data
      const updatedData = { ...existingData, ...updateData };
      await client.hSet(`url:${shortCode}`, updatedData);
      return true;
    } catch (error) {
      console.error('Redis update error:', error);
      const existingData = memoryStorage.urls.get(shortCode);
      if (existingData) {
        memoryStorage.urls.set(shortCode, { ...existingData, ...updateData });
        return true;
      }
      return false;
    }
  } else {
    const existingData = memoryStorage.urls.get(shortCode);
    if (existingData) {
      memoryStorage.urls.set(shortCode, { ...existingData, ...updateData });
      return true;
    }
    return false;
  }
}

async function getUrl(shortCode) {
  const client = await getRedisClient();
  if (client) {
    try {
      const urlData = await client.hGetAll(`url:${shortCode}`);
      return urlData.original_url ? urlData : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return memoryStorage.urls.get(shortCode);
    }
  } else {
    return memoryStorage.urls.get(shortCode);
  }
}

async function saveClick(shortCode, clickData) {
  const client = await getRedisClient();
  const clickId = `${shortCode}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
  
  if (client) {
    try {
      await client.hSet(`click:${clickId}`, clickData);
      await client.lPush(`clicks:${shortCode}`, clickId);
    } catch (error) {
      console.error('Redis click save error:', error);
      if (!memoryStorage.clicks.has(shortCode)) {
        memoryStorage.clicks.set(shortCode, []);
      }
      memoryStorage.clicks.get(shortCode).push(clickData);
    }
  } else {
    if (!memoryStorage.clicks.has(shortCode)) {
      memoryStorage.clicks.set(shortCode, []);
    }
    memoryStorage.clicks.get(shortCode).push(clickData);
  }
}

async function getClicks(shortCode) {
  const client = await getRedisClient();
  if (client) {
    try {
      const clickIds = await client.lRange(`clicks:${shortCode}`, 0, -1);
      const clicks = [];
      for (const clickId of clickIds) {
        const clickData = await client.hGetAll(`click:${clickId}`);
        if (clickData.clicked_at) {
          clicks.push(clickData);
        }
      }
      return clicks;
    } catch (error) {
      console.error('Redis clicks get error:', error);
      return memoryStorage.clicks.get(shortCode) || [];
    }
  } else {
    return memoryStorage.clicks.get(shortCode) || [];
  }
}

async function getUserUrls(userIdentifier) {
  const client = await getRedisClient();
  if (client) {
    try {
      const shortCodes = await client.sMembers(`user_urls:${userIdentifier}`);
      const urls = [];
      for (const shortCode of shortCodes) {
        const urlData = await client.hGetAll(`url:${shortCode}`);
        if (urlData.original_url) {
          const clickCount = await client.lLen(`clicks:${shortCode}`);
          urlData.clickCount = clickCount;
          urlData.tags = urlData.tags ? urlData.tags.split(',') : [];
          urls.push(urlData);
        }
      }
      return urls.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
      console.error('Redis user URLs get error:', error);
      const urls = [];
      for (const [shortCode, urlData] of memoryStorage.urls.entries()) {
        if (urlData.user_id === userIdentifier || urlData.creator_ip === userIdentifier) {
          const clicks = memoryStorage.clicks.get(shortCode) || [];
          urlData.clickCount = clicks.length;
          urls.push(urlData);
        }
      }
      return urls.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  } else {
    const urls = [];
    for (const [shortCode, urlData] of memoryStorage.urls.entries()) {
      if (urlData.user_id === userIdentifier || urlData.creator_ip === userIdentifier) {
        const clicks = memoryStorage.clicks.get(shortCode) || [];
        urlData.clickCount = clicks.length;
        urls.push(urlData);
      }
    }
    return urls.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Test Redis connection endpoint
app.get('/api/test-redis', async (req, res) => {
  try {
    const client = await getRedisClient();
    if (client) {
      const testKey = 'test:connection';
      await client.set(testKey, 'Redis is working!');
      const testValue = await client.get(testKey);
      await client.del(testKey);
      
      res.json({
        success: true,
        message: 'Redis connection is working!',
        testValue: testValue
      });
    } else {
      res.json({
        success: false,
        message: 'Using memory storage (Redis not available)'
      });
    }
  } catch (error) {
    console.error('Redis test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Redis connection failed',
      details: error.message
    });
  }
});

app.post('/api/shorten', async (req, res) => {
  try {
    const { url, tags, userId } = req.body;
    
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Please provide a valid URL' });
    }

    const shortCode = shortid.generate();
    const clientIP = getClientIP(req);
    
    const urlData = {
      original_url: url,
      short_code: shortCode,
      tags: Array.isArray(tags) ? tags.join(',') : (tags || ''),
      created_at: new Date().toISOString(),
      creator_ip: clientIP,
      user_id: userId || null
    };

    await saveUrl(shortCode, urlData);

    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    res.json({
      success: true,
      shortUrl: `${protocol}://${host}/${shortCode}`,
      shortCode: shortCode,
      originalUrl: url,
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : [])
    });
  } catch (error) {
    console.error('Error creating short URL:', error);
    res.status(500).json({ error: 'Failed to create short URL' });
  }
});

app.get('/:shortCode', async (req, res) => {
  try {
    const shortCode = req.params.shortCode;
    
    if (shortCode.includes('.') || shortCode.startsWith('api') || shortCode.startsWith('_')) {
      return res.status(404).send('Not found');
    }
    
    const urlData = await getUrl(shortCode);
    
    if (!urlData || !urlData.original_url) {
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
    
    const deviceInfo = parseUserAgent(userAgent);

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

    await saveClick(shortCode, clickData);

    // Redirect to original URL with all parameters preserved
    let redirectUrl = urlData.original_url;
    
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

app.get('/api/analytics/:shortCode', async (req, res) => {
  try {
    const shortCode = req.params.shortCode;
    const urlData = await getUrl(shortCode);
    
    if (!urlData || !urlData.original_url) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    const clicks = await getClicks(shortCode);
    
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

app.get('/api/my-urls', async (req, res) => {
  try {
    const { userId } = req.query;
    const clientIP = getClientIP(req);
    
    // Use userId if provided, otherwise fall back to IP for backward compatibility
    const identifier = userId || clientIP;
    const urls = await getUserUrls(identifier);
    res.json(urls);
  } catch (error) {
    console.error('Error getting user URLs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user URLs by user ID
app.get('/api/user/:userId/urls', async (req, res) => {
  try {
    const { userId } = req.params;
    const urls = await getUserUrls(userId);
    res.json(urls);
  } catch (error) {
    console.error('Error getting user URLs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update URL destination
app.put('/api/url/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;
    const { originalUrl, tags, userId } = req.body;
    
    if (!originalUrl || !isValidUrl(originalUrl)) {
      return res.status(400).json({ error: 'Введите корректный URL' });
    }

    // Verify ownership
    const urlData = await getUrl(shortCode);
    if (!urlData) {
      return res.status(404).json({ error: 'Ссылка не найдена' });
    }
    
    // Check if user owns this URL
    const clientIP = getClientIP(req);
    if (urlData.user_id !== userId && urlData.creator_ip !== clientIP) {
      return res.status(403).json({ error: 'У вас нет прав на редактирование этой ссылки' });
    }

    const updateData = {
      original_url: originalUrl,
      tags: Array.isArray(tags) ? tags.join(',') : (tags || ''),
      updated_at: new Date().toISOString()
    };

    const success = await updateUrl(shortCode, updateData);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Ссылка успешно обновлена',
        shortCode,
        originalUrl,
        tags: Array.isArray(tags) ? tags : (tags ? [tags] : [])
      });
    } else {
      res.status(404).json({ error: 'Ссылка не найдена' });
    }
  } catch (error) {
    console.error('Error updating URL:', error);
    res.status(500).json({ error: 'Ошибка при обновлении ссылки' });
  }
});

// Authentication routes
app.post('/api/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
    }

    // Try to find existing user
    let user = await getUserByPassword(password);
    
    if (!user) {
      // Create new user
      const userId = generateUserId();
      const userData = {
        password_hash: hashPassword(password),
        created_at: new Date().toISOString()
      };
      
      await saveUser(userId, userData);
      user = { userId, ...userData };
    }

    res.json({
      success: true,
      userId: user.userId,
      message: 'Вход выполнен успешно'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

module.exports = app; 