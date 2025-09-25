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

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Stream YouTube audio directly
app.get('/stream', async (req, res) => {
    const videoURL = req.query.url;
    
    console.log('Stream request for URL:', videoURL);
    
    if (!videoURL) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        // Validate YouTube URL
        if (!ytdl.validateURL(videoURL)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        // Get video info with better error handling
        const info = await ytdl.getInfo(videoURL).catch(err => {
            console.error('Error getting video info:', err.message);
            throw new Error(`Failed to get video info: ${err.message}`);
        });
        
        const title = info.videoDetails.title;
        
        // Set response headers for audio streaming
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(title)}.mp3"`);
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache');

        // Get available formats
        console.log('Available formats:', info.formats.map(f => ({
            itag: f.itag,
            hasAudio: f.hasAudio,
            hasVideo: f.hasVideo,
            mimeType: f.mimeType
        })));

        // Try to find the best audio format
        let audioFormat = ytdl.chooseFormat(info.formats, { 
            quality: 'highestaudio',
            filter: 'audioonly'
        });

        // If no audio-only format found, try formats with audio
        if (!audioFormat) {
            audioFormat = ytdl.chooseFormat(info.formats, { 
                quality: 'lowest',
                filter: format => format.hasAudio
            });
        }

        if (!audioFormat) {
            throw new Error('No suitable audio format found');
        }

        console.log('Selected format:', audioFormat);

        // Stream audio with error handling
        const audioStream = ytdl(videoURL, { 
            format: audioFormat,
            quality: 'highestaudio'
        });

        audioStream.on('error', (err) => {
            console.error('YouTube stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error: ' + err.message });
            }
        });

        // Convert to MP3
        ffmpeg(audioStream)
            .audioCodec('libmp3lame')
            .format('mp3')
            .audioBitrate(128)
            .on('start', (commandLine) => {
                console.log('FFmpeg started with command: ' + commandLine);
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Audio processing error: ' + err.message });
                }
            })
            .on('end', () => {
                console.log('Audio stream finished');
            })
            .pipe(res, { end: true });

    } catch (error) {
        console.error('Stream endpoint error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to process video',
                details: error.message 
            });
        }
    }
});

// Get video info with enhanced error handling
app.get('/info', async (req, res) => {
    const videoURL = req.query.url;
    
    console.log('Info request for URL:', videoURL);
    
    if (!videoURL) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        // Basic URL validation
        if (!videoURL.includes('youtube.com') && !videoURL.includes('youtu.be')) {
            return res.status(400).json({ error: 'Please enter a valid YouTube URL' });
        }

        if (!ytdl.validateURL(videoURL)) {
            return res.status(400).json({ error: 'Invalid YouTube URL format' });
        }

        // Get video info with timeout
        const info = await Promise.race([
            ytdl.getInfo(videoURL),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), 10000)
            )
        ]);

        const videoDetails = info.videoDetails;
        
        res.json({
            title: videoDetails.title,
            duration: videoDetails.lengthSeconds,
            thumbnail: videoDetails.thumbnails[0]?.url,
            author: videoDetails.author?.name || 'Unknown',
            description: videoDetails.description,
            viewCount: videoDetails.viewCount
        });

    } catch (error) {
        console.error('Info endpoint error:', error.message);
        
        // More specific error messages
        if (error.message.includes('Request timeout')) {
            res.status(408).json({ error: 'Request timeout - YouTube may be blocking the request' });
        } else if (error.message.includes('Invalid parameters')) {
            res.status(400).json({ error: 'Invalid video URL or parameters' });
        } else if (error.message.includes('Video unavailable')) {
            res.status(404).json({ error: 'Video unavailable or private' });
        } else {
            res.status(500).json({ 
                error: 'Failed to get video information',
                details: error.message 
            });
        }
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Make sure you have a stable internet connection`);
});
