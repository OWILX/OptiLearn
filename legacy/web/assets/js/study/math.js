// -------- SYLLABUS DATA (JAMB Mathematics) --------
const syllabus = {
  sections: [
    {
      id: 'number',
      title: 'Number and Numeration',
      topics: [
        {
          id: 'number-bases',
          title: 'Number Bases',
          content: `
            <h3>Number Bases</h3>
            <p>Numbers can be expressed in different bases. The base of a number system is the number of digits used.</p>
            <ul>
              <li><strong>Base 10 (Decimal):</strong> digits 0–9</li>
              <li><strong>Base 2 (Binary):</strong> digits 0,1</li>
              <li><strong>Base 8 (Octal):</strong> digits 0–7</li>
              <li><strong>Base 16 (Hexadecimal):</strong> digits 0–9, A–F</li>
            </ul>
            <div class="formula-box">
              (1101)<sub>2</sub> = 1×2³ + 1×2² + 0×2¹ + 1×2⁰ = 8+4+0+1 = 13<sub>10</sub>
            </div>
            <div class="example-box">
              <strong>Example:</strong> Convert 25<sub>10</sub> to binary.<br>
              25 ÷ 2 = 12 r1, 12÷2=6 r0, 6÷2=3 r0, 3÷2=1 r1, 1÷2=0 r1 → <strong>11001<sub>2</sub></strong>
            </div>
          `
        },
        {
          id: 'fractions-decimals',
          title: 'Fractions, Decimals & Percentages',
          content: `
            <h3>Fractions, Decimals &amp; Percentages</h3>
            <p>Understanding conversions between fractions, decimals, and percentages is essential.</p>
            <ul>
              <li><strong>Fraction → Decimal:</strong> divide numerator by denominator.</li>
              <li><strong>Decimal → Percentage:</strong> multiply by 100.</li>
              <li><strong>Percentage → Fraction:</strong> write over 100 and simplify.</li>
            </ul>
            <div class="formula-box">
              \\frac{3}{4} = 0.75 = 75\\%
            </div>
            <div class="example-box">
              <strong>Example:</strong> What is 40% of 200?<br>
              40% = 0.40, so 0.40 × 200 = <strong>80</strong>
            </div>
          `
        },
        {
          id: 'indices-logarithms',
          title: 'Indices, Logarithms & Surds',
          content: `
            <h3>Indices, Logarithms &amp; Surds</h3>
            <p>Laws of indices, logarithms, and simplification of surds.</p>
            <ul>
              <li><strong>Indices:</strong> a<sup>m</sup> × a<sup>n</sup> = a<sup>m+n</sup>, (a<sup>m</sup>)<sup>n</sup> = a<sup>mn</sup></li>
              <li><strong>Logarithms:</strong> log<sub>a</sub>(xy) = log<sub>a</sub>x + log<sub>a</sub>y</li>
              <li><strong>Surds:</strong> √a × √b = √(ab), rationalise denominators</li>
            </ul>
            <div class="formula-box">
              \\log_{2} 8 = 3 \\quad (2^3 = 8)
            </div>
            <div class="example-box">
              <strong>Example:</strong> Simplify √18 + √8.<br>
              √18 = 3√2, √8 = 2√2 → 5√2
            </div>
          `
        },
        {
          id: 'sets',
          title: 'Sets',
          content: `
            <h3>Sets</h3>
            <p>Basic set notation, union, intersection, complement, Venn diagrams.</p>
            <ul>
              <li><strong>Union (A ∪ B):</strong> elements in A or B</li>
              <li><strong>Intersection (A ∩ B):</strong> elements in both</li>
              <li><strong>Complement (A'):</strong> elements not in A</li>
            </ul>
            <div class="formula-box">
              n(A ∪ B) = n(A) + n(B) - n(A ∩ B)
            </div>
            <div class="example-box">
              <strong>Example:</strong> If A={1,2,3}, B={3,4,5}, find A∩B.<br>
              A∩B = {3}
            </div>
          `
        }
      ]
    },
    {
      id: 'algebra',
      title: 'Algebra',
      topics: [
        {
          id: 'polynomials',
          title: 'Polynomials',
          content: `
            <h3>Polynomials</h3>
            <p>Operations on polynomials, factorisation, remainder and factor theorems.</p>
            <ul>
              <li><strong>Remainder Theorem:</strong> f(a) is the remainder when f(x) is divided by (x−a).</li>
              <li><strong>Factor Theorem:</strong> (x−a) is a factor iff f(a)=0.</li>
            </ul>
            <div class="formula-box">
              f(x) = (x-a)Q(x) + R
            </div>
            <div class="example-box">
              <strong>Example:</strong> Factorise x²−5x+6.<br>
              = (x−2)(x−3)
            </div>
          `
        },
        {
          id: 'quadratic-equations',
          title: 'Quadratic Equations',
          content: `
            <h3>Quadratic Equations</h3>
            <p>Solving quadratic equations by factorisation, completing the square, and the quadratic formula.</p>
            <div class="formula-box">
              x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
            </div>
            <div class="example-box">
              <strong>Example:</strong> Solve 2x²−5x+2=0.<br>
              a=2, b=-5, c=2 → x = [5 ± √(25−16)]/4 = [5 ± 3]/4 → x=2 or x=½
            </div>
          `
        },
        {
          id: 'simultaneous-equations',
          title: 'Simultaneous Equations',
          content: `
            <h3>Simultaneous Equations</h3>
            <p>Solving systems of linear equations using substitution and elimination.</p>
            <div class="example-box">
              <strong>Example:</strong> Solve<br>
              2x + y = 7<br>
              3x − y = 8<br>
              Add: 5x = 15 → x=3, then y=1.
            </div>
          `
        },
        {
          id: 'inequalities',
          title: 'Inequalities',
          content: `
            <h3>Inequalities</h3>
            <p>Linear, quadratic, and rational inequalities. Representing solutions on number lines.</p>
            <div class="example-box">
              <strong>Example:</strong> Solve x² − 4x + 3 > 0.<br>
              (x−1)(x−3) > 0 → x < 1 or x > 3.
            </div>
          `
        }
      ]
    },
    {
      id: 'geometry',
      title: 'Geometry & Trigonometry',
      topics: [
        {
          id: 'angles-polygons',
          title: 'Angles & Polygons',
          content: `
            <h3>Angles &amp; Polygons</h3>
            <p>Properties of angles (complementary, supplementary, vertically opposite) and polygons (sum of interior angles).</p>
            <div class="formula-box">
              Sum of interior angles of n-sided polygon = (n−2)×180°
            </div>
            <div class="example-box">
              <strong>Example:</strong> A pentagon has (5−2)×180 = 540°.
            </div>
          `
        },
        {
          id: 'circles',
          title: 'Circles',
          content: `
            <h3>Circles</h3>
            <p>Properties of chords, tangents, arcs, and angles in circles (theorems).</p>
            <ul>
              <li><strong>Angle at centre</strong> is twice angle at circumference.</li>
              <li><strong>Tangent</strong> is perpendicular to radius at point of contact.</li>
            </ul>
            <div class="example-box">
              <strong>Example:</strong> If ∠AOB = 100°, find ∠ACB (where C is on the circumference).<br>
              ∠ACB = ½ × 100 = 50°.
            </div>
          `
        },
        {
          id: 'trig-ratios',
          title: 'Trigonometric Ratios',
          content: `
            <h3>Trigonometric Ratios</h3>
            <p>Sine, cosine, tangent of acute angles. Special angles (0°, 30°, 45°, 60°, 90°).</p>
            <div class="formula-box">
              sin θ = opposite/hypotenuse, cos θ = adjacent/hypotenuse, tan θ = opposite/adjacent
            </div>
            <div class="example-box">
              <strong>Example:</strong> In a right triangle with opposite=3, hypotenuse=5, sin θ = 3/5.
            </div>
          `
        }
      ]
    },
    {
      id: 'calculus',
      title: 'Calculus',
      topics: [
        {
          id: 'differentiation',
          title: 'Differentiation',
          content: `
            <h3>Differentiation</h3>
            <p>Derivatives of basic functions, rules (product, quotient, chain), and applications (gradient, rates).</p>
            <div class="formula-box">
              \\frac{d}{dx}(x^n) = nx^{n-1}
            </div>
            <div class="example-box">
              <strong>Example:</strong> Differentiate f(x)=3x²+2x−5.<br>
              f'(x)=6x+2
            </div>
          `
        },
        {
          id: 'integration',
          title: 'Integration',
          content: `
            <h3>Integration</h3>
            <p>Indefinite and definite integrals, basic rules, and area under a curve.</p>
            <div class="formula-box">
              \\int x^n dx = \\frac{x^{n+1}}{n+1} + C \\quad (n \\neq -1)
            </div>
            <div class="example-box">
              <strong>Example:</strong> ∫(2x+3) dx = x²+3x+C
            </div>
          `
        }
      ]
    },
    {
      id: 'statistics',
      title: 'Statistics',
      topics: [
        {
          id: 'central-tendency',
          title: 'Measures of Central Tendency',
          content: `
            <h3>Measures of Central Tendency</h3>
            <p>Mean, median, mode for grouped and ungrouped data.</p>
            <div class="formula-box">
              \\text{Mean} = \\frac{\\sum x}{n}
            </div>
            <div class="example-box">
              <strong>Example:</strong> Data: 2,4,6,8,10 → Mean = 30/5 = 6.
            </div>
          `
        },
        {
          id: 'dispersion',
          title: 'Measures of Dispersion',
          content: `
            <h3>Measures of Dispersion</h3>
            <p>Range, variance, standard deviation.</p>
            <div class="formula-box">
              \\text{Variance} = \\frac{\\sum (x-\\bar{x})^2}{n}
            </div>
            <div class="example-box">
              <strong>Example:</strong> For data 2,4,6,8,10, mean=6, variance = [(4+4+0+4+4)/5]=3.2.
            </div>
          `
        },
        {
          id: 'probability',
          title: 'Probability',
          content: `
            <h3>Probability</h3>
            <p>Basic concepts, independent and dependent events, tree diagrams.</p>
            <div class="formula-box">
              P(A) = \\frac{\\text{number of favourable outcomes}}{\\text{total outcomes}}
            </div>
            <div class="example-box">
              <strong>Example:</strong> Tossing a fair coin twice, probability of two heads = 1/4.
            </div>
          `
        }
      ]
    }
  ]
};

