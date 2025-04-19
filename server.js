require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

app.post('/api/activity', async (req, res) => {
  const { type, details, timestamp } = req.body;

  if (!type || !details || !timestamp) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO activities (type, details, timestamp) VALUES ($1, $2, $3) RETURNING *',
      [type, details, timestamp]
    );
    res.status(201).json({ message: 'Activity stored', entry: result.rows[0] });
  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: 'Failed to save activity' });
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM activities ORDER BY timestamp DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

const bcrypt = require('bcrypt');

// Commander Registration
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if email or username already exists
    const existing = await pool.query('SELECT * FROM commanders WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Commander already exists' });
    }

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert into database
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


// Commander Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    // Check if user exists
    const result = await pool.query('SELECT * FROM commanders WHERE email = $1', [email]);
    const commander = result.rows[0];

    if (!commander) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare password
    const isValid = await bcrypt.compare(password, commander.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Return success (token to come later)
    res.status(200).json({
      message: 'Login successful',
      commander: {
        id: commander.id,
        username: commander.username,
        email: commander.email,
        created_at: commander.created_at,
      },
      token: 'mock-token-for-now'
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
