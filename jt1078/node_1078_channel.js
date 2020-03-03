const context = require("../node_core_ctx");
const Logger = require("../node_core_logger");
const { RtpPacket, redisClient, StreamInput } = require("./helper");
const stream = require('stream');
const { createFactory } = require('./factory');

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
        this.init();
        context.channels.set(this.id, this);
    }

    init() {
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
        this.factory = createFactory({
            ffmpeg: this.FFMPEG,
            videoInput: this.videoInputStream.url,
            audioInput: this.audioInputStream.url,
            output: this.publishStreamPath,
        });

        if (!this.config.s1078.redis) {
            this.createProcess();
            return;
        }

        this.connectRedis(this.config.s1078.redis, err => {
            if (err) {
                Logger.error(err);
                this.createProcess();
                return;
            }

            var key = 'NMS:1078:FFMPEG:CMDS:H';
            this.redisClient.hget(key, this.SIMNO, (err, res) => {
                if (err || !res) {
                    if (err) Logger.error(err);
                    this.createProcess();
                    return;
                }

                try {
                    var cmds = JSON.parse(res);
                } catch (e) {
                    Logger.error(err);
                    this.createProcess();
                    return;
                }

                var { main, audio, video } = cmds;
                this.mainCmds = main;
                this.audioCmds = audio;
                this.videoCmds = video;
                this.createProcess();
            });
        });
    }

    connectRedis(config, callback) {
        var { host, port, pwd } = config;
        var hasCallback = false;
        var timer = setTimeout(() => {
            hasCallback = true;
            callback(new Error('Redis connection timeout.'));
        }, 100);

        this.redisClient = redisClient(port, host, pwd);
        this.redisClient.on('connect', _ => {
            if (hasCallback) return;
            clearTimeout(timer);
            return callback();
        });
        this.redisClient.on('error', err => {
            if (hasCallback) return;
            Logger.error(err);
            return callback(err);
        });
    }

    createAudioProcess() {
        var cmds = this.audioCmds ? this.audioCmds : null;
        var p = this.factory.g711a(cmds);
        p.on('error', err => {
            Logger.error(err);
            this.stop();
        });
        this.ffmpegProcess = p;
    }

    createVideoProcess() {
        var cmds = this.videoCmds ? this.videoCmds : null;
        var p = this.factory.h264(cmds);
        p.on('error', err => {
            Logger.error(err);
            this.stop();
        });
        this.ffmpegProcess = p;
    }

    createProcess() {
        var cmds = this.mainCmds ? this.mainCmds : null;
        var p = this.factory.dflt(cmds);
        p.on('error', err => {
            Logger.error(err);
            this.stop();
        });
        this.ffmpegProcess = p;
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
            _processes.stdin.destroy();
            _processes.stdout.destroy();
            _processes.kill('SIGKILL');
            _processes = null;
        }
    }

}

module.exports = Node1078Channel;
