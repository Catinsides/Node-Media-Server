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
        this.publishStreamPath = `rtmp://${this.localhost}:${this.config.rtmp.port}/live/stream_${this.stream_id}`
        this.rtpPacket = null;
        this.rtpPackets = [];
        this.FFMPEG = config.s1078.ffmpeg;

        this.audio_process = [];
        this.video_process = null;
        this.merge_process = {
            type: '',
            process: null
        };

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
        this.closeProcess(this.audio_process);
        this.closeProcess(this.video_process);
        if (this.merge_process.process) {
            this.closeProcess(this.merge_process.process);
            this.merge_process.type = '';
        }

        // if (this.isStreaming) {
        //     this.isStreaming = false;
            Logger.log(`[1078 channel closed] id=${this.id}`);
            context.nodeEvent.emit("1078 channel closed", this.id, {});
            context.channels.delete(this.id);
        // }
    }

    dispatch(rtpPacket) {
        if (rtpPacket.isAudioFrame) {
            this.audioHandler(rtpPacket);
        } else if (rtpPacket.isVedioFrame) {
            this.videoHandler(rtpPacket);
        }
        this.mergeHandler();
    }

    audioHandler(rtpPacket) {
        if (this.audio_process.length === 0) {
            let cmds1 = [
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
            let cmds2 = [
                '-i', '-',
                '-vn',
                '-c', 'copy',
                '-f', 'flv',
                this.publishStreamPath + '_a'
            ];

            let child1 = spawn(this.FFMPEG, cmds1);
            let child2 = spawn(this.FFMPEG, cmds2);

            child1.stdin.write(rtpPacket.payload);
            child1.stdout.pipe(child2.stdin);
            this.audio_process = [child1, child2];
            this.audio_process.on('exit', _ => {
                // this.closeProcess(this.audio_process);
            });
            Logger.log(`[1078 channel new audio publish] id=${this.id}`, this.publishStreamPath + '_a');
        }

        let [ child1, child2 ] = this.audio_process;
        child1.stdin.write(rtpPacket.payload);
    }

    videoHandler(rtpPacket) {
        if (!this.video_process) {
            let cmds = [
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
                this.publishStreamPath + '_v'
            ];
            this.video_process = spawn(this.FFMPEG, cmds);
            this.video_process.on('exit', _ => {
                // this.closeProcess(this.video_process);
            });
            Logger.log(`[1078 channel new video publish] id=${this.id}`, this.publishStreamPath + '_v');
        }

        this.video_process.stdin.write(rtpPacket.payload);
    }

    mergeHandler(rtpPacket) {
        var isOnlyAudio = this.audio_process.length === 2 && this.video_process == null,
            isOnlyVideo = this.audio_process.length === 0 && this.video_process != null,
            isBoth = this.audio_process.length === 2 && this.video_process != null;
        var rtmpUrl = this.publishStreamPath, cmds = [], type = '';
        var url_a = this.publishStreamPath + '_a', url_v = this.publishStreamPath + '_v';

        if (isBoth) {
            if (this.merge_process.type === 'a' || this.merge_process.type === 'v') {
                this.closeProcess(this.merge_process.process);
                this.merge_process.type = '';
            }

            type = 'av';
            cmds = [
                '-loglevel', 'panic',
                '-probesize', '32',
                '-i', url_a,
                '-i', url_v,
                '-codec:v', 'copy',
                '-ac', '2',
                '-codec:a', 'aac',
                '-strict', '-2',
                '-f', 'flv',
                rtmpUrl
            ];
        } else if (isOnlyAudio) {
            if (this.merge_process.type === '') {
                type = 'a';
                cmds = [
                    '-loglevel', 'panic',
                    '-probesize', '32',
                    '-i', url_a,
                    '-codec:v', 'copy',
                    '-ac', '2',
                    '-codec:a', 'aac',
                    '-strict', '-2',
                    '-f', 'flv',
                    rtmpUrl
                ];
            }
        } else if (isOnlyVideo) {
            if (this.merge_process.type === '') {
                type = 'v';
                cmds = [
                    '-loglevel', 'panic',
                    '-probesize', '32',
                    '-i', url_v,
                    '-codec:v', 'copy',
                    '-ac', '2',
                    '-codec:a', 'aac',
                    '-strict', '-2',
                    '-f', 'flv',
                    rtmpUrl
                ];
            }
        }
        if (cmds.length > 0 && this.merge_process.type === '') {
            this.merge_process.type = type;
            this.merge_process.process = spawn(this.FFMPEG, cmds);
        }
    }

    closeProcess(_processes) {
        if (Array.isArray(_processes)) {
            _processes.forEach(pr => {
                this._closeProcess(pr);
            });
            _processes = [];
        } else {
            this._closeProcess(_processes);
            _processes = null;
        }
    }

    _closeProcess(_process) {
        if (_process) {
            _process.stdin.pause();
            _process.stdin.end();
            _process.stdin.destroy();
            _process.stdout.destroy();
            _process.kill('SIGKILL');
        }
    }

}

module.exports = Node1078Channel;
