// Global variables
let scoreChart = null, yatChart = null, currentUserId = null, currentTimeframe = 'all';

// Helper functions
const formatNumber = value => value === undefined || value === null ? '0' : Number(value).toLocaleString();
const formatChange = (current, previous) => {
  // If single value passed, format it with +/- directly
  if (previous === undefined) {
    const value = parseFloat(current);
    if (isNaN(value)) return '+0';
    const prefix = value > 0 ? '+' : '';
    return prefix + formatNumber(value);
  }
  
  // If both current and previous provided, calculate difference
  const diff = current - previous;
  const prefix = diff > 0 ? '+' : '';
  return prefix + formatNumber(diff);
};
const formatTimestamp = timestamp => {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString(undefined, { 
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
};
const getTimeframeLabel = timeframe => {
  const labels = {hourly: 'hour', daily: 'day', weekly: 'week', all: 'all time'};
  return labels[timeframe] || 'period';
};

// For consistency, use these helpers for showing/hiding elements
const hideElement = element => {
  if (element) element.classList.add('d-none');
};

const showElement = element => {
  if (element) element.classList.remove('d-none');
};

// Utility functions for Analytics
const hideAnalytics = () => {
  const analyticsElement = document.getElementById('score-analytics');
  if (analyticsElement) hideElement(analyticsElement);
};

const hideChanges = () => {
  const changesElement = document.getElementById('metric-changes');
  if (changesElement) hideElement(changesElement);
};

const showAnalytics = () => {
  const analyticsElement = document.getElementById('score-analytics');
  if (analyticsElement) showElement(analyticsElement);
};

const showChanges = () => {
  const changesElement = document.getElementById('metric-changes');
  if (changesElement) showElement(changesElement);
};

// Initialize dropdowns
function initDropdowns() {
  // Force fetch button initialization
  const forceFetchBtn = document.getElementById('force-fetch-btn');
  if (forceFetchBtn) forceFetchBtn.addEventListener('click', () => forceFetch(currentUserId));
  
  // Bootstrap handles dropdown toggling automatically through its JavaScript
}

// Check if there are users
async function checkUsers() {
  try {
    // Get credentials from browser authentication
    const credentials = btoa(`${localStorage.getItem('auth_username') || ''}:${localStorage.getItem('auth_password') || ''}`);
    
    const response = await fetch('/api/users', {
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    });
    
    if (response.status === 401) {
      // Show login form if unauthorized
      document.getElementById('login-form').classList.remove('d-none');
      document.getElementById('dashboard').classList.add('d-none');
      return;
    }
    
    // Check if the response is JSON before trying to parse it
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned non-JSON response. Please check server logs.');
    }
    
    const users = await response.json();
    
    const loginForm = document.getElementById('login-form');
    const dashboard = document.getElementById('dashboard');
    
    if (users.length === 0) {
      loginForm.classList.remove('d-none');
      dashboard.classList.add('d-none');
    } else {
      loginForm.classList.add('d-none');
      dashboard.classList.remove('d-none');
      loadUsers(users);
    }
  } catch (error) {
    console.error('Error checking users:', error);
    document.getElementById('login-form').classList.remove('d-none');
    document.getElementById('dashboard').classList.add('d-none');
  }
}

// Load users into dropdown
async function loadUsers(users) {
  const userList = document.getElementById('user-list');
  userList.innerHTML = '';
  
  if (users.length === 0) {
    document.getElementById('user-dropdown').textContent = 'No Users';
    return;
  }
  
  users.forEach(user => {
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'dropdown-item';
    link.href = '#';
    link.textContent = user.name;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector('#user-dropdown').textContent = user.name;
      selectUser(user.id);
    });
    
    listItem.appendChild(link);
    userList.appendChild(listItem);
  });
  
  // Select the first user by default
  selectUser(users[0].id);
  document.querySelector('#user-dropdown').textContent = users[0].name;
}

