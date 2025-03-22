require('dotenv').config();
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const fetch = require('node-fetch');

// Initialize express app and database
const app = express();
const port = process.env.PORT;
const dbPath = process.env.DB_PATH;
const db = new Database(dbPath);

// Environment variables for intervals
const fetchIntervalMin = parseInt(process.env.FETCH_INTERVAL_MIN || 240, 10);
const fetchIntervalMax = parseInt(process.env.FETCH_INTERVAL_MAX || 300, 10);
const discordNotificationInterval = parseInt(process.env.DISCORD_NOTIFICATION_INTERVAL || 300, 10);
const defaultApiUrl = 'https://airdrop.tari.com/api/user/details';

// Middleware setup
app.use(express.json());
app.use(express.static('public'));

// Initialize database tables and settings
function initializeDatabase() {
  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE, photo TEXT, discord_enabled INTEGER DEFAULT 1,
      discord_webhook_url TEXT, last_discord_notification DATETIME
    );
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, total_score INTEGER DEFAULT 0,
      gems INTEGER DEFAULT 0, shells INTEGER DEFAULT 0, hammers INTEGER DEFAULT 0,
      yat_holding INTEGER DEFAULT 0, followers INTEGER DEFAULT 0, rank TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tari_api_url TEXT DEFAULT '${defaultApiUrl}',
      fetch_interval INTEGER DEFAULT 300,
      fetch_interval_min INTEGER DEFAULT 240,
      fetch_interval_max INTEGER DEFAULT 300,
      discord_notification_interval INTEGER DEFAULT 1800
    );
  `);

  // Handle database upgrades gracefully
  const addColumnIfNotExists = (table, column, type) => {
    try {
      db.prepare(`SELECT ${column} FROM ${table} LIMIT 1`).get();
    } catch (error) {
      if (error.message.includes('no such column')) {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
      }
    }
  };

  // Add columns if they don't exist
  try {
    addColumnIfNotExists('settings', 'fetch_interval_min', 'INTEGER DEFAULT 240');
    addColumnIfNotExists('settings', 'fetch_interval_max', 'INTEGER DEFAULT 300');
    addColumnIfNotExists('settings', 'discord_notification_interval', 'INTEGER DEFAULT 300');
    addColumnIfNotExists('users', 'last_discord_notification', 'DATETIME');
    addColumnIfNotExists('users', 'discord_webhook_url', 'TEXT');
  } catch (error) {
    if (error.message.includes('no such column')) {
      db.exec(`
        ALTER TABLE settings ADD COLUMN fetch_interval_min INTEGER DEFAULT 240;
        ALTER TABLE settings ADD COLUMN fetch_interval_max INTEGER DEFAULT 300;
        ALTER TABLE settings ADD COLUMN discord_notification_interval INTEGER DEFAULT 300;
        UPDATE settings SET 
          fetch_interval_min = fetch_interval,
          fetch_interval_max = fetch_interval,
          discord_notification_interval = 300
        WHERE id = 1;
      `);
    }
  }

  // Insert default settings if needed
  const settings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settings) {
    db.prepare(`
      INSERT INTO settings (id, tari_api_url, fetch_interval_min, fetch_interval_max, discord_notification_interval)
      VALUES (1, ?, ?, ?, ?)
    `).run(defaultApiUrl, fetchIntervalMin, fetchIntervalMax, discordNotificationInterval);
  } else {
    db.prepare(`
      UPDATE settings SET fetch_interval_min = ?, fetch_interval_max = ?, discord_notification_interval = ? WHERE id = 1
    `).run(fetchIntervalMin, fetchIntervalMax, discordNotificationInterval);
  }
}

// Initialize database
initializeDatabase();

// Normalize different API response formats
function normalizeApiResponse(data) {
  if (data.total_score !== undefined) return data;
  
  if (data.user && data.user.rank) {
    const userData = data.user;
    const rankData = userData.rank;
    return {
      username: userData.display_name || userData.name || "Unknown",
      avatar: userData.image_url || userData.profileimageurl || null,
      total_score: rankData.totalScore || 0,
      gems: rankData.gems || 0,
      shells: rankData.shells || 0,
      hammers: rankData.hammers || 0,
      yat_holding: rankData.yatHolding || 0,
      followers: rankData.followers || 0,
      rank: rankData.rank || null
    };
  }
  
  return {
    username: data.username || data.display_name || data.name || "Unknown",
    avatar: data.avatar || data.image_url || data.profileimageurl || null,
    total_score: data.total_score || data.totalScore || 0,
    gems: data.gems || 0,
    shells: data.shells || 0,
    hammers: data.hammers || 0,
    yat_holding: data.yat_holding || data.yatHolding || 0,
    followers: data.followers || 0,
    rank: data.rank || null
  };
}

// Get random interval between min and max
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

// Make API request to Tari with auth
async function fetchTariApi(token, apiUrl) {
  if (!token) throw new Error('Token is null or undefined');
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} - ${response.statusText}`);
  }
  
  return await response.json();
}

