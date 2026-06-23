// ================================================================
//  EXAM-DATA – Sample questions for mock exam
// ================================================================

export const questionBank = {
  english: [
    {
      id: 'eng1',
      subject: 'english',
      text: 'Choose the word that is closest in meaning to LOQUACIOUS.',
      options: ['Silent', 'Talkative', 'Aggressive', 'Intelligent'],
      correct: 1,
      explanation: 'Loquacious means talkative.'
    },
    {
      id: 'eng2',
      subject: 'english',
      text: 'Which of the following is a correct sentence?',
      options: [
        'He go to school yesterday.',
        'He went to school yesterday.',
        'He goes to school yesterday.',
        'He gone to school yesterday.'
      ],
      correct: 1,
      explanation: 'Past tense requires "went".'
    },
    // add at least 20 questions...
  ],
  mathematics: [
    {
      id: 'math1',
      subject: 'mathematics',
      text: 'If the mean of 5 numbers is 12, and four are 10, 14, 8, and 16, what is the fifth?',
      options: ['10', '12', '14', '16'],
      correct: 1,
      explanation: 'Sum = 60, four sum to 48, fifth = 12.'
    },
    // ...
  ],
  physics: [
    // ...
  ],
  chemistry: [
    // ...
  ],
  biology: [
    // ...
  ]
  // add more subjects as needed
};
