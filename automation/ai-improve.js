const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required.');
  process.exit(1);
}

// Files to analyze and potentially improve
const FILES_TO_ANALYZE = [
  'src/background.ts',
  'src/popup.ts',
  'src/offscreen.ts',
  'style/popup.css',
  'popup.html',
  'manifest.json'
];

async function main() {
  console.log('Reading files for AI review...');
  const filesData = [];
  for (const relPath of FILES_TO_ANALYZE) {
    const fullPath = path.join(__dirname, '..', relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      filesData.push({
        path: relPath,
        content: content
      });
    }
  }

  const prompt = `You are an expert software engineer reviewing a Chrome Extension called "Water Today".
Here are the files in the codebase:

${filesData.map(f => `--- FILE: ${f.path} ---\n${f.content}\n`).join('\n')}

Identify ONE improvement to make to the code. The improvement must be highly constructive, safe, and improve code quality, comments, modernizing JS/TS features, typescript types, error handling, CSS styling (e.g. accessibility, animations), or fixing minor bugs.
Do NOT make breaking changes or completely rewrite the application in a way that breaks functionality.
Your output must be a single JSON object matching the requested schema. You must suggest a rewrite of EXACTLY ONE file.

Generate a JSON object with the following fields:
- filePath: the relative path of the file to modify (e.g., "src/popup.ts")
- explanation: a detailed explanation of the improvement made
- newContent: the complete, fully rewritten file contents for the selected file. Ensure it is correct and compiles without errors.`;

  console.log('Calling Gemini API for automated code improvement...');
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          filePath: { type: "STRING", description: "The relative path of the file to modify" },
          explanation: { type: "STRING", description: "Description of the improvements made" },
          newContent: { type: "STRING", description: "The complete, fully rewritten contents of the file" }
        },
        required: ["filePath", "explanation", "newContent"]
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}\n${errText}`);
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Invalid or empty response from Gemini API.');
  }

  const result = JSON.parse(textContent);
  const targetFilePath = path.join(__dirname, '..', result.filePath);
  
  if (!FILES_TO_ANALYZE.includes(result.filePath)) {
    throw new Error(`AI suggested modifying a file outside the allowed set: ${result.filePath}`);
  }

  console.log(`\n--- AI Improvement Plan ---`);
  console.log(`Target File: ${result.filePath}`);
  console.log(`Explanation: ${result.explanation}`);
  console.log(`---------------------------\n`);

  console.log(`Writing changes to ${result.filePath}...`);
  fs.writeFileSync(targetFilePath, result.newContent, 'utf8');
  console.log('Changes successfully applied!');
  
  // Write explanation to a file so it can be read by subsequent steps in GitHub Actions
  fs.writeFileSync(path.join(__dirname, '..', 'ai-explanation.txt'), result.explanation, 'utf8');
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
