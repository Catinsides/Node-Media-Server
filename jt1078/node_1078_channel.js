const context = require("../node_core_ctx");
const Logger = require("../node_core_logger");
const { RtpPacket, StreamInput } = require("./helper");
const { spawn } = require("child_process");
const stream = require('stream');

class InputStream extends stream.Transform {
    constructor(opts) {
        super({
            writableObjectMode: true,
        });
        this.path = opts.path;
        this.type = opts.type;
        this.url = StreamInput(this.path, this).url;
        this.isWritable = true;
        this.timer = setTimeout(() => { this.onTimeout(); }, 1500);
    }

    _transform(chunk, encoding, callback){
        this.push(chunk);
        this.isWritable = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.onTimeout(); }, 1500);
        callback();
    }
    
    _flush(callback){
        callback();
    }

    onTimeout() {
        this.isWritable = false;
        this.emit('transevent', 'timeout', this);
        this.stop();
    }

    stop() {
        this.isWritable = false;
        this.end();
    }
}

class Node1078Channel {
    constructor(config) {
        this.config = config;
        this.SIMNO = config.simNo;
        this.channelNo = config.channelNo;
        this.stream_id = config.stream_id;
        this.id = this.stream_id;
        // this.isStreaming = false;
        this.port = this.config.rtmp.port;
        this.publishStreamPath = `rtmp://*:${this.port}/live/stream_${this.stream_id}`
        this.FFMPEG = config.s1078.ffmpeg;
        this.PIPESFOLDER = config.s1078.pipes_folder;
        this.ffmpegProcess = null;
        this.createProcess();
        context.channels.set(this.id, this);
    }

    createAudioProcess() {
        var audioSock = this.audioInputStream.url;
        var cmds = [
            '-loglevel', 'debug',
            '-probesize', '32',
            '-re',
            '-f', 'alaw',
            '-ar', '8000',
            '-ac', '1',
            '-i', audioSock,
            '-vn',
            '-c:a', 'aac',
            '-strict', 'experimental',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-f', 'flv',
            this.publishStreamPath
        ];
        var p = spawn(this.FFMPEG, cmds);
        // p.stderr.on('data', data => {
        //     console.log('==createAudioProcess==', data.toString());
        // });
        p.on('error', err => {
            console.log(err);
            this.stop();
        });
        return p;
    }

    createVideoProcess() {
        var videoSock = this.videoInputStream.url;
        var cmds = [
            '-loglevel', 'debug',
            '-probesize', '32',
            '-re',
            '-r', '16',
            '-i', videoSock,
            '-an',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-profile:v', 'baseline',
            '-f', 'flv',
            this.publishStreamPath
        ];
        var p = spawn(this.FFMPEG, cmds);
        // p.stderr.on('data', data => {
        //     console.log('==createVideoProcess==', data.toString());
        // });
        p.on('error', err => {
            console.log(err);
            this.stop();
        });
        return p;
    }

    createProcess() {
        this.videoInputStream = new InputStream({
            type: 'video',
            path: `${this.PIPESFOLDER}/video_${this.id}.sock`,
        });
        this.audioInputStream = new InputStream({
            type: 'audio',
            path: `${this.PIPESFOLDER}/audio_${this.id}.sock`,
        });

        this.videoInputStream.on("transevent", this.onTransEvent.bind(this));
        this.audioInputStream.on("transevent", this.onTransEvent.bind(this));

        var videoSock = this.videoInputStream.url;
        var audioSock = this.audioInputStream.url;
        var cmds = [
            '-loglevel', 'debug',
            '-probesize', '32',
            '-re',
            '-r', '16',
            '-f', 'h264',
            '-i', videoSock,
            '-f', 'alaw',
            '-ar', '8000',
            '-ac', '1',
            '-i', audioSock,
            '-map', '0:v',
            '-map', '1:a',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-strict', 'experimental',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-f', 'flv',
            this.publishStreamPath
        ];

        this.ffmpegProcess = spawn(this.FFMPEG, cmds);
        // this.ffmpegProcess.stderr.on('data', data => {
        //     console.log('==createProcess==', data.toString());
        // });
        this.ffmpegProcess.on('error', err => {
            console.log(err);
            this.stop();
        });
    }

    onTransEvent(event, stream) {
        if (event == 'timeout') {
            let { type } = stream;
            this.stopProcess(this.ffmpegProcess);
            if (type == 'video') {
                if (this.audioInputStream && this.audioInputStream.isWritable) {
                    this.createAudioProcess();                    
                }
            } else if (type == 'audio') {
                if (this.videoInputStream && this.videoInputStream.isWritable) {
                    this.createVideoProcess();
                }
            }
        }
    }

    consume(buff) {
        var rtpPacket = new RtpPacket(buff);
        var { isAudioFrame, isVedioFrame, payload } = rtpPacket;

        if (isAudioFrame && this.audioInputStream && this.audioInputStream.isWritable) {
            this.audioInputStream.write(payload);
        }
        if (isVedioFrame && this.videoInputStream && this.videoInputStream.isWritable) {
            this.videoInputStream.write(payload);
        }
    }

    // FIXME: read ECONNRESET
    stop() {
        if (this.audioInputStream) {
            this.audioInputStream.stop();
        }
        if (this.videoInputStream) {
            this.videoInputStream.stop();
        }
        this.stopProcess(this.ffmpegProcess);
        Logger.log(`[1078 channel closed] id=${this.id}`);
        context.nodeEvent.emit("1078 channel closed", this.id, {});
        context.channels.delete(this.id);
    }

    stopProcess(_processes) {
        if (_processes) {
            _processes.kill('SIGKILL');
            _processes = null;
        }
    }

}

module.exports = Node1078Channel;
