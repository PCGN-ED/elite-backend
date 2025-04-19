require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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


app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
