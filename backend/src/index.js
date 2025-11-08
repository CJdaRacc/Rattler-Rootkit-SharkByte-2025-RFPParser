import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import './lib/mongo.js';
import rfpsRouter from './routes/rfps.js';
import templatesRouter from './routes/templates.js';
import proposalsRouter from './routes/proposals.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'rfp-proposal-backend', time: new Date().toISOString() });
});

app.use('/api/rfps', rfpsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/proposals', proposalsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
