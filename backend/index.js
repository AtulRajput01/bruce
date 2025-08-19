// ~/hulk/backend/index.js

const express = require('express');
const cors = require('cors');
const os = require('os-utils');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// --- State Variables ---
let testInterval;
let testTimeout;
let isTestRunning = false;
let testStats = {};
const reportHistory = []; // To store the last 3 reports

// --- NEW: Gemini AI Setup ---
const GEMINI_API_KEY = "AIzaSyDlzNbkWBGttMy2ksdGpRr5DR7MpNXVsaY"; // Your API Key
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});


// --- API Endpoints ---

// NEW: Endpoint to get system resource details
app.get('/api/resources', (req, res) => {
  os.cpuUsage(function(cpuUsage) {
    const freeMemPercentage = os.freememPercentage() * 100;
    const cpuCount = os.cpuCount();
    // A simple heuristic for suggested concurrency
    const suggestedConcurrency = Math.floor(cpuCount * 50 * 0.8);

    res.json({
      cpuUsage: (cpuUsage * 100).toFixed(2),
      freeMemPercentage: freeMemPercentage.toFixed(2),
      cpuCount,
      suggestedConcurrency,
    });
  });
});

// Start the Load Test (Upgraded)
app.post('/api/start-test', (req, res) => {
  if (isTestRunning) {
    return res.status(400).json({ message: 'A test is already in progress.' });
  }
  const { url, concurrency, duration } = req.body;
  if (!url || !concurrency || !duration) {
    return res.status(400).json({ message: 'URL, concurrency, and duration are required.' });
  }

  isTestRunning = true;
  testStats = {
    url,
    concurrency,
    duration,
    requestsSent: 0,
    successCount: 0,
    errorCount: 0,
    requestsPerSecond: 0,
    startTime: Date.now(),
    history: [],
  };
  let requestsThisSecond = 0;

  testInterval = setInterval(() => {
    for (let i = 0; i < concurrency; i++) {
      axios.get(url)
        .then(() => { testStats.successCount++; })
        .catch(() => { testStats.errorCount++; })
        .finally(() => {
          testStats.requestsSent++;
          requestsThisSecond++;
        });
    }
  }, 1000);

  const statsInterval = setInterval(() => {
    if (!isTestRunning) {
      clearInterval(statsInterval);
      return;
    }
    testStats.requestsPerSecond = requestsThisSecond;
    requestsThisSecond = 0;
    const elapsedTime = ((Date.now() - testStats.startTime) / 1000).toFixed(0);
    testStats.history.push({ time: elapsedTime, rps: testStats.requestsPerSecond });
    if (testStats.history.length > 120) testStats.history.shift();
  }, 1000);

  testTimeout = setTimeout(() => {
    stopTestLogic();
  }, duration * 1000);

  res.status(200).json({ message: 'Load test started.' });
});

app.post('/api/stop-test', (req, res) => {
  if (!isTestRunning) return res.status(400).json({ message: 'No test is running.' });
  stopTestLogic();
  res.status(200).json({ message: 'Load test stopped manually.' });
});

app.get('/api/stats', (req, res) => {
  const elapsedTime = isTestRunning ? (Date.now() - testStats.startTime) / 1000 : 0;
  res.json({ isRunning: isTestRunning, stats: testStats, elapsedTime: elapsedTime.toFixed(1) });
});

// NEW: Endpoint to get the list of past reports
app.get('/api/reports', (req, res) => {
    res.json(reportHistory);
});

// NEW: Endpoint to analyze a report with Gemini AI
app.post('/api/analyze-report', async (req, res) => {
    const report = req.body.report;
    if (!report) {
        return res.status(400).send({ error: 'Report data is required.' });
    }

    const prompt = `Analyze the following load test report and provide a crisp, one-paragraph summary of the results. Mention the stability and performance based on the success/error rate and RPS.
    - URL Tested: ${report.url}
    - Concurrent Users: ${report.concurrency}
    - Test Duration: ${report.duration} seconds
    - Total Requests: ${report.requestsSent}
    - Successful Requests: ${report.successCount}
    - Failed Requests: ${report.errorCount}
    - Average RPS: ${(report.requestsSent / report.duration).toFixed(2)}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        res.send({ analysis: text });
    } catch (error) {
        console.error("Error with Gemini API:", error);
        res.status(500).send({ error: 'Failed to analyze report with AI.' });
    }
});


const stopTestLogic = () => {
  isTestRunning = false;
  clearInterval(testInterval);
  clearTimeout(testTimeout);
  testStats.endTime = Date.now();

  // NEW: Save the completed report to history
  if (testStats.requestsSent > 0) {
    reportHistory.unshift(testStats); // Add to the beginning of the array
    if (reportHistory.length > 3) {
      reportHistory.pop(); // Keep only the last 3 reports
    }
  }
  console.log('Test finished and report saved.');
};

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});