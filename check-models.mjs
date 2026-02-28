const API_KEY = 'sk-EQB15nr1hg9jVznCktGuUBa3P21mzXd39awfkFgWZj9JiWrD1JjgaEiSMabFRiOb';
const BASE_URL = 'https://opencode.ai/zen/v1';

async function main() {
    const res = await fetch(`${BASE_URL}/models`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Models:', JSON.stringify(data, null, 2));
}
main();