// Helper function for authenticated API requests
async function fetchWithAuth(url, options = {}) {
  const credentials = btoa(`${localStorage.getItem('auth_username') || ''}:${localStorage.getItem('auth_password') || ''}`);
  
  const authOptions = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Basic ${credentials}`
    }
  };
  
  const response = await fetch(url, authOptions);
  
  if (response.status === 401) {
    // If unauthorized, force reload to show login prompt
    setTimeout(() => window.location.reload(), 100);
    throw new Error('Authentication required');
  }
  
  return response;
}

// Select a user
async function selectUser(userId) {
  currentUserId = userId;
  
  const forceFetchBtn = document.getElementById('force-fetch-btn');
  if (forceFetchBtn) forceFetchBtn.classList.remove('d-none');
  
  const discordStatus = document.getElementById('discord-status');
  if (discordStatus) {
    discordStatus.textContent = '';
    discordStatus.className = 'ms-3 small';
  }
  
  try {
    const response = await fetchWithAuth(`/api/user/${userId}`);
    const { user, latestScore, stats } = await response.json();
    
    // Update user info
    document.getElementById('user-name').textContent = user.name;
    
    // Update photo if available
    const photoContainer = document.getElementById('user-photo-container');
    const photoElement = document.getElementById('user-photo');
    if (user.photo) {
      photoElement.src = user.photo;
      photoContainer.classList.remove('d-none');
    } else {
      photoContainer.classList.add('d-none');
    }
    
    // Update current score and rank
    const currentScore = document.getElementById('current-score');
    const currentRank = document.getElementById('current-rank');
    
    if (currentScore) currentScore.textContent = formatNumber(latestScore?.total_score || 0);
    if (currentRank && latestScore?.rank) {
      currentRank.textContent = `#${latestScore.rank}`;
    } else if (currentRank) {
      currentRank.textContent = '--';
    }
    
    // Update last updated and score cards
    document.getElementById('last-updated').textContent = `Last updated: ${formatTimestamp(latestScore?.timestamp)}`;
    updateScoreGrid(latestScore);
    
    // Update Discord settings
    document.getElementById('discord-toggle').checked = user.discord_enabled === 1;
    const webhookInput = document.getElementById('discord-webhook-url');
    if (webhookInput) webhookInput.value = user.discord_webhook_url || '';
    
    // Load chart data
    loadChartData(userId, currentTimeframe);
  } catch (error) {
    console.error('Error selecting user:', error);
  }
}

