const Logger = require("../node_core_logger");
const { spawnSync } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');

// constants
const HEAD = Buffer.from([0x30, 0x31, 0x63, 0x64], 'hex');
const HEXOFHEAD = Buffer.from(HEAD, 'hex');
const HEXOFVPXCC = Buffer.from([0x81], 'hex');
const VPXCCHEAD = Buffer.concat([HEXOFHEAD, HEXOFVPXCC]);

class RtpPacket {
    constructor(buff) {
        this.isValid = Buffer.isBuffer(buff) && buff.length > 0;
        if (!this.isValid) return;
        this.init(buff);
    }

    init(buff) {
        try {
            this._init(buff);
        } catch (e) {
            Logger.warning('RtpPacket Decode Error, ', e);
            this.isValid = false;
        }
    }

    _init(buff) {
        this.head = buff.slice(0, 4);
        this.cc = buff.slice(4, 5);
        this.mpt = buff.slice(5, 6);
        this.packetNo = buff.slice(6, 8);
        this.simNo = buff.slice(8, 14).toString('hex');
        this.channelNo = buff.slice(14, 15).toString('hex');
        this.frameType = buff.slice(15, 16);
        this.payload = Buffer.alloc(0);

        var frameTypeVal = this.frameType.readInt8(0);
        var ft = frameTypeVal >> 4 & 0x0f,    // 0:I, 1:P, 2:B, 3:audio, 4:data
            pt = frameTypeVal & 0x0f;    // 0:atom, 1:first, 2:last, 3:middle
        
        this.frameTypeVal = { ft, pt };
        this.mediaType = this.mpt.readInt8(0) & 0x7f;

        if (ft === 4) {    // data
            this.dataLength = buff.readInt16BE(16);
            this.payload = buff.slice(18, this.dataLength);
        } else if (ft === 3) {    // audio
            this.timeStamp = parseInt(buff.slice(16, 24).toString('hex'), 16);
            this.dataLength = parseInt(buff.slice(24, 26).toString('hex'), 16);
            this.payload = buff.slice(26, this.dataLength);

            var HISIHEAD = this.getHISIHEAD();
            var hisiHeadLen = HISIHEAD.length;
            var isHisiHead = HISIHEAD.equals(this.payload.slice(0, hisiHeadLen));
            if (isHisiHead) {    // remove HISIHEAD
                this.payload = this.payload.slice(hisiHeadLen, this.payload.length);
            }
        } else if (0 <= ft && ft <= 2) {    // video frame
            this.timeStamp = parseInt(buff.slice(16, 24).toString('hex'), 16);
            this.lastIFI = parseInt(buff.slice(24, 26).toString('hex'), 16);
            this.lastFI = parseInt(buff.slice(26, 28).toString('hex'), 16);
            this.dataLength = parseInt(buff.slice(28, 30).toString('hex'), 16);
            this.payload = buff.slice(30, 30 + this.dataLength);
        }

        this.isAudioFrame = this.frameTypeVal.ft === 3;
        this.isVedioFrame = this.mediaType === 98;
        this.isTpData = this.frameTypeVal.ft === 4;
    }

    getHISIHEAD() {
        return Buffer.from([0x00, 0x01, 0x64, 0x00], 'hex');
    }
}

const mkfifoSync = function (path, permission = 644) {
    const p = spawnSync('mkfifo', [path, '-m', permission], { stdio: 'ignore' });
    if (!existsSync(path) || p.status !== 0) {
        throw new Error(`Create fifo failed. Path is ${path}`);
    }
    return path;
}

const mkdirsSync = function (filePath) {
    if (existsSync(filePath)) {
        return true;
    } else {
        if (mkdirsSync(dirname(filePath))) {
            mkdirSync(filePath);
            return true;
        }
    }
}

module.exports = {
    HEAD,
    HEXOFHEAD,
    HEXOFVPXCC,
    VPXCCHEAD,
    RtpPacket,
    mkfifoSync,
    mkdirsSync,
}
