const context = require("../node_core_ctx");
const Logger = require("../node_core_logger");
// const AMF = require("./node_core_amf");
const { RtpPacket } = require("./helper");
const { spawn } = require("child_process");
const os = require('os');

class Node1078Channel {
    constructor(config) {
        this.config = config;
        this.SIMNO = config.simNo;
        this.channelNo = config.channelNo;
        this.stream_id = config.stream_id;
        this.id = this.stream_id;
        // this.isStreaming = false;
        this.localhost = os.networkInterfaces().eth0[0].address;
        this.port = this.config.rtmp.port;
        this.publishStreamPath = `rtmp://${this.localhost}:${this.port}/live/stream_${this.stream_id}`
        this.rtpPacket = {
            payload: Buffer.alloc(0)
        };
        this.rtpPackets = [];
        this.FFMPEG = config.s1078.ffmpeg;
        this.audio_process = null;
        this.video_process = null;
        context.channels.set(this.id, this);
    }

    pushPacket(buff) {
        var rtpPacket = RtpPacket.create(buff);
        this.rtpPackets.push(rtpPacket);
    }

    run() {
        while (this.rtpPackets.length > 0) {
            let rtpPacket = this.rtpPackets.shift();
            let { frameTypeVal: { pt }} = rtpPacket;

            if (pt === 0) {
                this.dispatch(rtpPacket);
            } else {
                if (pt === 1) {    // first
                    this.rtpPacket = rtpPacket;
                } else if (pt === 2) {    // last
                    this.rtpPacket.payload = Buffer.concat([this.rtpPacket.payload, rtpPacket.payload]);
                    this.dispatch(this.rtpPacket);
                } else if (pt === 3) {    // middle
                    this.rtpPacket.payload = Buffer.concat([this.rtpPacket.payload, rtpPacket.payload]);
                }
            }
        }
    }
    
    stop() {
        // this.stopProcess(this.audio_process);
        this.stopProcess(this.video_process);

        // if (this.isStreaming) {
        //     this.isStreaming = false;
            Logger.log(`[1078 channel closed] id=${this.id}`);
            context.nodeEvent.emit("1078 channel closed", this.id, {});
            context.channels.delete(this.id);
        // }
    }

    dispatch(rtpPacket) {
        if (rtpPacket.isAudioFrame) {
            // this.audioHandler(rtpPacket);
        } else if (rtpPacket.isVedioFrame) {
            this.videoHandler(rtpPacket);
        }
    }

    audioHandler(rtpPacket) {
        if (!this.audio_process) {
            var cmds = [
                '-loglevel', 'panic',
                '-probesize', '32',
                '-f', 'g726le',
                '-code_size', '5',
                '-ar', '8000',
                '-ac', '1',
                '-i', '-',
                '-ar', '44100',
                '-acodec', 'libmp3lame',
                '-f', 'mp3',
                'pipe:1'
            ];
            this.audio_process = spawn(this.FFMPEG, cmds);
        }
        this.audio_process.stdin.write(rtpPacket.payload);
    }

    videoHandler(rtpPacket) {
        if (!this.video_process) {
            var cmds = [
                '-loglevel', 'panic', // 'debug',
                '-probesize', '32',
                '-re',
                '-r', '16',
                '-i', '-',
                '-an',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-profile:v', 'baseline',
                '-f', 'flv',
                this.publishStreamPath
            ];
            this.video_process = spawn(this.FFMPEG, cmds);
            Logger.log(`[1078 channel new publish] id=${this.id}`, this.publishStreamPath);
        }
        this.video_process.stdin.write(rtpPacket.payload);
    }

    stopProcess(_processes) {
        if (_processes) {
            _processes.stdin.pause();
            _processes.stdin.end();
            _processes.stdin.destroy();
            _processes.stdout.destroy();
            _processes.kill('SIGKILL');
            _processes = null;
        }
    }
}

module.exports = Node1078Channel;
