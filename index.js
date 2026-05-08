const http = require('http');
const https = require('https');

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `Eres el asistente de WhatsApp de "La Cuchara de Palo", deli y restaurante de comida ecuatoriana en Central Islip, NY.

MENÚ COMIDA (Para llevar o comer en el lugar — NO hay delivery):
- Comida del día: Pequeño $10 / Mediano $13 / Grande $15
- Encebollado Grande $18 / Pequeño $15
- Guatita $18
- Seco de Pollo $15
- Seco de Carne (precio variable)
- Caldo de Gallina $18
- Aguado de Pollo $16
- Sopa de Mariscos $18
- Pescado Frito $17
- Carne Asada de Res $15
- Pechuga Asada $15
- Pollo Asado $8
- Pieza de Pollo $5
- Salchipapa $12
- Bolón con Queso $10 / Bolón Mixto $12
- Empanada de Carne/Pollo/Queso $3.50 c/u
- Tostada Jamón Queso $5 / Tostada Queso $4
- Sándwich Jamón Pollo Huevo Queso $8
- Sándwich Pollo Lechuga Tomate $8
- Sándwich Jamón Huevo Queso $6
- Papas Fritas $8 / Pequeñas $4
- Patacones x6 $4
- Tostones $5
- Ensalada de Frutas $10

BATIDOS Y JUGOS (Pequeño $9 / Mediano $12 / Grande $15):
17 batidos especiales por beneficio de salud: Anti Inflamatorio, Abdomen Plano, Sandía Saludable, Limpieza de Colon, Para el Cansancio, Papaya Reductiva, Reducir el Apetito, Para la Ansiedad, Perder Grasa, Dolor de Cabeza, Quema Grasa, Para Uñas Sanas, Para la Depresión, Para el Colesterol, Para Úlceras, Para la Anemia, Para la Vista.
También: Arma el tuyo con 3 frutas (naranja, piña, mora, fresa, coco, papaya, manzana, uva, banana, mango) y elige base (leche, agua, leche de almendra, leche de coco, jugo de naranja, etc).
Morocho: Pequeño $3 / Grande $4
Colada Morada: Pequeño $7 / Grande $9
Coco Classic $9

BEBIDAS:
Café Grande $3 / Pequeño $2, Coca Cola $2.50, Sprite $2.50, Fanta $2.50, Gatorade $2.50, Redbull $3.75, Agua $1.50, Guitig $2.50, Apple Juice $1.50, Coconut Juice $2

TIENDA:
Pan Ecuatoriano $2, Chocolate Ambateño $8, Avena $4, Lenteja tarrina grande $12 / pequeña $6, Frijol tarrina grande $12 / pequeña $6, Aguacate entero $2 / mitad $1, y más productos.

REGLAS IMPORTANTES:
- Responde SIEMPRE en español
- Sé breve, cálido y amigable (máximo 5 líneas)
- NO hay delivery — solo para llevar o comer en el lugar
- Si no sabes el precio exacto de algo, di que consulten en el local
- Usa 1 emoji ocasionalmente
- Si el cliente quiere ordenar, confirma los items y diles que pasen al local`;

function callClaude(message, callback) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: message }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        console.log('Claude response:', JSON.stringify(parsed).substring(0, 200));
        const text = parsed.content && parsed.content[0] ? parsed.content[0].text : 'Disculpa, intenta de nuevo 🙏';
        callback(null, text);
      } catch (e) {
        callback(e);
      }
    });
  });
  req.on('error', callback);
  req.write(body);
  req.end();
}

function sendWhatsApp(to, message, callback) {
  const body = JSON.stringify({ to, body: message });
  const options = {
    hostname: 'gate.whapi.cloud',
    path: '/messages/text',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WHAPI_TOKEN}`,
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => callback && callback(null, data));
  });
  req.on('error', err => callback && callback(err));
  req.write(body);
  req.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200);
    res.end('La Cuchara de Palo Bot - Activo ✅');
    return;
  }

  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const messages = data.messages || [];
        
        for (const msg of messages) {
          if (msg.from_me) continue;
          if (msg.type !== 'text') continue;
          
          const text = msg.text && msg.text.body;
          const from = msg.chat_id || msg.from;
          
          if (!text || !from) continue;

          callClaude(text, (err, reply) => {
            if (err) {
              console.error('Claude error:', err);
              return;
            }
            sendWhatsApp(from, reply, (err2) => {
              if (err2) console.error('Whapi error:', err2);
              else console.log(`Respondido a ${from}: ${reply.substring(0, 50)}...`);
            });
          });
        }
        
        res.writeHead(200);
        res.end('OK');
      } catch (e) {
        console.error('Webhook error:', e);
        res.writeHead(200);
        res.end('OK');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🥄 La Cuchara de Palo Bot corriendo en puerto ${PORT}`);
});
