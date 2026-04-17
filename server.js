const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ngrok = require('@ngrok/ngrok');

const app = express();
const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'logs.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize logs file if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, JSON.stringify([]));
}

// Endpoint to receive logs from the frontend
app.post('/api/log', (req, res) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ...req.body
    };

    console.log('Received log:', logEntry);

    try {
        const data = fs.readFileSync(LOG_FILE, 'utf8');
        const logs = JSON.parse(data);
        logs.push(logEntry);
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error writing log:', error);
        res.status(500).json({ success: false, error: 'Failed to write log' });
    }
});

app.listen(PORT, async () => {
    console.log(`Server running locally at http://localhost:${PORT}`);
    
    try {
        console.log('Starting ngrok tunnel...');
        // Start ngrok tunnel to the local port
        const listener = await ngrok.forward({ addr: PORT, authtoken_from_env: true });
        console.log('==================================================');
        console.log(`🚀 Ngrok tunnel is active!`);
        console.log(`🌐 Share this link with users: ${listener.url()}`);
        console.log('==================================================');
    } catch (error) {
        console.error('Failed to start ngrok tunnel. Make sure to authenticate or use it locally.');
        console.error(error);
    }
});
