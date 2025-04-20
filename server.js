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

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, async (err, commander) => {
    if (!err) {
      req.commander = commander;
      return next();
    }

    try {
      const result = await pool.query('SELECT * FROM commanders WHERE api_token = $1', [token]);
      if (result.rows.length === 0) return res.sendStatus(403);

      req.commander = {
        commander_id: result.rows[0].id,
        username: result.rows[0].username
      };
      next();
    } catch (dbErr) {
      console.error('API Token auth error:', dbErr);
      res.sendStatus(500);
    }
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
    const existing = await pool.query(
      'SELECT api_token FROM commanders WHERE id = $1',
      [commanderId]
    );

    if (existing.rows[0]?.api_token) {
      return res.json({ api_token: existing.rows[0].api_token });
    }

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

    const eventType = entry.event;

    const controllingFaction = entry.SystemFaction?.Name || null;
const playerFaction = entry.PlayerFaction?.Name || null;

switch (eventType) {
      case 'FSDJump':
      case 'Location':
        if (Array.isArray(entry.Factions)) {
          for (const faction of entry.Factions) {
            await pool.query(
  `INSERT INTO faction_stats (system, faction_name, allegiance, influence, state, is_player, is_controlling, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, now())
   ON CONFLICT (system, faction_name) DO UPDATE
   SET allegiance = $3, influence = $4, state = $5, is_player = $6, is_controlling = $7, updated_at = now()`,
  [
    system,
    faction.Name,
    faction.Allegiance || null,
    faction.Influence || 0,
    faction.FactionState || null,
    faction.SquadronFaction === true,
    faction.Name?.toLowerCase().trim() === controllingFaction?.toLowerCase().trim()
  ]
);
          }
        }
        break;
      case 'MissionCompleted':
        await pool.query(
          'INSERT INTO bgs_contributions (commander_id, system, faction, reward, timestamp) VALUES ($1, $2, $3, $4, now())',
          [commanderId, system, entry.Faction || null, entry.Reward || 0]
        );
        break;

      case 'Powerplay':
      case 'PowerplayCollect':
        await pool.query(
          'INSERT INTO powerplay_logs (commander_id, power, action, amount, timestamp) VALUES ($1, $2, $3, $4, now())',
          [commanderId, entry.Power || null, eventType, entry.Amount || 0]
        );
        break;

      case 'MarketSell':
      case 'BuyCommodity': {
        const commodity = entry.Type || entry.Commodity || entry.Fuel || null;
        const quantity = entry.Count || entry.Quantity || 0;
        const credits = entry.TotalSale || entry.PricePaid || 0;

        if (commodity && quantity > 0) {
          await pool.query(
            'INSERT INTO colonization_support (commander_id, system, station, event_type, commodity, quantity, credits, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, now())',
            [commanderId, system, station, eventType, commodity, quantity, credits]
          );
        }
        break;
      }

      case 'ColonisationContribution':
        if (Array.isArray(entry.Contributions)) {
          for (const item of entry.Contributions) {
            await pool.query(
              'INSERT INTO colonization_support (commander_id, system, station, event_type, commodity, quantity, credits, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, now())',
              [commanderId, system, station, 'ColonisationContribution', item.Name_Localised || item.Name, item.Amount || 0, 0]
            );
          }
        }
        break;

      case 'ColonisationConstructionDepot':
        await pool.query(
          'INSERT INTO colonization_depots (market_id, system, station, progress, raw_data, updated_at) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (market_id) DO UPDATE SET progress = $4, raw_data = $5, updated_at = now()',
          [entry.MarketID, system, station, entry.ConstructionProgress || 0, entry]
        );

        if (Array.isArray(entry.ResourcesRequired)) {
          for (const resource of entry.ResourcesRequired) {
            await pool.query(
              'INSERT INTO depot_commodities (market_id, commodity, required, provided, payment, updated_at) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (market_id, commodity) DO UPDATE SET required = $3, provided = $4, payment = $5, updated_at = now()',
              [entry.MarketID, resource.Name_Localised || resource.Name, resource.RequiredAmount, resource.ProvidedAmount, resource.Payment || 0]
            );
          }
        }
        break;
    }

    res.status(200).json({ message: 'Journal received' });
  } catch (err) {
    console.error('[JOURNAL ERROR]', err.message, err.stack);
    res.status(500).json({ error: 'Failed to process journal', details: err.message });
  }
});

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
