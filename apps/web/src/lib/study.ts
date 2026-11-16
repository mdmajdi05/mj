/**
 * Local study assistant.
 *
 * Replies are generated from a small keyword engine in the browser. Nothing is
 * sent to a real AI service, and the study conversation is never stored in the
 * private Chat history.
 */

export const studyGreeting =
  'Hi! Main tumhara Study Assistant hoon. Kisi bhi topic ko simple tarike se samajhna ho, revision plan banana ho, ya focus improve karna ho — bas likho.';

/**
 * A short seeded history so Study Mode opens looking like a real session that
 * was already in progress. `minutesAgo` keeps the timestamps believable.
 */
export const studyHistory: Array<{
  role: 'user' | 'assistant';
  text: string;
  minutesAgo: number;
}> = [
  {
    role: 'user',
    text: 'Aaj physics ka chapter 4 khatam karna hai, plan banao.',
    minutesAgo: 34
  },
  {
    role: 'assistant',
    text: 'Chalo, chapter 4 ko 2 focused sessions me todte hain:\n\n• Session 1 (45 min): concepts + formulas.\n• 5 min break.\n• Session 2 (45 min): 5 numericals.\n\nPehle session me sirf padhna, numericals baad me.',
    minutesAgo: 33
  },
  {
    role: 'user',
    text: 'Numericals mushkil lag rahe hain.',
    minutesAgo: 30
  },
  {
    role: 'assistant',
    text: 'Numericals ke liye pehle 1 solved example dhyan se dekho, phir wahi question bina dekhe khud solve karo. Har step likho — sirf final answer nahi. Jo step atke, wahi concept dobara padho.',
    minutesAgo: 29
  },
  {
    role: 'user',
    text: 'Chapter ke 5 numerical solve karne hain, timer laga raha hoon.',
    minutesAgo: 6
  },
  {
    role: 'assistant',
    text: 'Perfect. 25 minute ka timer lagao aur ek time par ek numerical. Timer ke baad mujhe batao kitne sahi hue aur kahan atke — usi hisaab se next plan bana denge.',
    minutesAgo: 5
  }
];

/** Sent automatically the moment Study Mode opens. */
export const studyAutoOpener = 'Aaj ka target: physics chapter 4 ke 5 numerical.';

export const studySuggestions = [
  'Focus kaise improve karun?',
  'Revision plan banao',
  'Topic yaad kaise rakhun?',
  'Time management batao',
  'Phone distraction kaise rokun?'
];

export type Reply = {
  keywords: string[];
  answer: string;
};

