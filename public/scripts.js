// Global variables
let scoreChart = null, yatChart = null, currentUserId = null, currentTimeframe = 'all';

// Helper functions
const formatNumber = value => value === undefined || value === null ? '0' : Number(value).toLocaleString();
const formatChange = (current, previous) => {
  if (previous === 0 || previous === null || previous === undefined) return '+0';
  const change = current - previous;
  return `${change >= 0 ? '+' : ''}${formatNumber(change)}`;
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

// Initialize dropdowns
function initDropdowns() {
  const dropdown = document.getElementById('dropdown-container');
  if (dropdown) {
    const toggle = dropdown.querySelector('#user-dropdown');
    const menu = dropdown.querySelector('#user-list');
    
    if (toggle && menu) {
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        menu.classList.toggle('hidden');
      });
      document.addEventListener('click', e => !dropdown.contains(e.target) && menu.classList.add('hidden'));
    }
  }
  
  const forceFetchBtn = document.getElementById('force-fetch-btn');
  if (forceFetchBtn) forceFetchBtn.addEventListener('click', () => forceFetch(currentUserId));
}

// Check if there are users
async function checkUsers() {
  try {
    const response = await fetch('/api/users');
    const users = await response.json();
    
    const loginForm = document.getElementById('login-form');
    const dashboard = document.getElementById('dashboard');
    
    if (users.length === 0) {
      loginForm.classList.remove('hidden');
      dashboard.classList.add('hidden');
    } else {
      loginForm.classList.add('hidden');
      dashboard.classList.remove('hidden');
      loadUsers(users);
    }
  } catch (error) {
    console.error('Error checking users:', error);
    document.getElementById('login-form').classList.remove('hidden');
    
    if (error.message?.includes('401')) {
      setTimeout(() => window.location.reload(), 1000);
    }
  }
}

// Load users into dropdown
function loadUsers(users) {
  const userList = document.getElementById('user-list');
  userList.innerHTML = '';
  
  users.forEach(user => {
    const item = document.createElement('a');
    item.href = '#';
    item.className = 'block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100';
    item.setAttribute('data-user-id', user.id);
    item.textContent = user.name;
    item.addEventListener('click', e => {
      e.preventDefault();
      selectUser(user.id);
      document.querySelector('#user-dropdown span').textContent = user.name;
      document.querySelector('#user-list').classList.add('hidden');
    });
    userList.appendChild(item);
  });
  
  if (users.length > 0) {
    selectUser(users[0].id);
    document.querySelector('#user-dropdown span').textContent = users[0].name;
  }
}

