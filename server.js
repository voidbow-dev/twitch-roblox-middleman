const express = require('express');
const tmi = require('tmi.js');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// This secretly grabs your key from the Render dashboard settings!
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; 

let channelsData = {};
let activeClients = {};
let activeYtLoops = {};

// 1. ROBLOX CONNECTS A STREAMER
app.get('/connect', (req, res) => {
  const channel = req.query.channel?.toLowerCase().trim();
  const platform = req.query.platform?.toLowerCase().trim() || 'twitch';
  const ytVideoId = req.query.videoId?.trim();

  if (!channel) return res.status(400).send("No channel provided");

  // Create an empty voting room for this streamer if it doesn't exist
  if (!channelsData[channel]) {
    channelsData[channel] = [];
  }

  // --- TWITCH CONNECTION ---
  if (platform === 'twitch' && !activeClients[channel]) {
    const client = new tmi.Client({
      connection: { secure: true, reconnect: true },
      channels: [ channel ]
    });

    client.on('message', (ch, tags, message, self) => {
      const cleanCh = ch.replace('#', '').toLowerCase();
      if (['1', '2', '3', '4'].includes(message.trim()) && channelsData[cleanCh]) {
        channelsData[cleanCh].push(parseInt(message.trim()));
      }
    });

    client.connect()
      .then(() => {
        activeClients[channel] = client;
        console.log(`Connected to Twitch chat: ${channel}`);
      })
      .catch(console.error);
  }

  // --- YOUTUBE CONNECTION ---
  if (platform === 'youtube' && ytVideoId && !activeYtLoops[channel]) {
    console.log(`Setting up YouTube monitoring for ${channel} (Video ID: ${ytVideoId})`);
    startYouTubeChatLoop(channel, ytVideoId);
  }

  res.send(`Middleman successfully targeting ${platform} for ${channel}`);
});

// 2. ROBLOX GRABS THE SECURED VOTES
app.get('/getvotes', (req, res) => {
  const channel = req.query.channel?.toLowerCase().trim();
  if (!channel || !channelsData[channel]) {
    return res.json([]);
  }
  
  // Return this specific streamer's votes, then clear them
  res.json(channelsData[channel]);
  channelsData[channel] = []; 
});

// YOUTUBE TRACKING LOGIC
async function startYouTubeChatLoop(channel, videoId) {
  try {
    if (!YOUTUBE_API_KEY) {
      console.error("CRITICAL ERROR: YOUTUBE_API_KEY environment variable is missing on Render!");
      return;
    }

    // Step A: Exchange the Video ID for the live chat channel ID
    const videoRes = await axios.get(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`);
    const activeChatId = videoRes.data.items[0]?.liveStreamingDetails?.activeLiveChatId;
    
    if (!activeChatId) {
      console.log(`Could not find an active live chat for YouTube Video ID: ${videoId}. Make sure the stream is actually LIVE.`);
      return;
    }

    console.log(`Found YouTube Live Chat ID for ${channel}: ${activeChatId}`);
    let nextPageToken = '';
    
    // Step B: Poll the YouTube live chat every 4 seconds
    const intervalId = setInterval(async () => {
      try {
        let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeChatId}&part=snippet&key=${YOUTUBE_API_KEY}`;
        if (nextPageToken) url += `&pageToken=${nextPageToken}`;

        const chatRes = await axios.get(url);
        nextPageToken = chatRes.data.nextPageToken;

        const messages = chatRes.data.items || [];
        messages.forEach(item => {
          const msgText = item.snippet?.displayMessage?.trim();
          if (['1', '2', '3', '4'].includes(msgText) && channelsData[channel]) {
            channelsData[channel].push(parseInt(msgText));
          }
        });
      } catch (err) {
        console.error(`Error fetching YouTube messages for ${channel}:`, err.message);
      }
    }, 4000);

    activeYtLoops[channel] = intervalId;

  } catch (err) {
    console.error(`Failed to initialize YouTube chat tracker for ${channel}:`, err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Secure, multi-platform server live on port ${PORT}`);
});
