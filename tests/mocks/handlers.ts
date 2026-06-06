import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('https://generativelanguage.googleapis.com/v1beta/models/*', () => {
    return HttpResponse.json({
      candidates: [{ content: { parts: [{ text: 'Mock Gemini response' }] } }]
    });
  }),
  http.post('https://openrouter.ai/api/v1/chat/completions', () => {
    return HttpResponse.json({
      choices: [{ message: { content: 'Mock OpenRouter response' } }]
    });
  })
];
