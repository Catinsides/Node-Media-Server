const { spawn } = require("child_process");
const Logger = require("../node_core_logger");

class FFmpegFactory {
    constructor(options) {
        var { ffmpeg, audioInput, videoInput, output } = options;
        this.FFMPEG = ffmpeg;
        this.audioInput = audioInput;
        this.videoInput = videoInput;
        this.output = output;
        this.logType = Logger.getLogType();
        this.loglevel = 'panic';
        
        if (this.logType === 1 || this.logType === 2) {
            this.loglevel = 'info';
        } else if (this.logType === 3) {
            this.loglevel = 'debug';
        }
    }

    dflt(commands) {
        var cmds = [
            '-loglevel', this.loglevel,
            '-probesize', '32',
            '-re',
            '-r', '16',
            '-f', 'h264',
            '-i', this.videoInput,
            '-f', 'alaw',
            '-ar', '8000',
            '-ac', '1',
            '-i', this.audioInput,
            '-map', '0:v',
            '-map', '1:a',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-strict', 'experimental',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-f', 'flv',
            this.output,
        ];
        if (commands) {
            cmds = commands;
        }

        var p = spawn(this.FFMPEG, cmds);
        p.stderr.on('data', data => {
            Logger.log(data.toString());
        });
        return p;
    }

    g711a(commands) {
        var cmds = [
            '-loglevel', this.loglevel,
            '-probesize', '32',
            '-re',
            '-f', 'alaw',
            '-ar', '8000',
            '-ac', '1',
            '-i', this.audioInput,
            '-vn',
            '-c:a', 'aac',
            '-strict', 'experimental',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-f', 'flv',
            this.output,
        ];
        if (commands) {
            cmds = commands;
        }

        var p = spawn(this.FFMPEG, cmds);
        p.stderr.on('data', data => {
            Logger.log(data.toString());
        });
        return p;
    }

    h264(commands) {
        var cmds = [
            '-loglevel', this.loglevel,
            '-probesize', '32',
            '-re',
            '-r', '16',
            '-i', this.videoInput,
            '-an',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-profile:v', 'baseline',
            '-f', 'flv',
            this.output,
        ];
        if (commands) {
            cmds = commands;
        }

        var p = spawn(this.FFMPEG, cmds);
        p.stderr.on('data', data => {
            Logger.log(data.toString());
        });
        return p;
    }

};

module.exports = {
    createFactory: (params) => {
        var factory = new FFmpegFactory(params);
        return factory;
    }
};
