const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;
const activityLog = []; // In-memory store for now (can later move to DB)

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

app.post('/api/activity', (req, res) => {
  const { type, details, timestamp } = req.body;

  if (!type || !details || !timestamp) {
    return res.status(400).json({ error: 'Missing activity fields' });
  }

  const newEntry = {
    id: activityLog.length + 1,
    type,
    details,
    timestamp,
  };

  activityLog.push(newEntry);
  console.log("Activity received:", newEntry);

  res.status(201).json({ message: 'Activity logged', entry: newEntry });
});

// Optional: Get all activities
app.get('/api/activity', (req, res) => {
  res.json(activityLog);
});

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
