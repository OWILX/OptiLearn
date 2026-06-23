// ================================================================
//  SUBJECT-STUDY – Generic study page logic
// ================================================================

import { subjectData } from './subject-data.js';

// -------- STATE --------
const subjectKey = window.subjectKey || 'physics';
const data = subjectData[subjectKey];
if (!data) {
  console.error(`No syllabus found for subject: ${subjectKey}`);
  document.body.innerHTML = '<p style="padding: 20px;">Subject not found.</p>';
}

const STORAGE_KEY = `studied_${subjectKey}`;
let studiedTopics = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

// -------- HELPERS --------
function isStudied(topicId) {
  return studiedTopics.includes(topicId);
}

function toggleStudied(topicId) {
  const index = studiedTopics.indexOf(topicId);
  if (index === -1) studiedTopics.push(topicId);
  else studiedTopics.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(studiedTopics));
  updateUI();
}

// -------- RENDER TOPICS --------
function renderTopics() {
  const grid = document.getElementById('topicsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const allTopics = [];
  data.sections.forEach(section => {
    section.topics.forEach(topic => {
      allTopics.push({ ...topic, sectionTitle: section.title });
    });
  });

  allTopics.forEach(topic => {
    const studied = isStudied(topic.id);
    const card = document.createElement('div');
    card.className = 'topic-card';
    card.dataset.topicId = topic.id;
    card.innerHTML = `
      <div class="topic-category">${topic.sectionTitle}</div>
      <div class="topic-title">${topic.title}</div>
      <div class="topic-progress">
        <div class="topic-progress-bar">
          <div class="topic-progress-fill" style="width: ${studied ? 100 : 0}%; background: ${studied ? '#10b981' : '#e5e7eb'};"></div>
        </div>
        <span class="topic-progress-text">${studied ? '✓ Done' : '0%'}</span>
      </div>
      <div class="topic-status-badge ${studied ? '' : 'not-studied'}">
        <i class="fa-solid ${studied ? 'fa-circle-check' : 'fa-circle'}"></i>
      </div>
    `;
    card.addEventListener('click', () => openStudyPanel(topic));
    grid.appendChild(card);
  });

  document.getElementById('topicsCount').textContent = `${allTopics.length} topics`;
}

// -------- STUDY PANEL --------
let currentTopic = null;

function openStudyPanel(topic) {
  currentTopic = topic;
  const panel = document.getElementById('studyPanel');
  const overlay = document.getElementById('studyOverlay');
  const title = document.getElementById('studyTopicTitle');
  const body = document.getElementById('studyContent');
  const markBtn = document.getElementById('markStudiedBtn');

  title.textContent = topic.title;
  body.innerHTML = topic.content;

  const studied = isStudied(topic.id);
  markBtn.innerHTML = studied
    ? `<i class="fa-regular fa-circle-check"></i> Mark as Unstudied`
    : `<i class="fa-regular fa-circle-check"></i> Mark as Studied`;
  markBtn.classList.toggle('done', studied);

  panel.style.display = 'flex';
  overlay.classList.add('active');
  requestAnimationFrame(() => {
    panel.classList.add('active');
  });
}

function closeStudyPanel() {
  const panel = document.getElementById('studyPanel');
  const overlay = document.getElementById('studyOverlay');
  panel.classList.remove('active');
  overlay.classList.remove('active');
  setTimeout(() => {
    if (!panel.classList.contains('active')) panel.style.display = 'none';
  }, 350);
}

// -------- UPDATE STATS --------
function updateStats() {
  const allTopics = [];
  data.sections.forEach(section => {
    section.topics.forEach(t => allTopics.push(t.id));
  });
  const total = allTopics.length;
  const done = studiedTopics.filter(id => allTopics.includes(id)).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  document.getElementById('topicsCompleted').textContent = done;
  document.getElementById('totalProgress').textContent = `${percent}%`;
  document.getElementById('progressPercent').textContent = `${percent}%`;
  document.getElementById('progressFill').style.width = `${percent}%`;
}

function updateUI() {
  renderTopics();
  updateStats();
}

// -------- INIT --------
document.addEventListener('DOMContentLoaded', () => {
  // Set hero data
  document.querySelector('.subject-hero-icon i').className = `fa-solid ${data.icon}`;
  document.querySelector('.subject-hero-text h1').textContent = data.name;
  document.querySelector('.subject-hero').style.background = data.gradient;

  renderTopics();
  updateStats();

  // Event listeners
  document.getElementById('closeStudyPanel').addEventListener('click', closeStudyPanel);
  document.getElementById('studyOverlay').addEventListener('click', closeStudyPanel);

  document.getElementById('markStudiedBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    if (!currentTopic) return;
    toggleStudied(currentTopic.id);
    const studied = isStudied(currentTopic.id);
    this.innerHTML = studied
      ? `<i class="fa-regular fa-circle-check"></i> Mark as Unstudied`
      : `<i class="fa-regular fa-circle-check"></i> Mark as Studied`;
    this.classList.toggle('done', studied);
    renderTopics();
  });

  document.getElementById('practiceBtn').addEventListener('click', function() {
    if (!currentTopic) return;
    alert(`Practice questions for "${currentTopic.title}" coming soon!`);
  });

  // Storage change (other tabs)
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      studiedTopics = JSON.parse(e.newValue) || [];
      updateUI();
    }
  });
});