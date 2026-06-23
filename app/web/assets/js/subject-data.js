// ================================================================
//  SUBJECT-DATA – Complete JAMB syllabi for multiple subjects
// ================================================================

export const subjectData = {
  physics: {
    name: 'Physics',
    icon: 'fa-atom',
    gradient: 'linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%)',
    sections: [
      {
        id: 'mechanics',
        title: 'Mechanics',
        topics: [
          {
            id: 'motion',
            title: 'Motion & Kinematics',
            content: `
              <h3>Motion &amp; Kinematics</h3>
              <p>Distance, displacement, speed, velocity, acceleration. Equations of motion.</p>
              <div class="formula-box">
                v = u + at, s = ut + ½at², v² = u² + 2as
              </div>
              <div class="example-box">
                <strong>Example:</strong> A car accelerates from rest at 2 m/s² for 5 s. Find final velocity.<br>
                v = 0 + (2)(5) = <strong>10 m/s</strong>
              </div>
            `
          },
          {
            id: 'forces',
            title: 'Forces & Newton\'s Laws',
            content: `
              <h3>Newton's Laws of Motion</h3>
              <ul>
                <li><strong>First Law:</strong> Inertia – object remains at rest or uniform motion unless acted on.</li>
                <li><strong>Second Law:</strong> F = ma</li>
                <li><strong>Third Law:</strong> Action and reaction are equal and opposite.</li>
              </ul>
              <div class="formula-box">F = ma</div>
              <div class="example-box">
                <strong>Example:</strong> A force of 20 N gives a mass of 4 kg an acceleration of 5 m/s².
              </div>
            `
          },
          {
            id: 'work-energy',
            title: 'Work, Energy & Power',
            content: `
              <h3>Work, Energy &amp; Power</h3>
              <p>Work done, kinetic and potential energy, conservation of energy, power.</p>
              <div class="formula-box">
                W = F×d, KE = ½mv², PE = mgh, P = W/t
              </div>
              <div class="example-box">
                <strong>Example:</strong> A 2 kg mass is lifted 5 m. Work done = (2)(10)(5) = 100 J.
              </div>
            `
          }
        ]
      },
      {
        id: 'waves',
        title: 'Waves & Optics',
        topics: [
          {
            id: 'wave-properties',
            title: 'Wave Properties',
            content: `
              <h3>Wave Properties</h3>
              <p>Wavelength, frequency, speed, amplitude. Wave equation v = fλ.</p>
              <div class="formula-box">v = fλ</div>
              <div class="example-box">
                <strong>Example:</strong> A wave has frequency 50 Hz and wavelength 0.2 m. Speed = 10 m/s.
              </div>
            `
          },
          {
            id: 'optics',
            title: 'Optics – Reflection & Refraction',
            content: `
              <h3>Reflection and Refraction</h3>
              <p>Laws of reflection, Snell's law, critical angle, lenses.</p>
              <div class="formula-box">n₁ sin θ₁ = n₂ sin θ₂</div>
              <div class="example-box">
                <strong>Example:</strong> Light enters water (n=1.33) from air (n=1) at 45°, find angle of refraction.<br>
                1×sin45 = 1.33×sin r → r ≈ 32°
              </div>
            `
          }
        ]
      },
      {
        id: 'electricity',
        title: 'Electricity & Magnetism',
        topics: [
          {
            id: 'circuits',
            title: 'Electric Circuits',
            content: `
              <h3>Electric Circuits</h3>
              <p>Ohm's law, series and parallel circuits, power, emf, internal resistance.</p>
              <div class="formula-box">V = IR, P = IV = I²R = V²/R</div>
              <div class="example-box">
                <strong>Example:</strong> A 12 V battery supplies 2 A. Power = 24 W.
              </div>
            `
          }
        ]
      }
      // more sections...
    ]
  },

  chemistry: {
    name: 'Chemistry',
    icon: 'fa-flask',
    gradient: 'linear-gradient(135deg, #0b6e4f 0%, #10b981 100%)',
    sections: [
      {
        id: 'physical',
        title: 'Physical Chemistry',
        topics: [
          {
            id: 'atomic-structure',
            title: 'Atomic Structure',
            content: `
              <h3>Atomic Structure</h3>
              <p>Protons, neutrons, electrons. Atomic number, mass number, isotopes.</p>
              <div class="example-box">
                <strong>Example:</strong> Carbon-14 has 6 protons and 8 neutrons.
              </div>
            `
          },
          {
            id: 'mole-concept',
            title: 'Mole Concept & Stoichiometry',
            content: `
              <h3>Mole Concept</h3>
              <p>Molar mass, Avogadro's number, empirical formula, percentage composition.</p>
              <div class="formula-box">
                n = mass / molar mass, 1 mol = 6.02×10²³ particles
              </div>
              <div class="example-box">
                <strong>Example:</strong> How many moles in 20 g of NaOH (Mr=40)? n = 20/40 = 0.5 mol.
              </div>
            `
          }
        ]
      },
      {
        id: 'organic',
        title: 'Organic Chemistry',
        topics: [
          {
            id: 'hydrocarbons',
            title: 'Hydrocarbons',
            content: `
              <h3>Hydrocarbons</h3>
              <p>Alkanes, alkenes, alkynes – general formulas, properties, reactions.</p>
              <div class="formula-box">
                Alkanes: CₙH₂ₙ₊₂, Alkenes: CₙH₂ₙ, Alkynes: CₙH₂ₙ₋₂
              </div>
              <div class="example-box">
                <strong>Example:</strong> Propane (C₃H₈) – alkane.
              </div>
            `
          }
        ]
      }
    ]
  },

  biology: {
    name: 'Biology',
    icon: 'fa-dna',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    sections: [
      {
        id: 'cell-biology',
        title: 'Cell Biology',
        topics: [
          {
            id: 'cell-structure',
            title: 'Cell Structure & Function',
            content: `
              <h3>Cell Structure</h3>
              <p>Organelles: nucleus, mitochondria, ribosomes, etc. Plant vs animal cells.</p>
              <div class="example-box">
                <strong>Example:</strong> Mitochondria are the site of aerobic respiration.
              </div>
            `
          }
        ]
      },
      {
        id: 'genetics',
        title: 'Genetics',
        topics: [
          {
            id: 'mendelian',
            title: 'Mendelian Genetics',
            content: `
              <h3>Mendelian Genetics</h3>
              <p>Monohybrid and dihybrid crosses, dominance, segregation, independent assortment.</p>
              <div class="example-box">
                <strong>Example:</strong> In a monohybrid cross of tall (TT) and short (tt), F1 all tall (Tt).
              </div>
            `
          }
        ]
      }
    ]
  },

  english: {
    name: 'English',
    icon: 'fa-book-open',
    gradient: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
    sections: [
      {
        id: 'comprehension',
        title: 'Comprehension',
        topics: [
          {
            id: 'reading',
            title: 'Reading & Comprehension',
            content: `
              <h3>Reading &amp; Comprehension</h3>
              <p>Understanding passages, identifying main ideas, inference, summary.</p>
              <div class="example-box">
                <strong>Tip:</strong> Always read the questions first, then scan the passage.
              </div>
            `
          }
        ]
      },
      {
        id: 'grammar',
        title: 'Grammar & Usage',
        topics: [
          {
            id: 'tenses',
            title: 'Tenses & Concord',
            content: `
              <h3>Tenses and Subject-Verb Agreement</h3>
              <p>Rules of tense sequence, concord (singular/plural).</p>
              <div class="example-box">
                <strong>Example:</strong> "Each of the boys <em>is</em> here." (not "are")
              </div>
            `
          }
        ]
      },
      {
        id: 'vocabulary',
        title: 'Vocabulary & Lexis',
        topics: [
          {
            id: 'synonyms',
            title: 'Synonyms and Antonyms',
            content: `
              <h3>Synonyms and Antonyms</h3>
              <p>Words with similar and opposite meanings.</p>
              <div class="example-box">
                <strong>Example:</strong> Loquacious = talkative (synonym); silent (antonym).
              </div>
            `
          }
        ]
      }
    ]
  }
};