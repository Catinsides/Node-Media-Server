const context = require("../node_core_ctx");
const Logger = require("../node_core_logger");
const { RtpPacket, StreamInput } = require("./helper");
const { spawn } = require("child_process");
const stream = require('stream');

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
        this.rtpPacket = {
            payload: Buffer.alloc(0)
        };
        this.rtpPackets = [];
        this.FFMPEG = config.s1078.ffmpeg;
        this.PIPESFOLDER = config.s1078.pipes_folder;
        this.ffmpegProcess = null;
        this.audioFifoConf = null;
        this.videoFifoConf = null;
        context.channels.set(this.id, this);
    }

    pushPacket(buff) {
        var rtpPacket = new RtpPacket(buff);
        if (rtpPacket && rtpPacket.isValid) {
            this.rtpPackets.push(rtpPacket);
        }
    }

    consume() {
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
        this.closeFifo(this.audioFifoConf);
        this.closeFifo(this.videoFifoConf);
        this.stopProcess(this.ffmpegProcess);

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
        if (this.ffmpegProcess && this.audioFifoConf) {
            this.audioFifoConf.fwStream.write(rtpPacket.payload);
        }
    }

    videoHandler(rtpPacket) {
        if (this.ffmpegProcess && this.videoFifoConf) {
            this.videoFifoConf.fwStream.write(rtpPacket.payload);
        }
    }

    // 暂音频只支持g711a
    initFFmpeg() {
        if (!this.videoFifoConf) {
            let path = `${this.PIPESFOLDER}/video_${this.id}.sock`;
            this.videoFifoConf = {
                path,
                fwStream: new stream.PassThrough(),
            };
            this.videoFifoConf.url = StreamInput(path, this.videoFifoConf.fwStream).url;
        }
        if (!this.audioFifoConf) {
            let path = `${this.PIPESFOLDER}/audio_${this.id}.sock`;
            this.audioFifoConf = {
                path,
                fwStream: new stream.PassThrough(),
            };
            this.audioFifoConf.url = StreamInput(path, this.audioFifoConf.fwStream).url;
        }

        if (!this.ffmpegProcess) {
            var audioFifo = this.audioFifoConf.url;
            var videoFifo = this.videoFifoConf.url;
            var cmds = [
                '-loglevel', 'debug',
                '-probesize', '32',
                '-re',
                '-r', '16',
                '-f', 'h264',
                '-i', videoFifo,
                '-f', 'alaw',
                '-ar', '8000',
                '-ac', '1',
                '-i', audioFifo,
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
            //     console.log(data.toString());
            // });
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
            var { path, fwStream } = fifoConf;
            if (fwStream) {
                fwStream.pause();
                fwStream.end();
                fwStream.destroy();
            }
        }
        fifoConf = null;
    }
}

module.exports = Node1078Channel;
