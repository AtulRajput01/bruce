// ~/hulk/frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css';

const API_URL = 'https://atulrajput.site/api';

function App() {
  const [systemResources, setSystemResources] = useState(null);
  const [testConfig, setTestConfig] = useState({
    url: 'https://httpbin.org/get',
    concurrency: '10',
    duration: '20',
    method: 'GET',
    body: '',
  });
  const [isTesting, setIsTesting] = useState(false);
  const [lastTestReport, setLastTestReport] = useState(null);
  const [pastReports, setPastReports] = useState([]);
  const [analysis, setAnalysis] = useState({ content: null, loading: false, error: null });
  const intervalRef = useRef(null);
  const showBodyTextarea = testConfig.method === 'POST' || testConfig.method === 'PUT';

  // Fetch system resources on initial load
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/resources`);
        setSystemResources(response.data);
        if (!testConfig.concurrency) {
            setTestConfig(prev => ({ ...prev, concurrency: response.data.suggestedConcurrency }));
        }
      } catch (error) { console.error("Error fetching resources:", error); }
    };
    fetchResources();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/stats`);
      if (response.data.isRunning) {
        setIsTesting(true);
        setLastTestReport(response.data);
      } else {
        // When test stops, clear the interval and fetch final reports
        if (isTesting) {
            fetchPastReports();
        }
        setIsTesting(false);
        clearInterval(intervalRef.current);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      clearInterval(intervalRef.current);
      setIsTesting(false);
    }
  };
  
  const fetchPastReports = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/reports`);
        setPastReports(response.data);
      } catch(error) { console.error("Error fetching past reports:", error); }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setTestConfig(prev => ({ ...prev, [name]: value }));
  };

  const startTest = async () => {
    setLastTestReport(null); // Clear previous report
    setAnalysis({ content: null, loading: false }); // Clear previous analysis
    try {
      await axios.post(`${API_URL}/api/start-test`, testConfig);
      setIsTesting(true);
      intervalRef.current = setInterval(fetchStats, 1000);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to start test.');
    }
  };

  const stopTest = async () => {
    try {
      await axios.post(`${API_URL}/api/stop-test`);
      clearInterval(intervalRef.current);
      setIsTesting(false);
      fetchStats(); // get the final stats
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to stop test.');
    }
  };

  const analyzeReport = async (reportToAnalyze) => {
    setAnalysis({ content: null, loading: true, error: null });
    try {
      const response = await axios.post(`${API_URL}/api/analyze-report`, { report: reportToAnalyze.stats });
      setAnalysis({ content: response.data.analysis, loading: false, error: null });
    } catch (error) {
      console.error(error);
      const errorMessage = error.response?.data?.error || "Could not get AI analysis.";
      setAnalysis({ content: null, loading: false, error: errorMessage });
    }
  }

  return (
    <div className="App">
      <header className="App-header"><h1>Local Load Testing Tool 🚀</h1></header>
      <main>
        <div className="card resource-monitor">
          <h2>System Resources</h2>
          {systemResources ? (
            <div className="stats-grid">
                <div>CPU Cores: <strong>{systemResources.cpuCount}</strong></div>
                <div>CPU Usage: <strong>{systemResources.cpuUsage}%</strong></div>
                <div>Free Memory: <strong>{systemResources.freeMemPercentage}%</strong></div>
                <div className="suggestion">Suggested Users: <strong>{systemResources.suggestedConcurrency}</strong></div>
            </div>
          ) : <p>Loading system stats...</p>}
        </div>

        <div className="card test-controls">
          <h2>Test Configuration</h2>
          <div className="form-group">
            <label>Target URL</label>
            <input type="text" name="url" value={testConfig.url} onChange={handleInputChange} disabled={isTesting} />
          </div>
          <div className="form-group-inline">
            <div className="form-group">
              <label>HTTP Method</label>
              <select name="method" value={testConfig.method} onChange={handleInputChange} disabled={isTesting}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div className="form-group">
              <label>Concurrent Users</label>
              <input type="number" name="concurrency" value={testConfig.concurrency} onChange={handleInputChange} disabled={isTesting} />
            </div>
            <div className="form-group">
              <label>Duration (seconds)</label>
              <input type="number" name="duration" value={testConfig.duration} onChange={handleInputChange} disabled={isTesting} />
            </div>
          </div>
          {showBodyTextarea && (
            <div className="form-group">
              <label>Request Body (JSON)</label>
              <textarea 
                name="body" 
                value={testConfig.body} 
                onChange={handleInputChange} 
                disabled={isTesting} 
                rows="5" 
                placeholder='{ "key": "value" }'
              ></textarea>
            </div>
          )}
          <div className="button-group">
            <button onClick={startTest} disabled={isTesting}>Start Test</button>
            <button onClick={stopTest} disabled={!isTesting} className="stop-button">Stop Test</button>
          </div>
        </div>

        {(lastTestReport) && (
          <div className="card live-results">
            <h2>{isTesting ? "Live Test Results" : "Last Test Report"}</h2>
            <div className="stats-grid">
              <div>Time Elapsed: <strong>{isTesting ? lastTestReport.elapsedTime : (lastTestReport.stats.testDuration || '0s')}</strong></div>
              <div>Total Requests: <strong>{lastTestReport.stats.totalRequests || 0}</strong></div>
              <div>Success: <strong className="success-text">{lastTestReport.stats.successfulRequests || 0}</strong></div>
              <div>Failed: <strong className="error-text">{lastTestReport.stats.failedRequests || 0}</strong></div>
              <div>Success Rate: <strong>{lastTestReport.stats.successRate || '0%'}</strong></div>
              <div>Avg RPS: <strong>{lastTestReport.stats.averageRPS || 0}</strong></div>
            </div>
            <div className="chart-container">
              <h3>Requests Per Second (RPS)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={lastTestReport.stats.history}><CartesianGrid strokeDasharray="3 3" stroke="#555" /><XAxis dataKey="time" stroke="#ccc" /><YAxis stroke="#ccc" /><Tooltip contentStyle={{ backgroundColor: '#333' }} /><Legend /><Line type="monotone" dataKey="rps" stroke="#8884d8" name="RPS" dot={false} /></LineChart>
              </ResponsiveContainer>
            </div>
            {!isTesting && (
                <div className="analysis-section">
                  <button 
                    onClick={() => analyzeReport(lastTestReport)} 
                    disabled={analysis.loading}
                  >
                    {analysis.loading ? "Analyzing..." : "Analyze with AI ✨"}
                  </button>
                  {analysis.error && (
                    <div className="ai-report error">
                      <p>{analysis.error}</p>
                    </div>
                  )}
                  {analysis.content && (
                    <div className="ai-report">
                      <p>{analysis.content}</p>
                    </div>
                  )}
                </div>
            )}
          </div>
        )}
        
        {pastReports.length > 0 && (
            <div className="card">
                <h2>Past Reports</h2>
                <div className="past-reports-list">
                    {pastReports.map((report, index) => (
                        <details key={index} className="past-report-item">
                            <summary>
                                <span>{report.url}</span>
                                <span className={report.errorCount > 0 ? 'error-text' : 'success-text'}>
                                    {report.successCount} / {report.requestsSent} OK
                                </span>
                                <span>{new Date(report.endTime).toLocaleString()}</span>
                            </summary>
                            <div className="stats-grid">
                                <div>Duration: <strong>{report.duration}s</strong></div>
                                <div>Users: <strong>{report.concurrency}</strong></div>
                                <div>Success: <strong className="success-text">{report.successCount}</strong></div>
                                <div>Errors: <strong className="error-text">{report.errorCount}</strong></div>
                            </div>
                        </details>
                    ))}
                </div>
            </div>
        )}
      </main>
    </div>
  );
}

export default App;