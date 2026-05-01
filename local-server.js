const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const __dirname = path.resolve();

const app = express();
const PORT = process.env.PORT || 5500;
const LOG_FILE = path.join(__dirname, 'logs.json');
const COUNTER_FILE = path.join(__dirname, 'user_counter.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, JSON.stringify([]));
if (!fs.existsSync(COUNTER_FILE)) fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: 0 }));

app.get('/api/register-user', (req, res) => {
    try {
        const data = fs.readFileSync(COUNTER_FILE, 'utf8');
        const counter = JSON.parse(data);
        counter.count += 1;
        
        // Zapewnienie, że startujemy od 200
        if (counter.count < 200) {
            counter.count = 200;
        }
        
        fs.writeFileSync(COUNTER_FILE, JSON.stringify(counter, null, 2));
        res.json({ userId: `user${counter.count}` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/log', (req, res) => {
    const { userId, action, details } = req.body;
    
    // Podstawowa walidacja (analogicznie do wersji serwerowej)
    if (!userId || !action) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (typeof userId !== 'string' || !/^(user\d+|unknown_\d+|user_err_\d+)$/.test(userId)) {
        return res.status(400).json({ error: 'Invalid userId format' });
    }
    if (typeof action !== 'string' || action.length > 50) {
        return res.status(400).json({ error: 'Invalid action format' });
    }

    const logEntry = { timestamp: new Date().toISOString(), userId, action, details };
    try {
        const data = fs.readFileSync(LOG_FILE, 'utf8');
        const logs = JSON.parse(data);
        logs.push(logEntry);
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/logs', (req, res) => {
    try {
        const data = fs.readFileSync(LOG_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/data', (req, res) => {
    try {
        const dataPath = path.join(__dirname, 'dane.json');
        const data = fs.readFileSync(dataPath, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to load data' });
    }
});

app.listen(PORT, () => {
    console.log(`Local server: http://localhost:${PORT}`);
});
