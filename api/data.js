// Endpoint do pobierania danych z dane.json
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Na Vercelu pliki z głównego katalogu są dostępne w process.cwd()
    const filePath = path.join(process.cwd(), 'dane.json');
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at ${filePath}`);
    }

    const fileData = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileData);
    res.json(jsonData);
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ error: 'Failed to load data', message: error.message });
  }
};
