import express from 'express';
const app = express();
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'brightloop' }));
app.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log('Brightloop API ready on port ' + (process.env.PORT || 3001)));