// Select a user
async function selectUser(userId) {
  currentUserId = userId;
  
  const forceFetchBtn = document.getElementById('force-fetch-btn');
  if (forceFetchBtn) forceFetchBtn.classList.remove('hidden');
  
  const discordStatus = document.getElementById('discord-status');
  if (discordStatus) {
    discordStatus.textContent = '';
    discordStatus.className = 'ml-3 text-sm';
  }
  
  try {
    const response = await fetch(`/api/user/${userId}`);
    const { user, latestScore, stats } = await response.json();
    
    // Update user info
    document.getElementById('user-name').textContent = user.name;
    
    // Update photo if available
    const photoContainer = document.getElementById('user-photo-container');
    const photoElement = document.getElementById('user-photo');
    if (user.photo) {
      photoElement.src = user.photo;
      photoContainer.classList.remove('hidden');
    } else {
      photoContainer.classList.add('hidden');
    }
    
    // Update rank if available
    const rankElement = document.getElementById('user-rank');
    if (latestScore?.rank) {
      rankElement.textContent = `Rank #${latestScore.rank}`;
      rankElement.classList.remove('hidden');
    } else {
      rankElement.classList.add('hidden');
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
  const scoreGrid = document.getElementById('score-grid');
  
  if (!latestScore) {
    scoreGrid.innerHTML = `<div class="col-span-full p-4 bg-blue-50 text-blue-700 rounded-md border border-blue-200">No score data available</div>`;
    return;
  }
  
  const metrics = [
    { name: 'Total Score', value: latestScore.total_score },
    { name: 'Gems', value: latestScore.gems },
    { name: 'Shells', value: latestScore.shells },
    { name: 'Hammers', value: latestScore.hammers },
    { name: 'YAT', value: latestScore.yat_holding },
    { name: 'Followers', value: latestScore.followers }
  ];
  
  scoreGrid.innerHTML = metrics.map(metric => `
    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-center">
      <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">${metric.name}</div>
      <div class="text-2xl font-bold text-primary">${formatNumber(metric.value)}</div>
    </div>
  `).join('');
}

// Load chart data
async function loadChartData(userId, timeframe) {
  try {
    const response = await fetch(`/api/scores/${userId}?timeframe=${timeframe}`);
    const data = await response.json();
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
    const rawResponse = await fetch(`/api/scores/${userId}?timeframe=${timeframe}&raw=true`);
    const rawData = await rawResponse.json();
    
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
  }
}

// Calculate changes based on timeframe
function calculateChanges(data, timeframe) {
  if (!data?.datasets?.length) return;
  
  const timeLabel = getTimeframeLabel(timeframe);
  const totalScoreData = data.datasets.find(ds => ds.label === "Total Score")?.data || [];
  const yatData = data.datasets.find(ds => ds.label === "YAT")?.data || [];
  const rankDataset = data.datasets.find(ds => ds.label === "Rank");
  
  // Hide changes if no data
  if (!totalScoreData.length && !yatData.length && (!rankDataset || !rankDataset.data.length)) {
    document.getElementById('metric-changes')?.classList.add('hidden');
    hideAnalytics();
    return;
  }
  
  // Get raw data for accurate calculations
  fetch(`/api/scores/${currentUserId}?timeframe=${timeframe}&raw=true`)
    .then(response => response.json())
    .then(rawData => {
      const changeContainer = document.getElementById('metric-changes');
      
      // Check if we have enough data
      if (!rawData?.length || rawData.length < 2) {
        changeContainer?.classList.add('hidden');
        hideAnalytics();
        return;
      }
      
      // Filter valid data points
      const validScores = rawData.filter(score => score.total_score !== null && score.total_score !== undefined);
      const validYat = rawData.filter(score => score.yat_holding !== null && score.yat_holding !== undefined);
      const validRanks = rawData.filter(score => 
        score.rank !== null && score.rank !== undefined && score.rank !== '' && !isNaN(parseInt(score.rank)));
      
      if (validScores.length < 2 && validYat.length < 2 && validRanks.length < 2) {
        changeContainer?.classList.add('hidden');
        hideAnalytics();
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
      
      displayChanges({
        scoreChange, yatChange, rankChange, timeLabel, firstRank, lastRank,
        firstTimestamp: validScores.length ? new Date(validScores[0].timestamp) : null,
        lastTimestamp: validScores.length ? new Date(validScores[validScores.length - 1].timestamp) : null
      });
      
      document.getElementById('score-analytics')?.classList.remove('hidden');
    })
    .catch(error => {
      console.error('Error fetching raw data for changes:', error);
      document.getElementById('metric-changes')?.classList.add('hidden');
      hideAnalytics();
    });
}

// Hide analytics section
const hideAnalytics = () => document.getElementById('score-analytics')?.classList.add('hidden');

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
  
  analyticsContainer.classList.remove('hidden');
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

// Display changes in the UI
function displayChanges({ scoreChange, yatChange, rankChange, timeLabel, firstRank, lastRank, firstTimestamp, lastTimestamp }) {
  const changeContainer = document.getElementById('metric-changes');
  if (!changeContainer) return;
  
  // Calculate time period and header format
  let periodHours = 1, actualTimeElapsed = null;
  
  if (firstTimestamp && lastTimestamp) {
    actualTimeElapsed = (lastTimestamp - firstTimestamp) / (1000 * 60 * 60);
    periodHours = actualTimeElapsed;
  } else {
    const hoursByTimeframe = {hour: 1, day: 24, week: 168, 'all time': 0};
    periodHours = hoursByTimeframe[timeLabel] || 1;
  }
  
  // Format timeframe header
  const timeframeHeaders = {
    hour: 'Past Hour Changes',
    day: 'Past 7 Days Changes',
    week: 'Past 4 Weeks Changes',
    'all time': 'All Time Changes'
  };
  let timeframeHeader = timeframeHeaders[timeLabel] || `Changes (${timeLabel})`;
  
  // Add actual time if available
  if (actualTimeElapsed !== null && timeLabel !== 'all time') {
    const actualDays = Math.floor(actualTimeElapsed / 24);
    const actualHours = Math.round(actualTimeElapsed % 24);
    if (actualDays > 0 || actualHours > 0) {
      timeframeHeader += ` (${actualDays > 0 ? `${actualDays}d ` : ''}${actualHours > 0 ? `${actualHours}h` : ''})`;
    }
  }
  
  // If no changes, show simple message
  if (scoreChange === 0 && yatChange === 0 && rankChange === 0) {
    changeContainer.innerHTML = `
      <div class="text-sm font-medium text-gray-700 mb-2">${timeframeHeader}:</div>
      <div class="bg-gray-50 p-3 rounded-md text-center text-gray-500">No changes detected in this time period</div>
    `;
    changeContainer.classList.remove('hidden');
    return;
  }
  
  // Format changes
  const formatChangeDisplay = (change, isRank = false) => {
    const prefix = change > 0 ? '+' : '';
    const displayClass = change > 0 ? 'text-green-600' : (change < 0 ? 'text-red-600' : 'text-gray-500');
    const icon = change > 0 ? '↑' : (change < 0 ? '↓' : '─');
    
    // Calculate rate if applicable (not for rank)
    let rateHtml = '';
    if (!isRank && periodHours > 0 && change !== 0) {
      const rate = Math.abs(change) / periodHours;
      const formattedRate = rate >= 10 ? Math.round(rate) : rate.toFixed(1);
      rateHtml = `<span class="text-xs text-gray-500 ml-2">(${formattedRate}/hr)</span>`;
    }
    
    // Add rank comparison for rank changes
    const rankCompare = isRank && firstRank && lastRank ? 
      `<span class="text-xs text-gray-500 ml-2">(#${firstRank} → #${lastRank})</span>` : '';
      
    return { displayClass, icon, prefix, rateHtml, rankCompare };
  };
  
  const scoreDisplay = formatChangeDisplay(scoreChange);
  const yatDisplay = formatChangeDisplay(yatChange);
  const rankDisplay = formatChangeDisplay(rankChange, true);
  
  // Create the change cards
  changeContainer.innerHTML = `
    <div class="text-sm font-medium text-gray-700 mb-2">${timeframeHeader}:</div>
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-gray-50 p-3 rounded-md">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Total Score</div>
        <div class="flex items-center ${scoreDisplay.displayClass} font-medium text-base">
          <span class="mr-1">${scoreDisplay.icon}</span>
          <span>${scoreDisplay.prefix}${formatNumber(scoreChange)}</span>
          ${scoreDisplay.rateHtml}
        </div>
      </div>
      <div class="bg-gray-50 p-3 rounded-md">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">YAT</div>
        <div class="flex items-center ${yatDisplay.displayClass} font-medium text-base">
          <span class="mr-1">${yatDisplay.icon}</span>
          <span>${yatDisplay.prefix}${formatNumber(yatChange)}</span>
          ${yatDisplay.rateHtml}
        </div>
      </div>
      <div class="bg-gray-50 p-3 rounded-md">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Rank</div>
        <div class="flex items-center ${rankDisplay.displayClass} font-medium text-base">
          <span class="mr-1">${rankDisplay.icon}</span>
          <span>${rankDisplay.prefix}${Math.abs(rankChange)}</span>
          ${rankDisplay.rankCompare}
        </div>
      </div>
    </div>
  `;
  
  // Show with fade-in effect
  changeContainer.classList.remove('hidden');
  changeContainer.style.opacity = '0';
  changeContainer.style.transition = 'opacity 0.3s ease-in-out';
  setTimeout(() => changeContainer.style.opacity = '1', 10);
}

// Token submission
async function submitToken() {
  const token = document.getElementById('token-input').value.trim();
  const errorElement = document.getElementById('token-error');
  
  if (!token) {
    errorElement.textContent = 'Please enter a token';
    errorElement.classList.remove('hidden');
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
      errorElement.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error adding user:', error);
    errorElement.textContent = 'An error occurred. Please try again.';
    errorElement.classList.remove('hidden');
  }
}

// Set up timeframe buttons
function setupTimeframeButtons() {
  document.querySelectorAll('#timeframe-buttons button').forEach(button => {
    button.addEventListener('click', () => {
      const timeframe = button.getAttribute('data-timeframe');
      
      // Update active button styling
      document.querySelectorAll('#timeframe-buttons button').forEach(btn => {
        btn.classList.remove('bg-primary', 'text-white');
        btn.classList.add('bg-white', 'text-primary', 'border', 'border-primary');
      });
      button.classList.remove('bg-white', 'text-primary', 'border', 'border-primary');
      button.classList.add('bg-primary', 'text-white');
      
      // Show loading indicator
      const changesContainer = document.getElementById('metric-changes');
      if (changesContainer) {
        changesContainer.innerHTML = `
          <div class="text-sm font-medium text-gray-700 mb-2">Changes this ${getTimeframeLabel(timeframe)}:</div>
          <div class="flex justify-center items-center py-4">
            <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            <span class="ml-2 text-gray-600 text-sm">Calculating changes...</span>
          </div>
        `;
        changesContainer.classList.remove('hidden');
      }
      
      // Update data
      currentTimeframe = timeframe;
      loadChartData(currentUserId, timeframe);
    });
  });
}

// Set up Discord notification features
function setupDiscordFeatures() {
  const toggle = document.getElementById('discord-toggle');
  const discordStatus = document.getElementById('discord-status');
  
  // Handle toggle change
  toggle?.addEventListener('change', async (e) => {
    if (!currentUserId) return;
    const enabled = e.target.checked;
    
    if (discordStatus) {
      discordStatus.textContent = '';
      discordStatus.className = 'ml-3 text-sm';
    }
    
    try {
      await fetch(`/api/settings/${currentUserId}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ discord_enabled: enabled })
      });
      
      if (discordStatus) {
        discordStatus.textContent = enabled ? 'Discord notifications enabled' : 'Discord notifications disabled';
        discordStatus.className = 'ml-3 text-sm text-green-600';
        setTimeout(() => discordStatus.textContent = '', 3000);
      }
    } catch (error) {
      console.error('Error updating Discord setting:', error);
      e.target.checked = !enabled;
      
      if (discordStatus) {
        discordStatus.textContent = 'Failed to update setting';
        discordStatus.className = 'ml-3 text-sm text-red-600';
      }
    }
  });
  
  // Handle webhook URL saving
  const webhookInput = document.getElementById('discord-webhook-url');
  const saveWebhookBtn = document.getElementById('save-webhook-url');
  
  if (webhookInput && saveWebhookBtn && discordStatus) {
    saveWebhookBtn.addEventListener('click', async () => {
      if (!currentUserId) return;
      const webhookUrl = webhookInput.value.trim();
      
      // Show loading state
      saveWebhookBtn.disabled = true;
      saveWebhookBtn.textContent = 'Saving...';
      saveWebhookBtn.classList.add('opacity-70');
      discordStatus.textContent = '';
      discordStatus.className = 'ml-3 text-sm';
      
      // Validate URL
      if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        discordStatus.textContent = 'Please enter a valid Discord webhook URL';
        discordStatus.className = 'ml-3 text-sm text-red-600';
        saveWebhookBtn.disabled = false;
        saveWebhookBtn.textContent = 'Save';
        saveWebhookBtn.classList.remove('opacity-70');
        return;
      }
      
      try {
        await fetch(`/api/settings/${currentUserId}`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ discord_webhook_url: webhookUrl })
        });
        
        discordStatus.textContent = 'Webhook URL saved successfully!';
        discordStatus.className = 'ml-3 text-sm text-green-600';
        setTimeout(() => discordStatus.textContent = '', 3000);
      } catch (error) {
        console.error('Error saving webhook URL:', error);
        discordStatus.textContent = 'Failed to save webhook URL';
        discordStatus.className = 'ml-3 text-sm text-red-600';
      } finally {
        saveWebhookBtn.disabled = false;
        saveWebhookBtn.textContent = 'Save';
        saveWebhookBtn.classList.remove('opacity-70');
      }
    });
  }
  
  // Handle manual notification sending
  const sendDiscordButton = document.getElementById('send-discord-now');
  
  if (sendDiscordButton && discordStatus) {
    sendDiscordButton.addEventListener('click', async () => {
      if (!currentUserId) return;
      
      sendDiscordButton.disabled = true;
      sendDiscordButton.classList.add('opacity-70');
      sendDiscordButton.innerHTML = `
        <svg class="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>Sending...
      `;
      discordStatus.textContent = '';
      discordStatus.className = 'ml-3 text-sm';
      
      try {
        const response = await fetch(`/api/send-discord-notification/${currentUserId}`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'}
        });
        
        const result = await response.json();
        
        if (result.success) {
          discordStatus.textContent = 'Notification sent successfully!';
          discordStatus.className = 'ml-3 text-sm text-green-600';
          setTimeout(() => discordStatus.textContent = '', 5000);
        } else {
          discordStatus.textContent = result.error || 'Failed to send notification';
          discordStatus.className = 'ml-3 text-sm text-red-600';
        }
      } catch (error) {
        console.error('Error sending Discord notification:', error);
        discordStatus.textContent = 'Error: Failed to send notification';
        discordStatus.className = 'ml-3 text-sm text-red-600';
      } finally {
        sendDiscordButton.disabled = false;
        sendDiscordButton.classList.remove('opacity-70');
        sendDiscordButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>Send Discord Now
        `;
      }
    });
  }
}

// Token modal functionality
function setupTokenModal() {
  const addTokenBtn = document.getElementById('add-token-btn');
  const closeModalBtn = document.getElementById('close-modal');
  const modal = document.getElementById('add-token-modal');
  const addNewTokenBtn = document.getElementById('add-new-token');
  
  if (addTokenBtn && modal) {
    addTokenBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      document.getElementById('new-token-input').value = '';
      document.getElementById('new-token-error').classList.add('hidden');
    });
    
    closeModalBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
    
    addNewTokenBtn?.addEventListener('click', addNewToken);
  }
}

// Add a new token
async function addNewToken() {
  const tokenInput = document.getElementById('new-token-input');
  const errorElement = document.getElementById('new-token-error');
  const modal = document.getElementById('add-token-modal');
  const token = tokenInput.value.trim();
  
  if (!token) {
    errorElement.textContent = 'Please enter a token';
    errorElement.classList.remove('hidden');
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
      modal.classList.add('hidden');
      
      const usersResponse = await fetch('/api/users');
      const users = await usersResponse.json();
      loadUsers(users);
      
      if (result.user?.id) {
        selectUser(result.user.id);
        document.querySelector('#user-dropdown span').textContent = result.user.name;
      }
    } else {
      errorElement.textContent = result.error || 'Failed to add user';
      errorElement.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error adding token:', error);
    errorElement.textContent = 'An error occurred. Please try again.';
    errorElement.classList.remove('hidden');
  }
}

// Force fetch data for a specific user
function forceFetch(userId) {
  if (!userId) return;
  
  const forceFetchBtn = document.getElementById('force-fetch-btn');
  forceFetchBtn.disabled = true;
  forceFetchBtn.classList.add('opacity-50');
  forceFetchBtn.innerHTML = `
    <svg class="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg><span>Refreshing...</span>
  `;
  
  fetch(`/api/force-fetch/${userId}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'}
  })
  .then(response => response.json())
  .then(data => {
    resetForceFetchButton(forceFetchBtn);
    if (data.success) selectUser(userId);
    else console.error('Failed to force fetch:', data.error);
  })
  .catch(error => {
    console.error('Error during force fetch:', error);
    resetForceFetchButton(forceFetchBtn);
  });
}

// Reset force fetch button state
function resetForceFetchButton(button) {
  button.disabled = false;
  button.classList.remove('opacity-50');
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
    </svg><span>Refresh</span>
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
      
      // Show confirmation dialog
      if (!confirm('Are you sure you want to delete this token? You will need to add it again to continue monitoring this user.')) {
        return;
      }
      
      // Show loading state
      deleteTokenBtn.disabled = true;
      deleteTokenBtn.classList.add('opacity-70');
      deleteTokenBtn.innerHTML = `
        <svg class="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>Deleting...
      `;
      
      try {
        const response = await fetch(`/api/user/${currentUserId}/delete`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'}
        });
        
        const result = await response.json();
        
        if (result.success) {
          alert('Token deleted successfully. You will now be redirected to the login page.');
          // Reload the page to show the login form
          window.location.reload();
        } else {
          alert(`Failed to delete token: ${result.error || 'Unknown error'}`);
          resetDeleteButton(deleteTokenBtn);
        }
      } catch (error) {
        console.error('Error deleting token:', error);
        alert('Error deleting token. Please try again.');
        resetDeleteButton(deleteTokenBtn);
      }
    });
  }
}

// Reset delete button state
function resetDeleteButton(button) {
  button.disabled = false;
  button.classList.remove('opacity-70');
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