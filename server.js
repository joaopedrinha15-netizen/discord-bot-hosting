const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const root = __dirname;
const runtimeDir = path.join(root, 'bot-runtime');
const botFile = path.join(runtimeDir, 'custom-bot.js');
const logFile = path.join(runtimeDir, 'bot.log');
let botProcess = null;
let logs = [];

function ensureRuntimeDir() {
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
}

function writeLog(message) {
  const text = String(message).trim();
  if (!text) return;
  logs.push(text);
  if (logs.length > 200) logs = logs.slice(-200);
  fs.appendFileSync(logFile, `${new Date().toISOString()} - ${text}\n`, 'utf8');
}

ensureRuntimeDir();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(root, 'public')));

app.get('/api/status', (req, res) => {
  const running = !!botProcess && botProcess.exitCode === null;
  res.json({ running, pid: botProcess ? botProcess.pid : null });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: logs.slice(-80) });
});

app.get('/api/template', (req, res) => {
  res.json({
    template: `const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log('Bot online:', client.user.tag);
});

client.on('messageCreate', message => {
  if (message.author.bot) return;

  if (message.content.toLowerCase() === '!ping') {
    message.reply('Pong!');
  }
});

client.login(process.env.BOT_TOKEN || process.env.DISCORD_TOKEN);
`
  });
});

app.post('/api/start-bot', (req, res) => {
  const { code, botToken } = req.body || {};

  if (!code || !String(code).trim()) {
    return res.status(400).json({ error: 'Você precisa enviar o código do bot.' });
  }

  if (botProcess && botProcess.exitCode === null) {
    return res.status(409).json({ error: 'O bot já está em execução.' });
  }

  ensureRuntimeDir();
  fs.writeFileSync(botFile, String(code), 'utf8');

  const env = { ...process.env, BOT_TOKEN: botToken || process.env.BOT_TOKEN || '', DISCORD_TOKEN: botToken || process.env.DISCORD_TOKEN || '' };

  botProcess = spawn(process.execPath, [botFile], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });

  botProcess.stdout.on('data', (d) => writeLog(d.toString()));
  botProcess.stderr.on('data', (d) => writeLog(d.toString()));

  botProcess.on('close', (code, signal) => {
    writeLog(`Processo encerrado — code=${code} signal=${signal || 'none'}`);
    botProcess = null;
  });

  writeLog('Bot iniciado com sucesso.');
  return res.json({ ok: true, message: 'Bot iniciado.' });
});

app.post('/api/stop-bot', (req, res) => {
  if (!botProcess || botProcess.exitCode !== null) {
    return res.json({ ok: true, message: 'Nenhum bot está em execução.' });
  }

  botProcess.kill('SIGTERM');
  writeLog('Solicitação de parada enviada.');
  return res.json({ ok: true, message: 'Bot parado.' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(root, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  writeLog(`Servidor iniciado na porta ${port}`);
});