// Insert score record for user
function insertScoreRecord(userId, data) {
  return db.prepare(`
    INSERT INTO scores (user_id, total_score, gems, shells, hammers, yat_holding, followers, rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, data.total_score, data.gems, data.shells, 
    data.hammers, data.yat_holding, data.followers, data.rank
  );
}

// Fetch user scores from Tari API
async function fetchUserScores() {
  // Only log once at the start of the fetch process
  console.log('Fetching user scores...');
  
  const users = db.prepare('SELECT * FROM users').all();
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {
    tari_api_url: defaultApiUrl,
    fetch_interval_min: fetchIntervalMin,
    fetch_interval_max: fetchIntervalMax,
    discord_notification_interval: discordNotificationInterval
  };

  // Skip users with null tokens
  const validUsers = users.filter(user => user.token !== null);
  
  for (const user of validUsers) {
    try {
      const data = await fetchTariApi(user.token, settings.tari_api_url);
      const normalizedData = normalizeApiResponse(data);
      
      // Insert score record
      insertScoreRecord(user.id, normalizedData);

      // Check if notification needed
      const lastScores = db.prepare(`
        SELECT * FROM scores WHERE user_id = ? ORDER BY timestamp DESC LIMIT 2
      `).all(user.id);

      if (lastScores.length > 1 && lastScores[0].total_score !== lastScores[1].total_score) {
        await sendDiscordNotification(user, lastScores[0], lastScores[1], settings);
      }
    } catch (error) {
      console.error(`Error processing user ${user.name}:`, error.message);
    }
  }
  
  console.log('Fetch complete.');
  scheduleNextFetch();
}

// Schedule the next fetch with randomized interval
function scheduleNextFetch() {
  const settings = db.prepare('SELECT fetch_interval_min, fetch_interval_max FROM settings WHERE id = 1').get() || {
    fetch_interval_min: fetchIntervalMin,
    fetch_interval_max: fetchIntervalMax
  };
  
  const interval = getRandomInterval(settings.fetch_interval_min, settings.fetch_interval_max);
  console.log(`Next fetch in ${interval/1000} seconds`);
  setTimeout(fetchUserScores, interval);
}

// Auth middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const username = auth[0];
    const password = auth[1];
    
    // Check directly against environment variables instead of database
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      return next();
    }
  }
  
  res.set('WWW-Authenticate', 'Basic realm="Tari Score Monitor"');
  return res.status(401).send('Authentication required');
}

// Get timeframe query based on timeframe parameter
function getTimeframeQuery(timeframe) {
  const baseQuery = `SELECT * FROM scores WHERE user_id = ?`;
  const timeframeMap = {
    'hourly': `${baseQuery} AND timestamp >= datetime('now', '-12 hours')`,
    'daily': `${baseQuery} AND timestamp >= datetime('now', '-7 days')`,
    'weekly': `${baseQuery} AND timestamp >= datetime('now', '-4 weeks')`,
    'all': baseQuery
  };
  
  return (timeframeMap[timeframe] || baseQuery) + ' ORDER BY timestamp ASC';
}

// API Routes
app.get('/api/users', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, name, photo, discord_enabled FROM users').all();
  res.json(users);
});

// Force fetch endpoint for a specific user
app.post('/api/force-fetch/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    const settings = db.prepare('SELECT tari_api_url FROM settings WHERE id = 1').get() || { tari_api_url: defaultApiUrl };
    console.log(`Force fetching data for user ${user.name}`);
    
    const data = await fetchTariApi(user.token, settings.tari_api_url);
    const normalizedData = normalizeApiResponse(data);
    insertScoreRecord(user.id, normalizedData);
    
    res.json({ success: true, message: `Successfully fetched and updated data for ${user.name}` });
  } catch (error) {
    console.error('Error during force fetch:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/scores/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  const { timeframe, raw } = req.query;
  
  try {
    const timeframeQuery = getTimeframeQuery(timeframe);
    let scores = db.prepare(timeframeQuery).all(userId);
    
    // If no scores with timeframe filter, return all available data
    if (scores.length === 0) {
      scores = db.prepare(`SELECT * FROM scores WHERE user_id = ? ORDER BY timestamp ASC`).all(userId);
    }
    
    // Return raw data if requested
    if (raw === 'true') return res.json(scores);
    
    // Format data for Chart.js
    const formattedData = {
      labels: scores.map(score => {
        const date = new Date(score.timestamp);
        return date.toLocaleString();
      }),
      datasets: [
        {
          label: "Total Score",
          data: scores.map(score => score.total_score),
          borderColor: "rgb(75, 192, 192)",
          backgroundColor: "rgba(75, 192, 192, 0.1)",
          tension: 0.1,
          fill: false,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5
        },
        {
          label: "YAT",
          data: scores.map(score => score.yat_holding),
          borderColor: "rgb(54, 162, 235)",
          backgroundColor: "rgba(54, 162, 235, 0.1)",
          tension: 0.1,
          fill: false,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          hidden: false
        },
        {
          label: "Rank",
          data: scores.map(score => {
            if (!score.rank) return null;
            const rankNum = parseInt(score.rank);
            if (isNaN(rankNum)) return null;
            return rankNum;
          }),
          borderColor: "rgb(76, 175, 80)",
          backgroundColor: "rgba(76, 175, 80, 0.05)",
          tension: 0.1,
          fill: false,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 6,
          hidden: false,
          yAxisID: 'y1',
          borderDash: [5, 5]
        }
      ]
    };
    
    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching scores:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/user/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  
  try {
    const userFull = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userFull) return res.status(404).json({ success: false, error: 'User not found' });
    
    // Create sanitized user object
    const user = {
      id: userFull.id,
      name: userFull.name,
      photo: userFull.photo,
      discord_enabled: userFull.discord_enabled,
      discord_webhook_url: userFull.discord_webhook_url,
      last_discord_notification: userFull.last_discord_notification
    };
    
    // Get latest score and stats
    const latestScore = db.prepare(`SELECT * FROM scores WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`).get(userId);
    const stats = {
      highScore: db.prepare('SELECT MAX(total_score) as max FROM scores WHERE user_id = ?').get(userId)?.max,
      highGems: db.prepare('SELECT MAX(gems) as max FROM scores WHERE user_id = ?').get(userId)?.max,
      highShells: db.prepare('SELECT MAX(shells) as max FROM scores WHERE user_id = ?').get(userId)?.max,
      highHammers: db.prepare('SELECT MAX(hammers) as max FROM scores WHERE user_id = ?').get(userId)?.max,
      highYat: db.prepare('SELECT MAX(yat_holding) as max FROM scores WHERE user_id = ?').get(userId)?.max,
      highFollowers: db.prepare('SELECT MAX(followers) as max FROM scores WHERE user_id = ?').get(userId)?.max,
      bestRank: db.prepare('SELECT MIN(rank) as min FROM scores WHERE user_id = ? AND rank > 0').get(userId)?.min,
      totalRecords: db.prepare('SELECT COUNT(*) as count FROM scores WHERE user_id = ?').get(userId)?.count
    };
    
    // Get first recorded score for comparison
    const firstScore = db.prepare(`SELECT * FROM scores WHERE user_id = ? ORDER BY timestamp ASC LIMIT 1`).get(userId);
    
    // Calculate lifetime change
    if (firstScore && latestScore) {
      stats.lifetimeChange = {
        totalScore: latestScore.total_score - firstScore.total_score,
        gems: latestScore.gems - firstScore.gems,
        rank: firstScore.rank && latestScore.rank ? firstScore.rank - latestScore.rank : null
      };
    }
    
    res.json({ user, latestScore, stats });
  } catch (error) {
    console.error('Error getting user details:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/settings/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  const { discord_enabled, discord_webhook_url } = req.body;
  
  try {
    if (discord_enabled !== undefined && typeof discord_enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Invalid discord_enabled value' });
    }
    
    const updates = [];
    const params = [];
    
    if (discord_enabled !== undefined) {
      updates.push('discord_enabled = ?');
      params.push(discord_enabled ? 1 : 0);
    }
    
    if (discord_webhook_url !== undefined) {
      updates.push('discord_webhook_url = ?');
      params.push(discord_webhook_url);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid settings provided' });
    }
    
    params.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user settings:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// No auth for init to allow adding new users
app.post('/api/init', async (req, res) => {
  const { token } = req.body;
  
  if (!token) return res.status(400).json({ success: false, error: 'Token is required' });
  
  try {
    // Check if token exists
    const existingUser = db.prepare('SELECT * FROM users WHERE token = ?').get(token);
    if (existingUser) {
      return res.status(200).json({ 
        success: true, 
        message: 'User with this token already exists',
        user: { id: existingUser.id, name: existingUser.name }
      });
    }
    
    // Get API URL from settings
    const settings = db.prepare('SELECT tari_api_url FROM settings WHERE id = 1').get() || { tari_api_url: defaultApiUrl };
    
    // Fetch user data
    const data = await fetchTariApi(token, settings.tari_api_url);
    const normalizedData = normalizeApiResponse(data);
    
    // Create user
    const result = db.prepare(`INSERT INTO users (name, token, photo, discord_enabled) VALUES (?, ?, ?, 1)`)
      .run(normalizedData.username, token, normalizedData.avatar);
    
    const userId = result.lastInsertRowid;
    
    // Create initial score
    insertScoreRecord(userId, normalizedData);
    
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
    res.json({ success: true, user });
  } catch (error) {
    console.error('Error adding user:', error.message);
    
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(200).json({ 
        success: true, 
        message: 'This token is already registered in the system. Redirecting to dashboard...'
      });
    }
    
    res.status(500).json({ success: false, error: `Error adding user: ${error.message}` });
  }
});

app.post('/api/send-discord-notification/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    // Check discord settings
    if (user.discord_enabled !== 1 || !user.discord_webhook_url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Discord notifications are disabled or webhook URL is not set' 
      });
    }
    
    // Get settings and scores
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || { discord_notification_interval: discordNotificationInterval };
    const lastScores = db.prepare(`SELECT * FROM scores WHERE user_id = ? ORDER BY timestamp DESC LIMIT 2`).all(userId);
    
    if (lastScores.length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Not enough score data to send a notification (minimum 2 records needed)'
      });
    }
    
    // Force send notification (ignoring interval)
    const result = await sendDiscordNotification(user, lastScores[0], lastScores[1], settings, true);
    
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error) {
    console.error('Error sending manual Discord notification:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a new endpoint for deleting a user token while keeping their data
app.post('/api/user/:userId/delete', requireAuth, async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Check if user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // First delete all scores for this user to avoid foreign key constraint issues
    db.prepare('DELETE FROM scores WHERE user_id = ?').run(userId);
    
    // Then delete the user record
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Frontend routes
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Tari Score Monitor running on http://localhost:${port}`);
  setTimeout(fetchUserScores, Math.floor(Math.random() * 10000) + 10000);
});

