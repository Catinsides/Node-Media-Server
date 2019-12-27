const context = require("../node_core_ctx");
const Logger = require("../node_core_logger");
const { RtpPacket, mkfifoSync } = require("./helper");
const { spawn } = require("child_process");
const { unlinkSync, openSync, closeSync, createWriteStream } = require('fs');
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
        this.PIPESFOLDER = config.s1078.pipes_folder;
        this.audioProcess = null;
        // this.videoProcess = null;
        this.ffmpegProcess = null;
        this.audioFifoConf = null;
        this.videoFifoConf = null;
        context.channels.set(this.id, this);
        this.debug = false;
    }

    pushPacket(buff) {
        var rtpPacket = new RtpPacket(buff);
        if (rtpPacket && rtpPacket.isValid) {
            this.rtpPackets.push(rtpPacket);
        }
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
        this.stopProcess(this.audioProcess);
        this.stopProcess(this.ffmpegProcess);
        // this.stopProcess(this.videoProcess);
        this.closeFifo(this.audioFifoConf);
        this.closeFifo(this.videoFifoConf);

        // if (this.isStreaming) {
        //     this.isStreaming = false;
            Logger.log(`[1078 channel closed] id=${this.id}`);
            context.nodeEvent.emit("1078 channel closed", this.id, {});
            context.channels.delete(this.id);
        // }
    }

    dispatch(rtpPacket) {
        this.initFFmpeg();
        if (rtpPacket.isAudioFrame) {
            this.audioHandler(rtpPacket);
        } else if (rtpPacket.isVedioFrame) {
            this.videoHandler(rtpPacket);
        }
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

            if (this.ffmpegProcess) {
                if (!this.audioFifoConf.fwStream) {
                    this.audioFifoConf.fwStream = createWriteStream(this.audioFifoConf.path);
                }
                this.audioProcess.stdout.pipe(this.audioFifoConf.fwStream);
            }
            if (this.debug) {
                this.audioProcess.stderr.on('data', data => {
                    console.log(data.toString());
                });
            }
        }

        this.audioProcess.stdin.write(rtpPacket.payload);
    }

    videoHandler(rtpPacket) {
        if (this.ffmpegProcess) {
            if (!this.videoFifoConf.fwStream) {
                this.videoFifoConf.fwStream = createWriteStream(this.videoFifoConf.path);
            }
            this.videoFifoConf.fwStream.write(rtpPacket.payload);
        }
    }

    initFFmpeg() {
        if (!this.videoFifoConf) {
            var path = mkfifoSync(`${this.PIPESFOLDER}/video_${this.id}`);
            this.videoFifoConf = {
                path,
                fd: openSync(path, 'r+'),
            };
        }
        if (!this.audioFifoConf) {
            var path = mkfifoSync(`${this.PIPESFOLDER}/audio_${this.id}`);
            this.audioFifoConf = {
                path,
                fd: openSync(path, 'r+'),
            };
        }
        if (!this.ffmpegProcess) {
            var audioFifo = this.audioFifoConf.path;
            var videoFifo = this.videoFifoConf.path;
            var cmds = [
                '-loglevel', 'panic',
                '-probesize', '32',
                '-re',
                '-r', '16',
                '-f', 'h264',
                '-i', videoFifo,
                '-f', 'mp3',
                '-i', audioFifo,
                '-map', '0:v',
                '-map', '1:a',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-strict', '-2',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                // '-profile:v', 'baseline',
                '-f', 'flv',
                this.publishStreamPath
            ];

            this.ffmpegProcess = spawn(this.FFMPEG, cmds);

            if (this.debug) {
                this.ffmpegProcess.stderr.on('data', data => {
                    console.log(data.toString());
                });
            }
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
            var { fd, path, fwStream } = fifoConf;
            if (fd >= 0) {
                closeSync(fd);
            }
            if (path && typeof path === 'string') {
                unlinkSync(path)
            }
            if (fwStream) {
                fwStream.destroy();
            }
        }
        fifoConf = null;
    }
}

module.exports = Node1078Channel;
