export const SECURITY_QUESTIONS = [
  { id: 1, text: 'What is the name of your first pet?' },
  { id: 2, text: 'In which city were you born?' },
  { id: 3, text: "What is your mother's middle name?" },
  { id: 4, text: 'What was the name of your elementary school?' },
  { id: 5, text: 'What is the name of your childhood best friend?' },
  { id: 6, text: 'What was your childhood nickname?' },
  { id: 7, text: 'In which city did you grow up?' },
  { id: 8, text: 'Who was your favorite teacher?' },
  { id: 9, text: 'What was the first country you visited?' },
  { id: 10, text: 'What is your favorite movie?' },
];

export const questionText = (id: number) => SECURITY_QUESTIONS.find((q) => q.id === id)?.text ?? SECURITY_QUESTIONS[0]!.text;