// Update score grid with latest score data
function updateScoreGrid(latestScore) {
  const metricsContainer = document.getElementById('user-metrics');
  if (!metricsContainer) return;
  
  if (!latestScore || (!latestScore.total_score && latestScore.total_score !== 0)) {
    metricsContainer.innerHTML = `
      <div class="col-12">
        <div class="alert alert-info text-center mb-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-info-circle me-2" viewBox="0 0 16 16">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
            <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
          </svg>
          No score data available. Please check your token or try refreshing.
        </div>
      </div>`;
    
    // Also hide analytics and changes sections since we have no data
    hideAnalytics();
    hideChanges();
    return;
  }
  
  // Use the metrics that were in the original version
  const metrics = [
    { name: 'TOTAL SCORE', value: latestScore.total_score || 0 },
    { name: 'GEMS', value: latestScore.gems || 0 },
    { name: 'SHELLS', value: latestScore.shells || 0 },
    { name: 'HAMMERS', value: latestScore.hammers || 0 },
    { name: 'YAT', value: latestScore.yat_holding || 0 },
    { name: 'FOLLOWERS', value: latestScore.followers || 0 }
  ];
  
  metricsContainer.innerHTML = metrics.map(metric => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="card h-100 text-center">
        <div class="card-body p-3">
          <div class="small fw-semibold text-uppercase text-muted mb-1">${metric.name}</div>
          <div class="h4 fw-bold text-primary-custom">${formatNumber(metric.value)}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// Load chart data
async function loadChartData(userId, timeframe) {
  try {
    const response = await fetchWithAuth(`/api/scores/${userId}?timeframe=${timeframe}`);
    const data = await response.json();
    
    // Show "No data" message if no datasets or empty datasets
    if (!data?.datasets?.length || data.datasets.every(ds => !ds.data?.length)) {
      const changesElement = document.getElementById('metric-changes');
      if (changesElement) {
        changesElement.innerHTML = `
          <div class="card-body">
            <div class="small fw-medium text-dark mb-2">Changes this ${getTimeframeLabel(timeframe)}:</div>
            <div class="bg-light p-3 rounded text-center text-muted">No data available for this time period</div>
          </div>
        `;
        showChanges();
      }
      
      // Create empty charts to avoid errors
      setupEmptyCharts();
      return;
    }
    
    calculateChanges(data, timeframe);
    
    const scoreCtx = document.getElementById('score-chart').getContext('2d');
    const yatCtx = document.getElementById('yat-chart').getContext('2d');
    
    if (scoreChart) scoreChart.destroy();
    if (yatChart) yatChart.destroy();
    
    // Prepare chart colors and gradients
    const chartColors = {
      totalScore: { border: 'rgb(75, 192, 192)', background: 'rgba(75, 192, 192, 0.1)' },
      yat: { border: 'rgb(54, 162, 235)', background: 'rgba(54, 162, 235, 0.1)' },
      rank: { border: 'rgb(76, 175, 80)', background: 'rgba(76, 175, 80, 0.05)' }
    };
    
    const totalScoreGradient = scoreCtx.createLinearGradient(0, 0, 0, 400);
    totalScoreGradient.addColorStop(0, 'rgba(75, 192, 192, 0.2)');
    totalScoreGradient.addColorStop(1, 'rgba(75, 192, 192, 0.01)');
    
    const yatGradient = yatCtx.createLinearGradient(0, 0, 0, 200);
    yatGradient.addColorStop(0, 'rgba(54, 162, 235, 0.2)');
    yatGradient.addColorStop(1, 'rgba(54, 162, 235, 0.01)');

    // Get raw data for timestamps and ranks
    const rawResponse = await fetchWithAuth(`/api/scores/${userId}?timeframe=${timeframe}&raw=true`);
    const rawData = await rawResponse.json();
    
    // Check if we have any valid raw data
    if (!rawData || !rawData.length) {
      setupEmptyCharts();
      return;
    }
    
    const rankData = rawData.map(entry => parseInt(entry.rank) || null);
    const timestamps = rawData.map(entry => new Date(entry.timestamp));

    // Calculate rank scale
    const validRanks = rankData.filter(rank => rank !== null);
    const minRank = validRanks.length ? Math.min(...validRanks) : 0;
    const maxRank = validRanks.length ? Math.max(...validRanks) : 100;
    const rankBuffer = Math.max(100, Math.round((maxRank - minRank) * 0.2));

    // Create Score & Rank Chart
    const scoreDatasets = [
      {
        label: "Total Score",
        data: rawData.map(d => d.total_score),
        borderColor: chartColors.totalScore.border,
        backgroundColor: totalScoreGradient,
        tension: 0.3, fill: true, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 5, yAxisID: 'y'
      }
    ];
    
    // Add rank dataset if we have valid rank data
    if (validRanks.length > 0) {
      scoreDatasets.push({
        label: "Rank",
        data: rankData,
        borderColor: chartColors.rank.border,
        backgroundColor: chartColors.rank.background,
        tension: 0.3, fill: false, borderWidth: 3,
        pointRadius: 0, pointHoverRadius: 6, hidden: false,
        yAxisID: 'y1', borderDash: [5, 5]
      });
    }
    
    // Create YAT Chart
    const yatDatasets = [
      {
        label: "YAT Holdings",
        data: rawData.map(d => d.yat_holding),
        borderColor: chartColors.yat.border,
        backgroundColor: yatGradient,
        tension: 0.3, fill: true, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 5
      }
    ];
    
    // Common chart options
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            padding: 15,
            generateLabels: function(chart) {
              const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              return original.map(label => ({
                ...label,
                text: `   ${label.text}`  // Add spaces before text
              }));
            },
            font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 11 }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          titleColor: '#333',
          bodyColor: '#666',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          bodyFont: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 12 },
          titleFont: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 13, weight: 'bold' },
          padding: 10,
          boxPadding: 4,
          callbacks: {
            title: tooltipItems => {
              if (tooltipItems[0].label && timestamps[tooltipItems[0].dataIndex]) {
                return timestamps[tooltipItems[0].dataIndex].toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                });
              }
              return tooltipItems[0].label;
            },
            label: context => {
              const label = context.dataset.label ? `${context.dataset.label}: ` : '';
              if (label.includes('Rank') && context.raw !== null) return `${label}#${context.raw}`;
              return context.raw !== null ? `${label}${formatNumber(context.raw)}` : label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(200, 200, 200, 0.1)', drawBorder: false },
          ticks: {
            maxRotation: 0,
            autoSkipPadding: 30,
            maxTicksLimit: 8,
            font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 10 },
            padding: 8,
            callback: (value, index) => {
              if (!timestamps[index]) return value;
              const date = timestamps[index];
              if (timeframe === 'hourly') {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
              } else if (timeframe === 'daily' || timeframe === 'weekly') {
                return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
              }
              return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
          }
        }
      }
    };

    // Create Score Chart
    scoreChart = new Chart(scoreCtx, {
      type: 'line',
      data: { labels: data.labels, datasets: scoreDatasets },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            grid: { color: 'rgba(200, 200, 200, 0.1)', drawBorder: false },
            ticks: {
              padding: 10,
              font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 10 },
              callback: value => formatNumber(value)
            },
            title: {
              display: true,
              text: 'Total Score',
              font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 11 }
            }
          },
          y1: validRanks.length > 0 ? {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: false,
            min: Math.max(0, minRank - rankBuffer),
            max: maxRank + rankBuffer,
            grid: { display: false },
            ticks: {
              reverse: true,
              padding: 10,
              font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 10 },
              callback: value => '#' + value
            },
            title: {
              display: true,
              text: 'Rank',
              font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 11 }
            }
          } : undefined
        }
      }
    });

    // Create YAT Chart
    yatChart = new Chart(yatCtx, {
      type: 'line',
      data: { labels: data.labels, datasets: yatDatasets },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            grid: { color: 'rgba(200, 200, 200, 0.1)', drawBorder: false },
            ticks: {
              padding: 10,
              font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 10 },
              callback: value => formatNumber(value)
            },
            title: {
              display: true,
              text: 'YAT Holdings',
              font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 11 }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error loading chart data:', error);
    setupEmptyCharts();
  }
}

