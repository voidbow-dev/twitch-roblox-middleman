const express = require('express');
const tmi = require('tmi.js');
const app = express();
const PORT = process.env.PORT || 3000;

// This object will keep track of all active streams and their votes
// Format: { "streamername": [1, 3, 2] }
let channelsData = {};
let activeClients = {};

// 1. Roblox tells the server to connect to a new streamer's chat
app.get('/connect', (req, res) => {
  const channel = req.query.channel?.toLowerCase().trim();
  if (!channel) return res.status(400).send("No channel provided");

  // Create empty vote array if it doesn't exist
  if (!channelsData[channel]) {
    channelsData[channel] = [];
  }

  // If we aren't already listening to this twitch chat, connect to it!
  if (!activeClients[channel]) {
    const client = new tmi.Client({
      connection: { secure: true, reconnect: true },
      channels: [ channel ]
    });

    client.on('message', (ch, tags, message, self) => {
      const cleanCh = ch.replace('#', '');
      if (['1', '2', '3', '4'].includes(message.trim()) && channelsData[cleanCh]) {
        channelsData[cleanCh].push(parseInt(message.trim()));
      }
    });

    client.connect()
      .then(() => {
        activeClients[channel] = client;
        console.log(`Successfully connected to Twitch chat: ${channel}`);
      })
      .catch(console.error);
  }

  res.send(`Listening to chat for ${channel}`);
});

// 2. Roblox asks for votes specific to a certain channel
app.get('/getvotes', (req, res) => {
  const channel = req.query.channel?.toLowerCase().trim();
  if (!channel || !channelsData[channel]) {
    return res.json([]);
  }

  // Return the votes for THIS streamer, then clear them
  res.json(channelsData[channel]);
  channelsData[channel] = []; 
});

app.listen(PORT, () => {
  console.log(`Dynamic middleman running on port ${PORT}`);
});
