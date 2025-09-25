const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const app = express();
const port = 3000;

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

app.use(express.static('public'));
app.use(express.json());

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Stream YouTube audio directly
app.get('/stream', async (req, res) => {
    const videoURL = req.query.url;
    
    if (!videoURL) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        // Validate YouTube URL
        if (!ytdl.validateURL(videoURL)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        // Get video info
        const info = await ytdl.getInfo(videoURL);
        const title = info.videoDetails.title;
        
        // Set response headers for audio streaming
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `inline; filename="${title}.mp3"`);
        res.setHeader('Transfer-Encoding', 'chunked');

        // Get the best audio format
        const audioFormat = ytdl.chooseFormat(info.formats, { 
            quality: 'highestaudio',
            filter: 'audioonly'
        });

        if (!audioFormat) {
            return res.status(400).json({ error: 'No audio format found' });
        }

        // Stream audio and convert to MP3 on the fly
        const audioStream = ytdl(videoURL, { format: audioFormat });
        
        ffmpeg(audioStream)
            .audioCodec('libmp3lame')
            .format('mp3')
            .audioBitrate(128)
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Audio processing error' });
                }
            })
            .pipe(res, { end: true });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to process video' });
    }
});

// Get video info
app.get('/info', async (req, res) => {
    const videoURL = req.query.url;
    
    if (!videoURL) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        if (!ytdl.validateURL(videoURL)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const info = await ytdl.getInfo(videoURL);
        res.json({
            title: info.videoDetails.title,
            duration: info.videoDetails.lengthSeconds,
            thumbnail: info.videoDetails.thumbnails[0].url,
            author: info.videoDetails.author.name
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to get video info' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});