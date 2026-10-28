import express from 'express';
import 'dotenv/config';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '80kb' }));
app.use(express.static('public'));
const hits = new Map();
app.post('/api/chat', async (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (recent.length >= 12) return res.status(429).json({ error: 'Limite temporário: aguarde um minuto.' });
  recent.push(now); hits.set(ip, recent);
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Configure OPENAI_API_KEY no arquivo .env.' });
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20 || messages.some(m => !m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 4000)) {
    return res.status(400).json({ error: 'Mensagens inválidas.' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', temperature: 0.6, max_tokens: 800,
        messages: [{ role: 'system', content: 'Você é Nexo, assistente de microempreendedores brasileiros. Responda em português do Brasil com clareza, objetividade e exemplos práticos. Ajude com vendas, planejamento, estoque, precificação e marketing. Não invente dados do negócio. Para assuntos fiscais, legais e financeiros, sinalize limites e recomende confirmação com profissional qualificado quando necessário.' }, ...messages] })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: response.status === 429 ? 'API temporariamente sem capacidade ou créditos.' : 'Erro ao consultar a IA. Verifique a chave, o modelo e o faturamento da API.' });
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) throw new Error('Resposta vazia');
    res.json({ answer });
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' ? 'A IA demorou para responder. Tente novamente.' : 'Não foi possível conectar à IA.' });
  } finally { clearTimeout(timer); }
});
app.listen(process.env.PORT || 3000, () => console.log(`NEXO Business: http://localhost:${process.env.PORT || 3000}`));
