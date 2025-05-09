const fs = require('fs');
const fetch = require('node-fetch');

const API_KEY = 'AIzaSyAgYUMUXA028wMrLBtOKUkKTAP1hcGvo9g';
const CHANNEL_ID = 'UChbP2uSuYhhyDw9lDN8Vwog';
const MAX_RESULTS = 10;

async function updateVideosJson() {
  const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${CHANNEL_ID}&part=snippet&order=date&maxResults=${MAX_RESULTS}`;
  const res = await fetch(url);
  const data = await res.json();

  const videos = data.items
    .filter(item => item.id.kind === 'youtube#video')
    .map(item => ({
      title: item.snippet.title,
      id: item.id.videoId
    }));

  fs.writeFileSync('videos.json', JSON.stringify(videos, null, 2), 'utf-8');
  console.log('✅ videos.json 생성 완료');
}

updateVideosJson(); 