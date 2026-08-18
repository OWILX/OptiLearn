// ================================================================
//  EXAM – Subject selection, exam taking, results
// ================================================================

import { questionBank } from './exam-data.js';
import { subjectData } from './subject-data.js';

// -------- STATE --------
let selectedSubjects = [];
const MAX_SUBJECTS = 4;
let questions = [];
let currentIndex = 0;
let answers = {}; // { questionId: selectedOptionIndex }
let reviewFlags = {}; // { questionId: true/false }
let timerInterval = null;
let timeLeft = 7200; // 2 hours in seconds
let examActive = false;

// DOM refs
const selectionContainer = document.getElementById('selectionContainer');
const examContainer = document.getElementById('examContainer');
const resultsContainer = document.getElementById('resultsContainer');
const subjectGrid = document.getElementById('subjectGrid');
const startBtn = document.getElementById('startExamBtn');
const questionText = document.getElementById('questionText');
const optionsContainer = document.getElementById('optionsContainer');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const submitBtn = document.getElementById('submitExamBtn');
const markReviewBtn = document.getElementById('markReviewBtn');
const timerDisplay = document.getElementById('timerDisplay');
const progressFill = document.getElementById('examProgressFill');
const progressText = document.getElementById('examProgressText');
const paletteContainer = document.getElementById('paletteContainer');
const resultsSummary = document.getElementById('resultsSummary');
const resultsDetail = document.getElementById('resultsDetail');
const reviewAnswersBtn = document.getElementById('reviewAnswersBtn');
const backHomeBtn = document.getElementById('backHomeBtn');

// -------- SUBJECT SELECTION --------
function renderSubjectSelection() {
  const grid = subjectGrid;
  grid.innerHTML = '';
  const subjects = Object.keys(subjectData);
  subjects.forEach(key => {
    const data = subjectData[key];
    const card = document.createElement('div');
    card.className = 'subject-select-card';
    card.dataset.subject = key;
    card.innerHTML = `
      <i class="fa-solid ${data.icon}"></i>
      <div class="subject-name">${data.name}</div>
    `;
    card.addEventListener('click', () => toggleSubject(key, card));
    grid.appendChild(card);
  });
  startBtn.disabled = true;
}

function toggleSubject(key, card) {
  const index = selectedSubjects.indexOf(key);
  if (index > -1) {
    selectedSubjects.splice(index, 1);
    card.classList.remove('selected');
  } else {
    if (selectedSubjects.length >= MAX_SUBJECTS) {
      alert(`You can select only ${MAX_SUBJECTS} subjects.`);
      return;
    }
    selectedSubjects.push(key);
    card.classList.add('selected');
  }
  startBtn.disabled = selectedSubjects.length !== MAX_SUBJECTS;
}

// -------- BUILD EXAM --------
function buildExam() {
  let allQs = [];
  selectedSubjects.forEach(sub => {
    const qs = questionBank[sub] || [];
    // Shuffle and pick 20 (or all if less)
    const shuffled = [...qs].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 20);
    allQs = allQs.concat(selected);
  });
  // Shuffle overall order (optional)
  allQs.sort(() => Math.random() - 0.5);
  return allQs;
}

