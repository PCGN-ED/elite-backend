require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
const port = process.env.PORT || 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

app.use(cors());
app.use(express.json());

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, commander) => {
    if (err) return res.sendStatus(403);
    req.commander = commander;
    next();
  });
}

app.get('/api/commander', (req, res) => {
  res.json({
    name: "CMDR Maverick",
    system: "Shinrarta Dezhra",
    faction: "The Voidhawks",
    power: "Aisling Duval",
    credits: 4200000000,
    ranks: {
      combat: "Deadly",
      trade: "Elite",
      explore: "Elite",
      cqc: "Semi-Pro"
    }
  });
});

app.post('/api/activity', authenticateToken, async (req, res) => {
  const { type, details, timestamp } = req.body;

  if (!type || !details || !timestamp) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const commanderId = req.commander.commander_id;

    await pool.query(
      'INSERT INTO activities (type, details, timestamp, commander_id) VALUES ($1, $2, $3, $4)',
      [type, details, timestamp, commanderId]
    );

    res.status(201).json({ message: 'Activity stored' });
  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: 'Failed to save activity' });
  }
});

app.get('/api/activity', authenticateToken, async (req, res) => {
  try {
    const commanderId = req.commander.commander_id;
    const result = await pool.query(
      'SELECT * FROM activities WHERE commander_id = $1 ORDER BY timestamp DESC',
      [commanderId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const existing = await pool.query('SELECT * FROM commanders WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Commander already exists' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      'INSERT INTO commanders (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username, email, passwordHash]
    );

    res.status(201).json({ message: 'Commander registered', commander: result.rows[0] });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const result = await pool.query('SELECT * FROM commanders WHERE email = $1', [email]);
    const commander = result.rows[0];

    if (!commander) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, commander.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        commander_id: commander.id,
        username: commander.username
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      commander: {
        id: commander.id,
        username: commander.username,
        email: commander.email,
        created_at: commander.created_at,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/commander/token', authenticateToken, async (req, res) => {
  const commanderId = req.commander.commander_id;

  try {
    const apiToken = uuidv4();

    await pool.query(
      'UPDATE commanders SET api_token = $1 WHERE id = $2',
      [apiToken, commanderId]
    );

    res.json({ api_token: apiToken });
  } catch (err) {
    console.error('Token generation error:', err);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

app.post('/api/journal', authenticateToken, async (req, res) => {
  try {
    const { cmdr, system, station, entry } = req.body;
    const commanderId = req.commander.commander_id;

    await pool.query(
      'INSERT INTO journal_entries (commander_id, cmdr_name, system, station, event_data) VALUES ($1, $2, $3, $4, $5)',
      [commanderId, cmdr, system, station, JSON.stringify(entry)]
    );

    res.status(200).json({ message: 'Journal received' });
  } catch (err) {
    console.error('[JOURNAL ERROR]', err);
    res.status(500).json({ error: 'Failed to process journal' });
  }
});

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