// Setup empty charts when no data is available
function setupEmptyCharts() {
  const scoreCtx = document.getElementById('score-chart').getContext('2d');
  const yatCtx = document.getElementById('yat-chart').getContext('2d');
  
  if (scoreChart) scoreChart.destroy();
  if (yatChart) yatChart.destroy();
  
  // Common empty chart options
  const emptyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    },
    scales: {
      x: { display: false },
      y: { display: false }
    }
  };
  
  // Create empty score chart
  scoreChart = new Chart(scoreCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: 'rgba(200, 200, 200, 0.5)',
        backgroundColor: 'rgba(200, 200, 200, 0.1)'
      }]
    },
    options: {
      ...emptyChartOptions,
      plugins: {
        ...emptyChartOptions.plugins,
        title: {
          display: true,
          text: 'No score data available for this time period',
          color: '#6c757d',
          font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 14 }
        }
      }
    }
  });
  
  // Create empty YAT chart
  yatChart = new Chart(yatCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: 'rgba(200, 200, 200, 0.5)',
        backgroundColor: 'rgba(200, 200, 200, 0.1)'
      }]
    },
    options: {
      ...emptyChartOptions,
      plugins: {
        ...emptyChartOptions.plugins,
        title: {
          display: true,
          text: 'No YAT data available for this time period',
          color: '#6c757d',
          font: { family: "'Inter', 'Helvetica', 'Arial', sans-serif", size: 14 }
        }
      }
    }
  });
  
  // Hide analytics and changes sections
  hideAnalytics();
  hideChanges();
}

// Calculate changes based on timeframe
function calculateChanges(data, timeframe) {
  if (!data?.datasets?.length) return;
  
  const timeLabel = getTimeframeLabel(timeframe);
  const totalScoreData = data.datasets.find(ds => ds.label === "Total Score")?.data || [];
  // The backend uses "YAT" as the label
  const yatData = data.datasets.find(ds => ds.label === "YAT")?.data || [];
  const rankDataset = data.datasets.find(ds => ds.label === "Rank");
  
  // Hide changes if no data
  if (!totalScoreData.length && !yatData.length && (!rankDataset || !rankDataset.data.length)) {
    hideChanges();
    hideAnalytics();
    return;
  }
  
  // Get raw data for accurate calculations
  fetchWithAuth(`/api/scores/${currentUserId}?timeframe=${timeframe}&raw=true`)
    .then(response => response.json())
    .then(rawData => {
      const changeContainer = document.getElementById('metric-changes');
      
      // Check if we have enough data
      if (!rawData?.length || rawData.length < 2) {
        hideChanges();
        hideAnalytics();
        return;
      }
      
      // Filter valid data points - use proper field names
      const validScores = rawData.filter(score => score.total_score !== null && score.total_score !== undefined);
      const validYat = rawData.filter(score => score.yat_holding !== null && score.yat_holding !== undefined);
      const validRanks = rawData.filter(score => 
        score.rank !== null && score.rank !== undefined && score.rank !== '' && !isNaN(parseInt(score.rank)));
      
      // Always show the changes section even if some data is missing
      if (validScores.length < 2 && validYat.length < 2 && validRanks.length < 2) {
        // We still want to show the changes section with zeros
        displayChanges({
          scoreChange: 0, yatChange: 0, rankChange: 0, timeLabel,
          firstRank: null, lastRank: null,
          firstTimestamp: null, lastTimestamp: null
        });
        showAnalytics();
        return;
      }
      
      // Calculate changes
      let scoreChange = 0, firstScore = 0, lastScore = 0;
      if (validScores.length >= 2) {
        firstScore = validScores[0].total_score;
        lastScore = validScores[validScores.length - 1].total_score;
        scoreChange = lastScore - firstScore;
        calculateScorePrediction(firstScore, lastScore, timeframe);
        calculateNextMilestone(lastScore);
      }
      
      let yatChange = 0;
      if (validYat.length >= 2) {
        yatChange = validYat[validYat.length - 1].yat_holding - validYat[0].yat_holding;
      }
      
      let rankChange = 0, firstRank = 0, lastRank = 0;
      if (validRanks.length >= 2) {
        firstRank = parseInt(validRanks[0].rank);
        lastRank = parseInt(validRanks[validRanks.length - 1].rank);
        if (firstRank > 0 && lastRank > 0) rankChange = firstRank - lastRank;
      }
      
      // Display the changes
      displayChanges({
        scoreChange, yatChange, rankChange, timeLabel, firstRank, lastRank,
        firstTimestamp: validScores.length ? new Date(validScores[0].timestamp) : null,
        lastTimestamp: validScores.length ? new Date(validScores[validScores.length - 1].timestamp) : null
      });
      
      showAnalytics();
    })
    .catch(error => {
      console.error('Error calculating changes:', error);
      hideChanges();
    });
}