// -------- RENDER QUESTION --------
function renderQuestion(index) {
  const q = questions[index];
  if (!q) return;
  questionText.textContent = q.text;
  optionsContainer.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  q.options.forEach((opt, i) => {
    const div = document.createElement('div');
    div.className = 'option-item';
    if (answers[q.id] === i) div.classList.add('selected');
    if (reviewFlags[q.id]) div.classList.add('review');
    div.innerHTML = `
      <span class="letter">${letters[i]}</span>
      <span class="text">${opt}</span>
    `;
    div.addEventListener('click', () => selectOption(q.id, i));
    optionsContainer.appendChild(div);
  });

  // Update palette
  updatePalette();

  // Update progress
  const total = questions.length;
  const answered = Object.keys(answers).length;
  progressFill.style.width = `${(answered / total) * 100}%`;
  progressText.textContent = `${answered}/${total}`;

  // Buttons
  prevBtn.disabled = index === 0;
  nextBtn.textContent = index === total - 1 ? 'Finish' : 'Next';

  // Mark review button
  markReviewBtn.textContent = reviewFlags[q.id] ? 'Unmark Review' : 'Mark for Review';
  markReviewBtn.classList.toggle('reviewed', reviewFlags[q.id]);

  // Scroll to top of question area
  document.querySelector('.question-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectOption(qId, optionIndex) {
  if (!examActive) return;
  answers[qId] = optionIndex;
  // Clear review flag if set (optional)
  renderQuestion(currentIndex);
}

// -------- NAVIGATION --------
function goToQuestion(index) {
  if (index < 0 || index >= questions.length) return;
  currentIndex = index;
  renderQuestion(index);
}

// -------- PALETTE --------
function updatePalette() {
  paletteContainer.innerHTML = '';
  questions.forEach((q, i) => {
    const div = document.createElement('div');
    div.className = 'palette-item';
    if (answers[q.id] !== undefined) div.classList.add('answered');
    if (reviewFlags[q.id]) div.classList.add('review');
    if (i === currentIndex) div.classList.add('current');
    div.textContent = i + 1;
    div.addEventListener('click', () => goToQuestion(i));
    paletteContainer.appendChild(div);
  });
}

// -------- TIMER --------
function startTimer() {
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      alert('Time is up! Your exam will be submitted automatically.');
      submitExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  timerDisplay.className = 'exam-timer';
  if (timeLeft < 300) timerDisplay.classList.add('danger');
  else if (timeLeft < 600) timerDisplay.classList.add('warning');
}

// -------- SUBMIT EXAM --------
function submitExam() {
  if (!examActive) return;
  clearInterval(timerInterval);
  examActive = false;
  // Calculate results
  let total = questions.length;
  let correct = 0;
  const perSubject = {};
  questions.forEach(q => {
    const sub = q.subject;
    if (!perSubject[sub]) perSubject[sub] = { correct: 0, total: 0 };
    perSubject[sub].total++;
    if (answers[q.id] === q.correct) {
      correct++;
      perSubject[sub].correct++;
    }
  });
  // Show results
  examContainer.style.display = 'none';
  resultsContainer.style.display = 'block';
  document.getElementById('totalCorrect').textContent = correct;
  document.getElementById('totalQuestions').textContent = total;
  document.getElementById('scorePercent').textContent = Math.round((correct / total) * 100) + '%';

  // Per subject detail
  const detailContainer = resultsDetail;
  detailContainer.innerHTML = '';
  Object.keys(perSubject).forEach(subKey => {
    const data = perSubject[subKey];
    const subName = subjectData[subKey]?.name || subKey;
    const div = document.createElement('div');
    div.className = 'result-subject-card';
    div.innerHTML = `
      <div class="subject-name">${subName}</div>
      <div class="subject-score">${data.correct}/${data.total}</div>
      <div class="subject-total">${Math.round((data.correct/data.total)*100)}%</div>
    `;
    detailContainer.appendChild(div);
  });

  // Store results for review
  window._examResults = { questions, answers, correct };
}

// -------- REVIEW ANSWERS --------
function reviewAnswers() {
  // Show all questions with correct/wrong indicators
  resultsContainer.style.display = 'none';
  examContainer.style.display = 'block';
  // Override render to show correct/wrong
  const oldRender = renderQuestion;
  renderQuestion = function(index) {
    const q = questions[index];
    if (!q) return;
    questionText.textContent = q.text;
    optionsContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, i) => {
      const div = document.createElement('div');
      div.className = 'option-item';
      if (i === q.correct) div.classList.add('correct');
      if (answers[q.id] !== undefined && answers[q.id] === i && i !== q.correct) {
        div.classList.add('wrong');
      }
      div.innerHTML = `
        <span class="letter">${letters[i]}</span>
        <span class="text">${opt}</span>
      `;
      optionsContainer.appendChild(div);
    });
    // Disable interactions
    document.querySelectorAll('.option-item').forEach(el => el.style.cursor = 'default');
    // Update progress, buttons etc.
    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === questions.length - 1 ? 'Finish Review' : 'Next';
    markReviewBtn.style.display = 'none';
    submitBtn.style.display = 'none';
    // Update palette (show all as answered)
    updatePalette();
  };
  currentIndex = 0;
  renderQuestion(0);
  // Override next/prev to stay in review mode
  nextBtn.onclick = () => {
    if (currentIndex < questions.length - 1) goToQuestion(currentIndex + 1);
    else {
      // Go back to results
      examContainer.style.display = 'none';
      resultsContainer.style.display = 'block';
      // Restore original render
      renderQuestion = oldRender;
      nextBtn.onclick = goNext;
      prevBtn.onclick = goPrev;
      markReviewBtn.style.display = 'flex';
      submitBtn.style.display = 'flex';
    }
  };
  prevBtn.onclick = () => goToQuestion(currentIndex - 1);
}

// -------- EVENT BINDINGS --------
function goNext() {
  if (currentIndex < questions.length - 1) goToQuestion(currentIndex + 1);
  else {
    // If on last question, maybe submit or go to next? We'll let submit handle.
  }
}
function goPrev() {
  if (currentIndex > 0) goToQuestion(currentIndex - 1);
}

// -------- INIT --------
document.addEventListener('DOMContentLoaded', () => {
  renderSubjectSelection();

  startBtn.addEventListener('click', () => {
    if (selectedSubjects.length !== MAX_SUBJECTS) return;
    // Build exam
    questions = buildExam();
    if (questions.length === 0) {
      alert('No questions available for selected subjects.');
      return;
    }
    // Show exam
    selectionContainer.style.display = 'none';
    examContainer.style.display = 'block';
    examActive = true;
    currentIndex = 0;
    answers = {};
    reviewFlags = {};
    timeLeft = 7200;
    updateTimerDisplay();
    startTimer();
    renderQuestion(0);
  });

  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  submitBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to submit your exam?')) {
      submitExam();
    }
  });

  markReviewBtn.addEventListener('click', () => {
    if (!examActive) return;
    const q = questions[currentIndex];
    reviewFlags[q.id] = !reviewFlags[q.id];
    renderQuestion(currentIndex);
  });

  reviewAnswersBtn.addEventListener('click', reviewAnswers);
  backHomeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});