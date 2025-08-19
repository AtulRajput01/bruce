require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const os = require('os-utils');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

// Polyfill fetch for Node.js
if (!globalThis.fetch) {
    globalThis.fetch = fetch;
}

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' })); // Allow larger request bodies

// --- State Variables ---
let testInterval = null;
let testTimeout = null;
let isTestRunning = false;
let testStats = {};
const reportHistory = []; // To store the last 3 reports

// --- Gemini AI Setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Securely load key
if (!GEMINI_API_KEY) {
    console.error("Gemini API Key is missing! Please create a .env file with GEMINI_API_KEY");
    process.exit(1);
}

let genAI;
let model;

try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
} catch (error) {
    console.error("Failed to initialize Gemini AI:", error.message);
    process.exit(1);
}

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
    const { url, concurrency, duration, method, body } = req.body;
    if (!url || !concurrency || !duration || !method) {
        return res.status(400).json({ message: 'URL, concurrency, duration, and method are required.' });
    }

    let requestBody = null;
    if (body && (method === 'POST' || method === 'PUT')) {
        try {
            requestBody = JSON.parse(body);
        } catch (e) {
            return res.status(400).json({ message: 'Invalid JSON in request body.' });
        }
    }

    isTestRunning = true;
    testStats = {
        startTime: Date.now(),
        requestsPerSecond: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        history: []
    };
    let requestsThisSecond = 0;

    testInterval = setInterval(() => {
        for (let i = 0; i < concurrency; i++) {
            // DYNAMICALLY create axios request based on method
            axios({
                method: method,
                url: url,
                data: requestBody,
                timeout: 5000 // 5 second timeout for requests
            })
            .then(() => { 
                testStats.successfulRequests++;
                testStats.totalRequests++;
                requestsThisSecond++;
            })
            .catch(() => { 
                testStats.failedRequests++;
                testStats.totalRequests++;
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
  const stats = {
    ...testStats,
    successRate: testStats.totalRequests > 0 
      ? (testStats.successfulRequests / testStats.totalRequests * 100).toFixed(2) + '%' 
      : '0%',
    averageRPS: elapsedTime > 0 
      ? (testStats.totalRequests / elapsedTime).toFixed(2)
      : 0
  };
  res.json({ 
    isRunning: isTestRunning, 
    stats: stats, 
    elapsedTime: elapsedTime.toFixed(1) 
  });
});

// NEW: Endpoint to get the list of past reports
app.get('/api/reports', (req, res) => {
    res.json(reportHistory);
});

// Chat-based analysis endpoint
app.post('/api/analyze-report', async (req, res) => {
    const { message, report } = req.body;
    
    if (!message) {
        return res.status(400).send({ error: 'Message is required for analysis.' });
    }

    try {
        let context = '';
        
        if (report) {
            context = `Here are the test results you can analyze:
            
            Test Duration: ${(report.endTime - report.startTime) / 1000} seconds
            Total Requests: ${report.totalRequests}
            Successful Requests: ${report.successfulRequests}
            Failed Requests: ${report.failedRequests}
            Success Rate: ${report.successRate}
            Average RPS: ${report.averageRPS}
            
            User's question: "${message}"
            
            Please provide a helpful response based on the test results above.`;
        } else {
            context = `The user is asking about load testing in general. Here's their question: "${message}"`;
        }
        
        const prompt = `You are a Load Testing Assistant. Your job is to help users understand and analyze their load test results.
        
        ${context}
        
        Provide a clear, concise, and helpful response. If the user asks for recommendations, suggest specific optimizations based on the test results.`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        res.send({ 
            analysis: text,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error with Gemini API:", error);
        res.status(500).send({ 
            error: `AI analysis failed: ${error.message}`,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

const stopTestLogic = () => {
  isTestRunning = false;
  clearInterval(testInterval);
  clearTimeout(testTimeout);
  testStats.endTime = Date.now();

  // Save the completed report to history
  if (testStats.totalRequests > 0) {
    // Calculate success rate
    const successRate = (testStats.successfulRequests / testStats.totalRequests * 100).toFixed(2);
    const report = {
      ...testStats,
      successRate: `${successRate}%`,
      testDuration: ((testStats.endTime - testStats.startTime) / 1000).toFixed(2) + 's',
      averageRPS: (testStats.totalRequests / ((testStats.endTime - testStats.startTime) / 1000)).toFixed(2)
    };
    
    reportHistory.unshift(report); // Add to the beginning of the array
    if (reportHistory.length > 3) {
      reportHistory.pop(); // Keep only the last 3 reports
    }
  }
  console.log('Test finished and report saved.');
};

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});