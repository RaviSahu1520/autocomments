const API_KEY = process.env.OPENCODE_API_KEY || process.env.LLM_API_KEY || '';
const BASE_URL = 'https://opencode.ai/zen/v1';

async function main() {
    if (!API_KEY) {
        throw new Error('Missing API key. Set OPENCODE_API_KEY (or LLM_API_KEY) in your environment.');
    }

    const res = await fetch(`${BASE_URL}/models`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Models:', JSON.stringify(data, null, 2));
}
main();