export const defaultReplies: Reply[] = [
  {
    keywords: ['focus', 'concentrat', 'distract', 'dhyan', 'concentration'],
    answer:
      'Focus ko ek skill ki tarah treat karo, mood ki tarah nahi.\n\n' +
      '1. Ek time par sirf ek topic — phone ko doosre kamre me ya airplane mode me rakho.\n' +
      '2. 25 minute padho, 5 minute break lo. Break me social media nahi, paani ya walk.\n' +
      '3. Padhne se pehle ek chhota target likho: “is topic ke 5 questions solve karne hain”.\n' +
      '4. Distraction ka notebook rakho. Jo khayal aaye, usko likh do aur baad me dekho.\n\n' +
      'Shuru me 25 minute mushkil lage to 15 minute se start karo. Consistency length se zyada important hai.'
  },
  {
    keywords: ['revision', 'revise', 'dobara', 'repeat', 'spaced'],
    answer:
      'Revision ka best method spaced repetition hai — ek hi din sab kuch dohrana nahi.\n\n' +
      '• Aaj padha → aaj raat 10 minute quick recall.\n' +
      '• 2–3 din baad → 15 minute revision.\n' +
      '• 1 hafte baad → sirf questions solve karo.\n' +
      '• 1 mahine baad → short notes se final recall.\n\n' +
      'Har revision me book band karke khud se poochho: “Main is topic ko 2 minute me explain kar sakta hoon?” Jo atke, wahi weak point hai.'
  },
  {
    keywords: ['memory', 'yaad', 'remember', 'forget', 'bhool'],
    answer:
      'Cheez yaad rakhne ke liye padhna kaafi nahi — use recall karna padta hai.\n\n' +
      '1. Active recall: topic padhne ke baad book band karo aur apne words me likho/sunao.\n' +
      '2. Explain it: jaise kisi dost ko samjha rahe ho. Jo part explain nahi ho paaya, wahi dobara padho.\n' +
      '3. Visual links: numbers, names aur steps ko ek chhoti story ya diagram se jodo.\n' +
      '4. Sleep: raat ki neend memory ko fix karti hai. Late-night cramming se recall kam hota hai.\n\n' +
      'Ek topic ko 3 baar padhne se better hai use 3 baar khud se recall karna.'
  },
  {
    keywords: ['time', 'schedule', 'timetable', 'routine', 'plan', 'management'],
    answer:
      'Ek realistic study plan aisa ho:\n\n' +
      '• Subah 45–60 min: sabse difficult subject (fresh mind).\n' +
      '• Dopahar 30–45 min: medium topic + 10 min recall.\n' +
      '• Shaam 30 min: aaj ka quick revision.\n' +
      '• Raat 10 min: kal ka plan + weak points ki list.\n\n' +
      'Plan me har din 1–2 buffer slots rakho, warna ek din miss hote hi pura schedule toot jata hai. Target “6 ghante” nahi, “2 focused sessions” rakho.'
  },
  {
    keywords: ['phone', 'social media', 'instagram', 'whatsapp', 'distraction', 'mobile'],
    answer:
      'Phone distraction ko willpower se nahi, design se roko:\n\n' +
      '1. Study session se pehle phone ko silent + doosre kamre me rakho.\n' +
      '2. Apps ke notifications off karo; home screen se social apps hatao.\n' +
      '3. Study ke waqt website blocker ya focus mode use karo.\n' +
      '4. Break me bhi feed scroll na karo — usse brain ko rest nahi milta.\n' +
      '5. Agar phone notes ke liye zaroori hai, to sirf notes app use karo aur baaki apps logout rakho.\n\n' +
      'Ek rule yaad rakho: phone “reward” hai, “default” nahi. Kaam khatam hone ke baad hi use karo.'
  },
  {
    keywords: ['notes', 'note', 'summary', 'likh'],
    answer:
      'Notes aise banao ki unse revision ho sake:\n\n' +
      '• Har topic ke top par 1 line ka summary likho.\n' +
      '• Bullet points me keywords aur formulas rakho, poore paragraphs nahi.\n' +
      '• Ek side “questions” likho, doosri side “answers” — baad me khud ko test karo.\n' +
      '• Mistakes ka alag page banao. Revision se pehle sirf wahi page dekho.\n' +
      '• Diagrams aur flowcharts yaad rakhne me sabse fast hote hain.\n\n' +
      'Achhe notes ki pehchaan: 2 hafte baad bhi tum unhe 5 minute me samajh lo.'
  },
  {
    keywords: ['break', 'rest', 'thak', 'tired', 'pomodoro'],
    answer:
      'Breaks ka purpose brain ko reset karna hai, entertainment nahi.\n\n' +
      '• 25–30 min study ke baad 5 min break.\n' +
      '• 3–4 sessions ke baad 20–30 min ka longer break.\n' +
      '• Break me paani, walk, stretching ya window se door dekho.\n' +
      '• Reels/shorts break nahi hote — wo attention ko aur thaka dete hain.\n\n' +
      'Agar lagatar 90 minute padh rahe ho aur kuch yaad nahi reh raha, to 10 minute ka proper break zyada useful hoga.'
  },
  {
    keywords: ['exam', 'test', 'paper', 'preparation', 'prepare'],
    answer:
      'Exam preparation ko 3 layers me divide karo:\n\n' +
      '1. Coverage: pura syllabus ek baar dekh lo, har topic ka weightage note karo.\n' +
      '2. Practice: past papers aur sample questions solve karo — time limit ke saath.\n' +
      '3. Repair: jo galat hua, sirf wahi topic dobara padho.\n\n' +
      'Last week me naya chapter start na karo. Sirf revision, questions aur mistakes par focus karo. Exam se pehle 7–8 ghante ki neend marks me help karti hai.'
  },
  {
    keywords: ['math', 'maths', 'physics', 'numerical', 'problem', 'solve'],
    answer:
      'Numericals aur math ke liye ye loop follow karo:\n\n' +
      '1. Question ko apne words me likho — kya diya hai, kya nikalna hai.\n' +
      '2. Relevant formula list karo, phir values substitute karo.\n' +
      '3. Har step likho; sirf final answer nahi.\n' +
      '4. Galat question ko 24 ghante baad bina dekhe dobara solve karo.\n' +
      '5. Ek “formula sheet” banao aur har hafte 10 minute usko recall karo.\n\n' +
      'Agar concept clear nahi hai to pehle solved example ko samjho, phir same question khud solve karo.'
  },
  {
    keywords: ['syllabus', 'subject', 'chapter', 'padhai', 'study'],
    answer:
      'Padhai ko simple system me chalao:\n\n' +
      '• Har subject ke liye ek chhoti list banao: strong, medium, weak topics.\n' +
      '• Har din 1 weak + 1 medium topic lo.\n' +
      '• Padhne ke baad 5 minute active recall karo.\n' +
      '• Har hafte ek mini test do — bina notes ke.\n' +
      '• Progress hours se nahi, completed targets se measure karo.\n\n' +
      'Batao kaunsa subject sabse mushkil lag raha hai, main uske liye specific plan bana deta hoon.'
  }
];

export function studyReply(input: string, custom?: Reply[]): string {
  const text = input.toLowerCase();
  const source = custom && custom.length ? custom : defaultReplies;
  const scored = source
    .map((reply) => ({
      reply,
      score: reply.keywords.reduce(
        (total, keyword) => (text.includes(keyword) ? total + keyword.length : total),
        0
      )
    }))
    .sort((a, b) => b.score - a.score);

  if (scored[0]?.score > 0) {
    return scored[0].reply.answer;
  }

  return (
    'Is topic ko simple steps me todte hain:\n\n' +
    '1. Pehle decide karo exactly kya samajhna hai — ek chhota sawaal likho.\n' +
    '2. Us sawaal ka jawab 5 minute me book/notes se dhoondo.\n' +
    '3. Book band karke apne words me explain karo.\n' +
    '4. Jo part unclear rahe, sirf wahi dobara padho.\n' +
    '5. Kal usi topic ka 3-minute quick recall karo.\n\n' +
    'Apna subject, chapter ya exact doubt likho, main zyada specific guidance de sakta hoon.'
  );
}
