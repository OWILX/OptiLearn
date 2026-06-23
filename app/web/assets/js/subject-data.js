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

mathematics: {
    name: 'Mathematics',
    icon: 'fa-hat',
    gradient: 'linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%)',
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

   };