// Calculate and display next milestone
function calculateNextMilestone(currentScore) {
  const analyticsContainer = document.getElementById('score-analytics');
  if (!analyticsContainer) return;
  
  // Define milestones
  const milestones = [
    { value: 10000, name: "10K Score" },
    { value: 50000, name: "50K Score" },
    { value: 100000, name: "100K Score" },
    { value: 250000, name: "250K Score" },
    { value: 500000, name: "500K Score" },
    { value: 1000000, name: "1M Score" },
    { value: 2000000, name: "2M Score" },
    { value: 5000000, name: "5M Score" },
    { value: 10000000, name: "10M Score" }
  ];
  
  // Find next milestone
  const nextMilestone = milestones.find(m => currentScore < m.value);
  const milestoneText = document.getElementById('milestone-text');
  const milestoneProgress = document.getElementById('milestone-progress');
  const milestoneProgressBar = document.getElementById('milestone-progress-bar');
  
  if (!nextMilestone) {
    milestoneText.textContent = "All milestones achieved!";
    milestoneProgress.textContent = "";
    milestoneProgressBar.style.width = "100%";
  } else {
    // Calculate progress percentage
    const previousMilestoneValue = milestones[milestones.indexOf(nextMilestone) - 1]?.value || 0;
    const progressRange = nextMilestone.value - previousMilestoneValue;
    const currentProgress = currentScore - previousMilestoneValue;
    const progressPercentage = Math.min(100, Math.max(0, (currentProgress / progressRange) * 100));
    
    milestoneText.textContent = nextMilestone.name;
    milestoneProgress.textContent = `${formatNumber(currentScore)} / ${formatNumber(nextMilestone.value)}`;
    milestoneProgressBar.style.width = `${progressPercentage}%`;
  }
  
  showAnalytics();
}

// Calculate and display score predictions
function calculateScorePrediction(firstScore, lastScore, timeframe) {
  const prediction7Days = document.getElementById('prediction-7days');
  const prediction30Days = document.getElementById('prediction-30days');
  if (!prediction7Days || !prediction30Days) return;
  
  fetch(`/api/scores/${currentUserId}?timeframe=${timeframe}&raw=true`)
    .then(response => response.json())
    .then(rawData => {
      if (!rawData?.length || rawData.length < 2) {
        prediction7Days.textContent = "Insufficient data for prediction";
        prediction30Days.textContent = "Insufficient data for prediction";
        return;
      }
      
      // Filter valid entries and sort by timestamp
      const validEntries = rawData
        .filter(entry => entry.total_score !== null && entry.total_score !== undefined && entry.timestamp)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      if (validEntries.length < 2) {
        prediction7Days.textContent = "Insufficient data for prediction";
        prediction30Days.textContent = "Insufficient data for prediction";
        return;
      }
      
      // Calculate growth rate
      const firstEntry = validEntries[0];
      const lastEntry = validEntries[validEntries.length - 1];
      const timeDiffMs = new Date(lastEntry.timestamp) - new Date(firstEntry.timestamp);
      const daysBetween = timeDiffMs / (1000 * 60 * 60 * 24);
      
      if (daysBetween <= 0.01) {
        prediction7Days.textContent = "Insufficient time range for prediction";
        prediction30Days.textContent = "Insufficient time range for prediction";
        return;
      }
      
      const scoreDiff = lastEntry.total_score - firstEntry.total_score;
      const dailyGrowthRate = scoreDiff / daysBetween;
      
      if (dailyGrowthRate <= 0) {
        prediction7Days.textContent = "No growth detected in this period";
        prediction30Days.textContent = "No growth detected in this period";
        return;
      }
      
      // Calculate and display predictions
      const currentScore = lastEntry.total_score;
      const predicted7DayScore = currentScore + (dailyGrowthRate * 7);
      const predicted30DayScore = currentScore + (dailyGrowthRate * 30);
      
      prediction7Days.textContent = `In 7 days: ~${formatNumber(Math.round(predicted7DayScore))} points`;
      prediction30Days.textContent = `In 30 days: ~${formatNumber(Math.round(predicted30DayScore))} points`;
    })
    .catch(error => {
      console.error('Error calculating predictions:', error);
      prediction7Days.textContent = "Error calculating prediction";
      prediction30Days.textContent = "Error calculating prediction";
    });
}

