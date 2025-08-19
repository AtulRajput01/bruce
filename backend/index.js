// ~/hulk/backend/index.js

const express = require('express');
const cors = require('cors');
const os = require('os-utils');
const axios = require('axios');

const app = express();
const PORT = 3001;

// --- Middleware ---
app.use(cors());      // Allows the React frontend to communicate with this server
app.use(express.json()); // Allows the server to understand JSON data

// --- State Variables ---
let isTestRunning = false;
let testInterval;

// --- API Endpoints ---

// 1. Get System Resources
app.get('/api/resources', (req, res) => {
  os.cpuUsage(function(v){
    const cpuUsage = v * 100;
    const freeMemPercentage = os.freememPercentage() * 100;
    const totalMemGB = (os.totalmem() / 1024).toFixed(2);
    const cpuCount = os.cpuCount();

    // Suggest concurrency: e.g., 50 concurrent users per core at 80% capacity
    const suggestedConcurrency = Math.floor(cpuCount * 50 * 0.8);

    res.json({
      cpuUsage: cpuUsage.toFixed(2),
      freeMemPercentage: freeMemPercentage.toFixed(2),
      totalMemGB,
      cpuCount,
      suggestedConcurrency
    });
  });
});

// 2. Start the Load Test
app.post('/api/start-test', (req, res) => {
  if (isTestRunning) {
    return res.status(400).json({ message: 'A test is already in progress.' });
  }

  const { url, concurrency } = req.body;
  if (!url || !concurrency) {
    return res.status(400).json({ message: 'URL and concurrency are required.' });
  }

  isTestRunning = true;
  let requestsSent = 0;
  let errors = 0;

  console.log(`Starting test on ${url} with ${concurrency} concurrent users.`);

  // Send 'concurrency' number of requests every second
  testInterval = setInterval(() => {
    for (let i = 0; i < concurrency; i++) {
      axios.get(url)
        .then(response => {
          requestsSent++;
        })
        .catch(error => {
          errors++;
          console.error(`Request failed: ${error.message}`);
        });
    }
    console.log(`Requests Sent: ${requestsSent}, Errors: ${errors}`);
  }, 1000);

  res.status(200).json({ message: 'Load test started successfully.' });
});

// 3. Stop the Load Test
app.post('/api/stop-test', (req, res) => {
  if (!isTestRunning) {
    return res.status(400).json({ message: 'No test is currently running.' });
  }

  isTestRunning = false;
  clearInterval(testInterval);
  console.log('Test stopped.');
  res.status(200).json({ message: 'Load test stopped successfully.' });
});


// --- Start the Server ---
app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});