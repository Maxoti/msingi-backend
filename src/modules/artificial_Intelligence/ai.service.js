const axios = require('axios');

const askAI = async (prompt) => {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.Groq_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Groq error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'AI request failed');
  }
};

module.exports = { askAI };