// Send Discord notification
async function sendDiscordNotification(user, current, previous, settings, ignoreInterval = false) {
  if (user.discord_enabled !== 1 || !user.discord_webhook_url) {
    return { success: false, message: 'Discord notifications disabled' };
  }
  
  try {
    // Check notification interval unless manual trigger
    if (!ignoreInterval) {
      const now = new Date();
      const lastNotification = user.last_discord_notification ? new Date(user.last_discord_notification) : new Date(0);
      const notificationIntervalMs = settings.discord_notification_interval * 1000;
      
      if (now - lastNotification < notificationIntervalMs) {
        const minutesToWait = Math.ceil((notificationIntervalMs - (now - lastNotification)) / 60000);
        return { success: false, message: `Notification interval not reached. Next notification possible in ~${minutesToWait} minutes` };
      }
    }

    // Calculate score difference
    const scoreDiff = current.total_score - previous.total_score;
    const isPositive = scoreDiff > 0;
    
    // Create notification embed
    const message = {
      embeds: [{
        title: `${user.name}'s Tari Score Update`,
        color: isPositive ? 0x00ff00 : 0xff0000,
        thumbnail: user.photo ? { url: user.photo } : null,
        fields: [
          { name: "Current Score", value: current.total_score.toLocaleString(), inline: true },
          { name: "Previous Score", value: previous.total_score.toLocaleString(), inline: true },
          { name: "Current Rank", value: current.rank ? `#${current.rank}` : "Unknown", inline: true }
        ],
        timestamp: new Date().toISOString()
      }]
    };
    
    // Send the notification
    const response = await fetch(user.discord_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discord API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    // Update last notification timestamp
    const now = new Date();
    db.prepare('UPDATE users SET last_discord_notification = ? WHERE id = ?').run(now.toISOString(), user.id);
    
    return { success: true, message: 'Discord notification sent successfully' };
  } catch (error) {
    console.error(`Failed to send Discord notification for ${user.name}:`, error.message);
    return { success: false, message: `Error: ${error.message}` };
  }
}