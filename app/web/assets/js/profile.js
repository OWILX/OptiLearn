import { client } from './supabase.js';  // adjust path if needed

// ---------- Fetch user data ----------
async function loadUserProfile() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Basic info
  document.getElementById('userName').textContent = user.user_metadata?.full_name || 'Student';
  document.getElementById('userEmail').textContent = user.email;
  // If you have a custom avatar URL in metadata, set it:
  if (user.user_metadata?.avatar_url) {
    document.getElementById('avatarImg').src = user.user_metadata.avatar_url;
    document.getElementById('profileAvatar').src = user.user_metadata.avatar_url;
  }

  // Set dummy stats (replace with real data from your database later)
  document.getElementById('targetScore').textContent = '300';
  document.getElementById('avgScore').textContent = '72%';
  document.getElementById('streak').textContent = '12';
  document.getElementById('studyHours').textContent = '18.5';

  // Subjects and scores (example)
  const subjects = [
    { name: 'English', score: 78 },
    { name: 'Mathematics', score: 65 },
    { name: 'Physics', score: 82 },
    { name: 'Chemistry', score: 70 },
    { name: 'Biology', score: 88 }
  ];
  renderSubjects(subjects);

  // Recent tests (mock data)
  const tests = [
    { date: '22 Mar 2026', name: 'Full Mock #4', score: '72%' },
    { date: '18 Mar 2026', name: 'Subject Quiz - Biology', score: '90%' },
    { date: '15 Mar 2026', name: 'Full Mock #3', score: '68%' },
  ];
  renderRecentTests(tests);

  // Chart: dummy progress data
  const progress = [60, 65, 68, 72, 75, 78];
  renderChart(progress);
}

function renderSubjects(subjects) {
  const grid = document.getElementById('subjectsGrid');
  const colors = ['blue', 'purple', 'teal', 'orange', 'blue']; // cycling colours
  grid.innerHTML = subjects.map((sub, i) => `
    <div class="subject-item">
      <span class="subject-name">${sub.name}</span>
      <span class="subject-score ${colors[i % colors.length]}">${sub.score}%</span>
    </div>
  `).join('');
}
function renderRecentTests(tests) {
  const list = document.getElementById('testList');
  list.innerHTML = tests.map(test => `
    <div class="test-item">
      <div class="test-info">
        <span class="test-date">${test.date}</span>
        <span class="test-name">${test.name}</span>
      </div>
      <div class="test-score">${test.score}</div>
    </div>
  `).join('');
}

function renderChart(data) {
  const ctx = document.getElementById('scoreChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Mock 1', 'Mock 2', 'Mock 3', 'Mock 4', 'Mock 5', 'Mock 6'],
      datasets: [{
        label: 'Overall Score (%)',
        data: data,
        borderColor: '#16248c',
        backgroundColor: 'rgba(22, 36, 140, 0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#16248c',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: false,
          min: 50,
          max: 100,
          grid: { color: '#f0f0f0' }
        }
      }
    }
  });
}

// ---------- Logout ----------
document.getElementById('logoutBtn').addEventListener('click', async () => {
  const { error } = await client.auth.signOut();
  if (!error) {
    window.location.href = 'login.html';
  } else {
    toast.show('Logout failed. Please try again.');
  }
});

// Boot
loadUserProfile();