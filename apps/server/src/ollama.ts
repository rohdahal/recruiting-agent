const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2:1b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 20000);

interface GenerateResponse {
  response: string;
}

export async function generateWithOllama(prompt: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GenerateResponse;
    return data.response?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateOutreachMessage(input: {
  recruiterName: string;
  candidateName: string;
  role: string;
  highlights: string[];
}): Promise<string> {
  const prompt = [
    'You are a recruiting coordinator assistant.',
    'Write a short outreach email with subject line and body.',
    'Tone: warm, startup, concise, human.',
    `Recruiter: ${input.recruiterName}`,
    `Candidate: ${input.candidateName}`,
    `Role: ${input.role}`,
    `Highlights: ${input.highlights.join(', ')}`,
    'Output format:',
    'Subject: ...',
    '',
    'Hi ...,',
    '...'
  ].join('\n');

  const generated = await generateWithOllama(prompt);
  if (generated) {
    return generated;
  }

  return `Subject: Quick chat about ${input.role}\n\nHi ${input.candidateName},\n\nI came across your background and your work in ${input.highlights[0] ?? 'building strong products'} stood out. We're hiring for a ${input.role} role and I think your experience could be a great fit.\n\nWould you be open to a quick intro call this week?\n\nBest,\n${input.recruiterName}`;
}

export async function extractJobSpecFromPrompt(prompt: string): Promise<{
  title: string;
  location: string;
  requiredSkills: string[];
  preferredSkills: string[];
  minYearsExperience: number;
  notes: string;
}> {
  const llmPrompt = [
    'Extract a recruiting job spec from the following request.',
    'Respond ONLY as strict JSON with keys:',
    'title, location, requiredSkills, preferredSkills, minYearsExperience, notes',
    'requiredSkills and preferredSkills must be arrays of strings.',
    `Request: ${prompt}`
  ].join('\n');

  const raw = await generateWithOllama(llmPrompt);

  if (raw) {
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as {
        title?: string;
        location?: string;
        requiredSkills?: string[];
        preferredSkills?: string[];
        minYearsExperience?: number;
        notes?: string;
      };

      return {
        title: parsed.title ?? 'Software Engineer',
        location: parsed.location ?? 'Remote',
        requiredSkills: parsed.requiredSkills ?? ['TypeScript', 'React'],
        preferredSkills: parsed.preferredSkills ?? ['Node.js', 'LLM'],
        minYearsExperience: Number(parsed.minYearsExperience ?? 3),
        notes: parsed.notes ?? prompt
      };
    } catch {
      return heuristicSpec(prompt);
    }
  }

  return heuristicSpec(prompt);
}

function heuristicSpec(prompt: string) {
  const lower = prompt.toLowerCase();
  const skills = ['typescript', 'react', 'node.js', 'python', 'llm', 'aws', 'graphql', 'postgres'];
  const requiredSkills = skills.filter((skill) => lower.includes(skill)).map((skill) => titleCase(skill));

  return {
    title: lower.includes('designer') ? 'Product Designer' : 'Founding Software Engineer',
    location: lower.includes('new york') ? 'New York' : lower.includes('san francisco') ? 'San Francisco' : 'Remote',
    requiredSkills: requiredSkills.slice(0, 5).length ? requiredSkills.slice(0, 5) : ['TypeScript', 'React'],
    preferredSkills: ['Node.js', 'LLM', 'Product Sense'],
    minYearsExperience: Number((lower.match(/(\d+)\+?\s*years?/)?.[1] ?? 3)),
    notes: prompt
  };
}

function titleCase(value: string): string {
  return value
    .split(/\s|\.|-/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .replace('Js', 'JS');
}