// Display changes in metrics between timeframes
function displayChanges({ scoreChange, yatChange, rankChange, timeLabel, firstRank, lastRank, firstTimestamp, lastTimestamp }) {
  const changeContainer = document.getElementById('metric-changes');
  if (!changeContainer) return;
  
  const timeframeHeader = `Changes ${timeLabel}`;
  
  // Format changes for display
  const formatChangeDisplay = (change, isRank = false) => {
    // Always show the actual change value, don't hide small changes
    const formattedChange = formatChange(isRank ? -change : change);
    const displayClass = change > 0 ? 'text-success' : (change < 0 ? 'text-danger' : 'text-muted');
    
    // Calculate hourly rate for score and YAT if possible
    let rateHtml = '';
    if (!isRank && change !== 0 && firstTimestamp && lastTimestamp) {
      const hours = (new Date(lastTimestamp) - new Date(firstTimestamp)) / (1000 * 60 * 60);
      if (hours > 0) {
        const hourlyRate = (change / hours).toFixed(1);
        const formattedRate = formatNumber(hourlyRate);
        rateHtml = `<span class="small text-muted ms-2">(${formattedRate}/hr)</span>`;
      }
    }
    
    // Add rank context if available
    const rankContext = isRank && firstRank && lastRank ? 
      `<span class="small text-muted ms-2">(#${firstRank} → #${lastRank})</span>` : '';
    
    return { formattedChange, displayClass, rateHtml, rankContext };
  };
  
  // Format our display data
  const scoreDisplay = formatChangeDisplay(scoreChange);
  const yatDisplay = formatChangeDisplay(yatChange);
  const rankDisplay = formatChangeDisplay(rankChange, true);
  
  // Build the HTML
  changeContainer.innerHTML = `
    <div class="card-body">
      <div class="small fw-medium text-dark mb-2">${timeframeHeader}:</div>
      <div class="row g-3">
        <div class="col-md-4">
          <div class="bg-light p-3 rounded">
            <div class="small fw-semibold text-uppercase text-muted mb-1">TOTAL SCORE</div>
            <div class="d-flex align-items-center ${scoreDisplay.displayClass} fw-medium">
              ${scoreDisplay.formattedChange}${scoreDisplay.rateHtml}
            </div>
          </div>
        </div>
        
        <div class="col-md-4">
          <div class="bg-light p-3 rounded">
            <div class="small fw-semibold text-uppercase text-muted mb-1">YAT</div>
            <div class="d-flex align-items-center ${yatDisplay.displayClass} fw-medium">
              ${yatDisplay.formattedChange}${yatDisplay.rateHtml}
            </div>
          </div>
        </div>
        
        <div class="col-md-4">
          <div class="bg-light p-3 rounded">
            <div class="small fw-semibold text-uppercase text-muted mb-1">RANK</div>
            <div class="d-flex align-items-center ${rankDisplay.displayClass} fw-medium">
              ${rankDisplay.formattedChange}${rankDisplay.rankContext}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  showChanges();
}

// Token submission
async function submitToken() {
  const token = document.getElementById('token-input').value.trim();
  const errorElement = document.getElementById('token-error');
  
  if (!token) {
    errorElement.textContent = 'Please enter a token';
    errorElement.classList.remove('d-none');
    return;
  }
  
  try {
    const response = await fetch('/api/init', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ token })
    });
    
    const result = await response.json();
    
    if (result.success) {
      window.location.reload();
    } else {
      errorElement.textContent = result.error || 'Failed to add user';
      errorElement.classList.remove('d-none');
    }
  } catch (error) {
    console.error('Error adding user:', error);
    errorElement.textContent = 'An error occurred. Please try again.';
    errorElement.classList.remove('d-none');
  }
}

// Set up timeframe buttons
function setupTimeframeButtons() {
  const timeframeButtons = document.querySelectorAll('#timeframe-buttons button');
  
  timeframeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      timeframeButtons.forEach(button => {
        button.classList.remove('btn-primary');
        button.classList.add('btn-outline-primary');
      });
      
      btn.classList.remove('btn-outline-primary');
      btn.classList.add('btn-primary');
      
      const timeframe = btn.getAttribute('data-timeframe');
      currentTimeframe = timeframe;
      
      if (currentUserId) {
        loadChartData(currentUserId, timeframe);
        
        // Show loading indicator in changes section
        const changesContainer = document.getElementById('metric-changes');
        if (changesContainer) {
          changesContainer.innerHTML = `
            <div class="small fw-medium text-dark mb-2">Changes this ${getTimeframeLabel(timeframe)}:</div>
            <div class="d-flex justify-content-center align-items-center py-4">
              <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
              <span class="ms-2 text-muted small">Calculating changes...</span>
            </div>
          `;
          showChanges();
        }
      }
    });
  });
}

// Setup Discord notification features
function setupDiscordFeatures() {
  const discordToggle = document.getElementById('discord-toggle');
  const saveWebhookBtn = document.getElementById('save-webhook-url');
  const sendDiscordNowBtn = document.getElementById('send-discord-now');
  const webhookInput = document.getElementById('discord-webhook-url');
  const discordStatus = document.getElementById('discord-status');
  
  if (!discordToggle || !saveWebhookBtn || !sendDiscordNowBtn || !webhookInput) return;
  
  discordToggle.addEventListener('change', async () => {
    if (!currentUserId) return;
    
    try {
      const response = await fetchWithAuth(`/api/settings/${currentUserId}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({discord_enabled: discordToggle.checked})
      });
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to update Discord settings');
      
      discordStatus.textContent = 'Settings saved';
      discordStatus.className = 'ms-3 small text-success';
      setTimeout(() => { discordStatus.textContent = ''; }, 3000);
    } catch (error) {
      console.error('Error updating Discord settings:', error);
      discordStatus.textContent = 'Error: ' + error.message;
      discordStatus.className = 'ms-3 small text-danger';
    }
  });
  
  saveWebhookBtn.addEventListener('click', async () => {
    if (!currentUserId) return;
    
    const webhook = webhookInput.value.trim();
    
    try {
      // Simple validation
      if (webhook && !webhook.includes('discord.com/api/webhooks')) {
        throw new Error('Invalid Discord webhook URL');
      }
      
      const response = await fetchWithAuth(`/api/settings/${currentUserId}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({discord_webhook_url: webhook})
      });
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to save webhook URL');
      
      discordStatus.textContent = 'Webhook URL saved';
      discordStatus.className = 'ms-3 small text-success';
      setTimeout(() => { discordStatus.textContent = ''; }, 3000);
    } catch (error) {
      console.error('Error saving webhook URL:', error);
      discordStatus.textContent = 'Error: ' + error.message;
      discordStatus.className = 'ms-3 small text-danger';
    }
  });
  
  sendDiscordNowBtn.addEventListener('click', async () => {
    if (!currentUserId) return;
    
    discordStatus.textContent = 'Sending...';
    discordStatus.className = 'ms-3 small text-info';
    
    try {
      const response = await fetchWithAuth(`/api/send-discord-notification/${currentUserId}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'}
      });
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to send notification');
      
      discordStatus.textContent = 'Notification sent!';
      discordStatus.className = 'ms-3 small text-success';
      setTimeout(() => { discordStatus.textContent = ''; }, 3000);
    } catch (error) {
      console.error('Error sending Discord notification:', error);
      discordStatus.textContent = 'Error: ' + error.message;
      discordStatus.className = 'ms-3 small text-danger';
    }
  });
}

