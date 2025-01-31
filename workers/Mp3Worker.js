importScripts("/../encoders/Mp3Encoder.min.js");

let NUM_CH = 2, // constant
    sampleRate = 44100,
    options = undefined,
    maxBuffers = undefined,
    bufferSize = undefined,
    encoder = undefined,
    recBuffers = undefined,
    chunkSec = 10,
    bufferCount = 0;

function error(message) {
  self.postMessage({ command: "error", message: "mp3: " + message });
}

function init(data) {
  if (data.config.numChannels === NUM_CH) {
    sampleRate = data.config.sampleRate;
    options = data.options;
  } else
    error("numChannels must be " + NUM_CH);
};

function setOptions(opt) {
  if (encoder || recBuffers)
    error("cannot set options during recording");
  else
    options = opt;
}

function start(BFSZ) {
  bufferSize = BFSZ;
  maxBuffers = Math.ceil(options.timeLimit * sampleRate / bufferSize);
  if (options.encodeAfterRecord)
    recBuffers = [];
  else
    encoder = new Mp3LameEncoder(sampleRate, options.mp3.bitRate);
}

function record(buffer) {
  if (bufferCount++ < maxBuffers)
    if (encoder)
      encoder.encode(buffer);
    else
      recBuffers.push(buffer);
  else
    self.postMessage({ command: "timeout" });
};

function postProgress(progress) {
  self.postMessage({ command: "progress", progress: progress });
};

function finish(saveChunk) {
  if (recBuffers) {
    postProgress(0);
    encoder = new Mp3LameEncoder(sampleRate, options.mp3.bitRate);
    let timeout = Date.now() + options.progressInterval;
    // save part of it
    if (saveChunk) {
      var chunkSize = Math.ceil(chunkSec * sampleRate / bufferSize); // 10 sec
      var tempRecBuffers = recBuffers.slice(Math.max(recBuffers.length-chunkSize,0),recBuffers.length);
      recBuffers = [...tempRecBuffers];
      while(tempRecBuffers.length > 0) {
        encoder.encode(tempRecBuffers.shift());
      }
      self.postMessage({
        command: "chunkComplete",
        blob: encoder.finish(options.wav.mimeType)
      });    
      encoder = undefined;
      bufferCount = recBuffers.length;
      postProgress(1);
      return
    }
    
    while (recBuffers.length > 0) {
      encoder.encode(recBuffers.shift());
      let now = Date.now();
      if (now > timeout) {
        postProgress((bufferCount - recBuffers.length) / bufferCount);
        timeout = now + options.progressInterval;
      }
    }
    postProgress(1);
  }
  self.postMessage({
    command: "complete",
    blob: encoder.finish(options.mp3.mimeType)
  });
  cleanup();
};

function cleanup() {
  encoder = recBuffers = undefined;
  bufferCount = 0;
}

self.onmessage = function(event) {
  let data = event.data;
  switch (data.command) {
    case "init":    init(data);                 break;
    case "options": setOptions(data.options);   break;
    case "start":   start(data.bufferSize);     break;
    case "record":  record(data.buffer);        break;
    case "saveChunk":finish(true);               break;
    case "finish":  finish();                   break;
    case "cancel":  cleanup();
  }
};

self.postMessage({ command: "loaded" });
