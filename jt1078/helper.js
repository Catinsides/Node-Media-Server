const chalk = require('chalk');
const Logger = require("../node_core_logger");

const bufSlicer = {
    getDefaultHead() {
        return Buffer.from([0x30, 0x31, 0x63, 0x64], 'hex');
    },
    getHISIHEAD() {
        return Buffer.from([0x00, 0x01, 0x64, 0x00], 'hex');
    },
    getHeader(buff) {
        return buff.slice(0, 4);
    },
    getCC(buff) {
        return buff.slice(4, 5);
    },
    getMPT(buff) {
        return buff.slice(5, 6);
    },
    getPackageNo(buff) {
        return buff.slice(6, 8);
    },
    getSimNo(buff) {
        return buff.slice(8, 14);
    },
    getChannel(buff) {
        return buff.slice(14, 15);
    },
    getFrameType(buff) {
        return buff.slice(15, 16);
    },
    getTimeStamp(buff) {
        return buff.slice(16, 24);
    },
    getIFrameInterval(buff) {
        return buff.slice(24, 26);
    },
    getFrameInterval(buff) {
        return buff.slice(26, 28);
    },
    getDataLen(buff) {
        return buff.slice(28, 30);
    },
    getLength(buff) {
        return buff.length;
    },
    getMedia(buff) {
        return buff.slice(30);
    }
};
exports.bufSlicer = bufSlicer;

const RtpPacket = {
    create: buff => {
        if (!Buffer.isBuffer(buff) || buff.length === 0) {
            return null;
        };

        try {
            var packet = {
                head: bufSlicer.getHeader(buff),
                cc: bufSlicer.getCC(buff),
                mpt: bufSlicer.getMPT(buff),
                packetNo: bufSlicer.getPackageNo(buff),
                simNo: bufSlicer.getSimNo(buff).toString('hex'),
                channelNo: bufSlicer.getChannel(buff).toString('hex'),
                frameType: bufSlicer.getFrameType(buff),
                payload: Buffer.alloc(0)
            };

            var frameTypeVal = packet.frameType.readInt8(0);
            var ft = frameTypeVal >> 4 & 0x0f,    // 0:I, 1:P, 2:B, 3:audio, 4:data
                pt = frameTypeVal & 0x0f;    // 0:atom, 1:first, 2:last, 3:middle

            packet.frameTypeVal = {
                ft, pt
            };
            packet.mediaType = packet.mpt.readInt8(0) & 0x7f;

            if (ft === 4) {
                packet.dateLength = buff.readInt16BE(16);
                packet.payload = buff.slice(18, packet.dateLength);
            } else if (ft === 3) {
                packet.timeStamp = parseInt(parseInt(bufSlicer.getTimeStamp(buff).toString('hex'), 16) / 1000);
                packet.dataLength = parseInt(buff.slice(24, 26).toString('hex'), 16);
                packet.payload = buff.slice(26, packet.dateLength);

                var HISIHEAD = bufSlicer.getHISIHEAD();
                var hisiHeadLen = HISIHEAD.length;
                var isHisiHead = HISIHEAD.equals(packet.payload.slice(0, hisiHeadLen));
                if (isHisiHead) {
                    packet.payload = packet.payload.slice(hisiHeadLen, packet.payload.length);
                }
            } else if (0 <= ft && ft <= 2) {
                packet.timeStamp = parseInt(parseInt(bufSlicer.getTimeStamp(buff).toString('hex'), 16) / 1000);
                packet.lastIFI = parseInt(bufSlicer.getIFrameInterval(buff).toString('hex'), 16);
                packet.lastFI = parseInt(bufSlicer.getFrameInterval(buff).toString('hex'), 16);
                packet.dataLength = parseInt(bufSlicer.getDataLen(buff).toString('hex'), 16);
                packet.payload = bufSlicer.getMedia(buff);
            }

            packet.isValidSimNo = packet.simNo && /^[0-9]*$/.test(this.simNo);
            packet.isAudioFrame = packet.frameTypeVal.ft === 3;
            packet.isVedioFrame = packet.mediaType === 98;
            packet.isTpData = packet.frameTypeVal === 4;

            return packet;
        } catch (e) {
            Logger.warning('RtpPacket Decode Error, ', e);
            return null
        }
    }
};

exports.RtpPacket = RtpPacket;