// Initialize modal functionality
function setupTokenModal() {
  const modal = document.getElementById('add-token-modal');
  const addTokenBtn = document.getElementById('add-token-btn');
  const closeModalBtn = document.getElementById('close-modal');
  
  addTokenBtn?.addEventListener('click', () => {
    // For Bootstrap, we use the show() method from the Modal API
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    document.getElementById('new-token-error').classList.add('d-none');
    document.getElementById('new-token-input').value = '';
  });
  
  // Bootstrap handles hiding the modal with data-bs-dismiss="modal"
  
  // Add event listener to Add button
  document.getElementById('add-new-token')?.addEventListener('click', addNewToken);
}

// Add a new token
async function addNewToken() {
  const newTokenInput = document.getElementById('new-token-input');
  const errorElement = document.getElementById('new-token-error');
  const token = newTokenInput?.value?.trim();
  
  if (!token) {
    errorElement.textContent = 'Please enter a token';
    errorElement.classList.remove('d-none');
    return;
  }
  
  try {
    // Use the correct API endpoint for adding tokens
    const response = await fetch('/api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    
    // Check if the response is JSON before trying to parse it
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned non-JSON response. Please check server logs.');
    }
    
    const result = await response.json();
    
    if (result.success) {
      // Close modal and refresh users
      const modal = document.getElementById('add-token-modal');
      const bootstrapModal = bootstrap.Modal.getInstance(modal);
      if (bootstrapModal) bootstrapModal.hide();
      
      // Refresh user list
      checkUsers();
      
      if (result.user?.id) {
        selectUser(result.user.id);
        document.querySelector('#user-dropdown').textContent = result.user.name;
      }
    } else {
      errorElement.textContent = result.error || 'Failed to add user';
      errorElement.classList.remove('d-none');
    }
  } catch (error) {
    console.error('Error adding token:', error);
    errorElement.textContent = 'An error occurred. Please try again.';
    errorElement.classList.remove('d-none');
  }
}

