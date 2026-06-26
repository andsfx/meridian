import 'dotenv/config';
import OpenAI from 'openai';

const apiKey = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || 'sk-or-v1-...';
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey,
  timeout: 30000,
});

try {
  console.log('Calling LLM with tool_choice=required...');
  const response = await client.chat.completions.create({
    model: 'dahono/qwen3.7-max',
    messages: [{ role: 'user', content: 'test' }],
    tools: [{ type: 'function', function: { name: 'test', description: 'test', parameters: { type: 'object', properties: {} } } }],
    tool_choice: 'required',
    max_tokens: 10,
  });
  console.log('Response:', JSON.stringify(response, null, 2));
} catch (error) {
  console.error('Error caught:', error.name, error.message);
  console.error('Full error:', error);
}