// -------- STATE MANAGEMENT --------
const STORAGE_KEY = 'math_studied';
let studiedTopics = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

function isStudied(topicId) {
  return studiedTopics.includes(topicId);
}

function toggleStudied(topicId) {
  const index = studiedTopics.indexOf(topicId);
  if (index === -1) {
    studiedTopics.push(topicId);
  } else {
    studiedTopics.splice(index, 1);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(studiedTopics));
  updateUI();
}

// -------- RENDER TOPICS GRID --------
function renderTopics() {
  const grid = document.getElementById('topicsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Flatten all topics with their section title
  const allTopics = [];
  syllabus.sections.forEach(section => {
    section.topics.forEach(topic => {
      allTopics.push({
        ...topic,
        sectionTitle: section.title
      });
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

  // Update counts
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

  // Update mark button state
  const studied = isStudied(topic.id);
  markBtn.innerHTML = studied
    ? `<i class="fa-regular fa-circle-check"></i> Mark as Unstudied`
    : `<i class="fa-regular fa-circle-check"></i> Mark as Studied`;
  markBtn.classList.toggle('done', studied);

  // Show panel
  panel.style.display = 'flex';
  overlay.classList.add('active');
  // Trigger slide-in after a microtask
  requestAnimationFrame(() => {
    panel.classList.add('active');
  });
}

function closeStudyPanel() {
  const panel = document.getElementById('studyPanel');
  const overlay = document.getElementById('studyOverlay');
  panel.classList.remove('active');
  overlay.classList.remove('active');
  // Hide panel after transition
  setTimeout(() => {
    if (!panel.classList.contains('active')) {
      panel.style.display = 'none';
    }
  }, 350);
}

// -------- EVENT LISTENERS --------
document.addEventListener('DOMContentLoaded', () => {
  renderTopics();

  // Close panel buttons
  document.getElementById('closeStudyPanel').addEventListener('click', closeStudyPanel);
  document.getElementById('studyOverlay').addEventListener('click', closeStudyPanel);

  // Mark studied button
  document.getElementById('markStudiedBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    if (!currentTopic) return;
    toggleStudied(currentTopic.id);
    // Update button state and card progress without closing
    const studied = isStudied(currentTopic.id);
    this.innerHTML = studied
      ? `<i class="fa-regular fa-circle-check"></i> Mark as Unstudied`
      : `<i class="fa-regular fa-circle-check"></i> Mark as Studied`;
    this.classList.toggle('done', studied);
    // Refresh grid to update progress bars and badges
    renderTopics();
  });

  // Practice button – placeholder
  document.getElementById('practiceBtn').addEventListener('click', function() {
    if (!currentTopic) return;
    alert(`Practice questions for "${currentTopic.title}" coming soon!`);
  });

  // Update stats (topics completed & overall progress)
  updateStats();
});

function updateStats() {
  const allTopics = [];
  syllabus.sections.forEach(section => {
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

// -------- RE-RENDER ON LOCALSTORAGE CHANGE (if other tabs) --------
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    studiedTopics = JSON.parse(e.newValue) || [];
    updateUI();
  }
});