// Force fetch data for a specific user
function forceFetch(userId) {
  if (!userId) return;
  
  const forceFetchBtn = document.getElementById('force-fetch-btn');
  forceFetchBtn.disabled = true;
  forceFetchBtn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
    Fetching...
  `;
  
  fetchWithAuth(`/api/force-fetch/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) selectUser(userId);
      resetForceFetchButton(forceFetchBtn);
    })
    .catch(error => {
      console.error('Error force fetching data:', error);
      resetForceFetchButton(forceFetchBtn);
    });
}

// Reset force fetch button to initial state
function resetForceFetchButton(button) {
  button.disabled = false;
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-repeat me-1" viewBox="0 0 16 16">
      <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
      <path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
    </svg>
    <span>Refresh</span>
  `;
}

// Auto-refresh functionality
function setupAutoRefresh() {
  setInterval(() => {
    if (currentUserId) {
      fetch(`/api/user/${currentUserId}`)
        .then(response => response.json())
        .then(data => {
          const lastUpdatedText = document.getElementById('last-updated').textContent;
          const currentTimestamp = lastUpdatedText.replace('Last updated: ', '');
          const newTimestamp = formatTimestamp(data.latestScore?.timestamp);
          
          if (currentTimestamp !== newTimestamp) selectUser(currentUserId);
        })
        .catch(error => console.error('Error checking for updates:', error));
    }
  }, 60 * 1000); // Check every minute
}

// Set up user token management
function setupTokenManagement() {
  const deleteTokenBtn = document.getElementById('delete-token');
  
  if (deleteTokenBtn) {
    deleteTokenBtn.addEventListener('click', async () => {
      if (!currentUserId) return;
      
      if (!confirm('Are you sure you want to delete this token? This cannot be undone.')) {
        return;
      }
      
      deleteTokenBtn.disabled = true;
      deleteTokenBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        Deleting...
      `;
      
      try {
        const response = await fetchWithAuth(`/api/user/${currentUserId}/delete`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'}
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to delete token');
        
        // Reload page on success
        window.location.reload();
      } catch (error) {
        console.error('Error deleting token:', error);
        alert('Error: ' + error.message);
        resetDeleteButton(deleteTokenBtn);
      }
    });
  }
}

// Reset delete button state
function resetDeleteButton(button) {
  button.disabled = false;
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>Delete Token
  `;
}

// Document ready handler with all initialization
document.addEventListener('DOMContentLoaded', function() {
  initDropdowns();
  checkUsers();
  setupTimeframeButtons();
  setupDiscordFeatures();
  setupTokenModal();
  setupTokenManagement();
  setupAutoRefresh();
  
  document.getElementById('token-submit')?.addEventListener('click', submitToken);
  document.getElementById('token-input')?.addEventListener('keypress', e => e.key === 'Enter' && submitToken());
}); 