const context = require("../node_core_ctx");
const Logger = require("../node_core_logger");
// const AMF = require("./node_core_amf");
const { RtpPacket, mkfifoSync } = require("./helper");
const { spawn } = require("child_process");
const { appendFileSync, unlinkSync, openSync, closeSync, existsSync, mkdirSync } = require('fs');
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
        this.audioProcess = null;
        // this.videoProcess = null;

        this.ffmpegProcess = null;
        this.audioFifoConf = null;
        this.videoFifoConf = null;

        context.channels.set(this.id, this);
        this.debug = true;
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
        // this.stopProcess(this.audioProcess);
        // this.stopProcess(this.videoProcess);
        // this.stopProcess(this.ffmpegProcess);

        // this.closeFifo(this.audioFifoConf);
        this.closeFifo(this.videoFifoConf);

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
        this.initFFmpeg();
    }

    audioHandler(rtpPacket) {
        if (!this.audioProcess) {
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
            this.audioProcess = spawn(this.FFMPEG, cmds);
            this.audioProcess.stdout.on('data', data => {
                if (this.audioFifoConf.fd < 0) {
                    this.audioFifoConf.fd = openSync(this.audioFifoConf.path, 'w');
                }
                appendFileSync(this.audioFifoConf.path, data);
            });
        }

        this.audioProcess.stdin.write(rtpPacket.payload);
    }

    videoHandler(rtpPacket) {
        if (this.ffmpegProcess) {
            if (this.videoFifoConf.fd < 0) {
                this.videoFifoConf.fd = openSync(this.videoFifoConf.path, 'w');
            }
            appendFileSync(this.videoFifoConf.path, rtpPacket.payload);
        }
    }

    initFFmpeg() {
        if (!this.ffmpegProcess) {
            // if (!this.audioFifoConf) {
            //     this.audioFifoConf = {
            //         fd: -1,
            //         path: ''
            //     };
            // }
            // if (!this.audioFifoConf.path) {
            //     var path = `/tmp/fifotest/audio_${this.id}`;
            //     mkfifoSync(path);
            //     this.audioFifoConf.path = path;
            // }
            if (!this.videoFifoConf) {
                this.videoFifoConf = {
                    fd: -1,
                    path: ''
                };
            }
            if (!this.videoFifoConf.path) {
                var path = `/tmp/fifotest/video_${this.id}`;
                mkfifoSync(path);
                this.videoFifoConf.path = path;
            }

            // var audioFifo = this.audioFifoConf.path;
            var videoFifo = this.videoFifoConf.path;
            var cmds = [
                // '-probesize', '32',
                '-re',
                '-f', 'h264',
                '-i', videoFifo,
                // '-f', 'mp3',
                // '-i', audioFifo,
                // '-map', '0:v',
                // '-map', '1:a',
                '-c:v', 'copy',
                // '-c:a', 'copy',
                // '-preset', 'ultrafast',
                // '-tune', 'zerolatency',
                // '-profile:v', 'baseline',
                '-f', 'flv',
                this.publishStreamPath
            ];
            this.ffmpegProcess = spawn(this.FFMPEG, cmds);

            // if (this.debug) {
            //     this.ffmpegProcess.stderr.on('data', data => {
            //         console.log(data.toString());
            //     });
            // }
        }
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

    closeFifo(fifoConf) {
        if (fifoConf) {
            var { fd, path } = fifoConf;
            if (fd >= 0) {
                closeSync(fd);
            }
            if (path && typeof path === 'string') {
                unlinkSync(path)
            }
        }
        fifoConf = null;
    }
}

module.exports = Node1078Channel;
