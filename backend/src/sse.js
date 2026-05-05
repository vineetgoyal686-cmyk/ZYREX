const clients = new Set();

const addClient = (res) => clients.add(res);
const removeClient = (res) => clients.delete(res);

const broadcast = (data) => {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.write(msg); } catch {}
  }
};

module.exports = { addClient, removeClient, broadcast };
