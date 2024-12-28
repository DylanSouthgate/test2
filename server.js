const express = require('express');
const torrentStream = require('torrent-stream');

const app = express();
const port = process.env.PORT || 3000; // Use PORT from Render environment, fallback to 3000

// Endpoint to stream video files
app.get('/stream', (req, res) => {
  const magnetURI = req.query.magnet;
  if (!magnetURI) {
    return res.status(400).send('Magnet link is required');
  }

  const engine = torrentStream(magnetURI, {
    connections: 100, // Increase connections for faster downloading
    uploads: 0,       // Disable uploading for speed
    storage: false,   // No disk storage
  });

  let file; // Video file to stream

  engine.on('ready', () => {
    // Filter for video files (.mkv or .mp4)
    file = engine.files.find((f) => f.name.endsWith('.mkv') || f.name.endsWith('.mp4'));

    if (!file) {
      engine.destroy();
      return res.status(404).send('No supported video file (.mkv or .mp4) found in the torrent');
    }

    console.log(`Streaming file: ${file.name} (${file.length} bytes)`);

    // Prioritize the file and start downloading
    file.select();

    // Handle range requests for smooth streaming
    const range = req.headers.range;
    const fileSize = file.length;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4',
      });

      const stream = file.createReadStream({ start, end });
      stream.pipe(res);

      stream.on('end', () => {
        console.log('Streaming finished.');
        engine.destroy(); // Cleanup
      });
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4',
      });

      const stream = file.createReadStream();
      stream.pipe(res);

      stream.on('end', () => {
        console.log('Streaming finished.');
        engine.destroy(); // Cleanup
      });
    }
  });

  engine.on('download', (pieceIndex) => {
    console.log(`Downloading piece: ${pieceIndex}`);
  });

  engine.on('error', (err) => {
    console.error('Torrent error:', err);
    engine.destroy(); // Cleanup
    res.status(500).send('Error streaming torrent');
  });

  // Cleanup if the client disconnects
  req.on('close', () => {
    console.log('Client disconnected. Cleaning up...');
    engine.destroy();
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Torrent Stream Server is running!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
