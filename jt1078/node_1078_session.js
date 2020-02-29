const RTMP_PING_TIMEOUT = 30000;
// const AMF = require("../node_core_amf");
const context = require("../node_core_ctx");
const Logger = require("../node_core_logger");
const NodeCoreUtils = require("../node_core_utils");
const Node1078Channel = require('./node_1078_channel');
const { VPXCCHEAD } = require('./helper');

class Node1078Session {
    constructor(config, socket) {
        this.config = config;
        this.socket = socket;
        this.ip = socket.removeAddress;
        this.id = NodeCoreUtils.generateNewSessionID();
        this.playStreamId = 0;
        this.publishStreamId = 0;
        this.connectCmdObj = null;
        this.pingTimeout = config.s1078.ping_timeout ? config.s1078.ping_timeout * 1000 : RTMP_PING_TIMEOUT;
        this.rtpPayload = {
            ndata: new Buffer.alloc(0),
            head: new Buffer.alloc(5)
        };
        this.isStarting = false;
        context.sessions.set(this.id, this);
    }

    run() {
        this.socket.on("data", this.onSocketData.bind(this));
        this.socket.on("close", this.onSocketClose.bind(this));
        this.socket.on("error", this.onSocketError.bind(this));
        this.socket.on("timeout", this.onSocketTimeout.bind(this));
        this.socket.setTimeout(this.pingTimeout);
        this.isStarting = true;
    }

    stop() {
        if (this.isStarting) {
            this.isStarting = false;

            Logger.log(`[1078 socket disconnect] id=${this.id}`);
            context.nodeEvent.emit("1078 socket doneConnect", this.id, this.connectCmdObj);

            context.sessions.delete(this.id);
            this.closeChannels();
            this.socket.destroy();
        }
    }

    onSocketClose() {
        Logger.log('onSocketClose');
        this.stop();
    }

    onSocketError(e) {
        Logger.log('onSocketError', e);
        this.stop();
    }

    onSocketTimeout() {
        Logger.log('onSocketTimeout');
        this.stop();
    }

    closeChannels() {
        if (context.channels.size > 0) {
            for (let stream_id of context.channels.keys()) {
                if (stream_id.startsWith(this.SIMNO)) {
                    let channel = context.channels.get(stream_id);
                    channel.stop();
                }
            }
        }
    }

    onSocketData(data) {
        let dataLen = data.length;
        let idx = 0, STEP = 5;

        while (idx < dataLen) {
            let buf = data.readInt8(idx), buffer = Buffer.from([buf]);

            this.rtpPayload.head = Buffer.concat([this.rtpPayload.head, buffer]);

            if (this.rtpPayload.head.length > STEP) {
                this.rtpPayload.head = this.rtpPayload.head.slice(this.rtpPayload.head.length - STEP, 
                    this.rtpPayload.head.length);
            }

            this.rtpPayload.ndata = Buffer.concat([this.rtpPayload.ndata, buffer]);

            if (VPXCCHEAD.equals(this.rtpPayload.head) && !VPXCCHEAD.equals(this.rtpPayload.ndata)) {
                let hlen = this.rtpPayload.head.length, nlen = this.rtpPayload.ndata.length;
                let tail = this.rtpPayload.ndata.slice(nlen - hlen, nlen);

                if (VPXCCHEAD.equals(tail)) {
                    this.rtpPayload.ndata = this.rtpPayload.ndata.slice(0, nlen - hlen);
                }

                this.splitRTPPacketPlus(this.rtpPayload.ndata);
                this.rtpPayload.ndata = this.rtpPayload.head;
            }

            idx++;
        }
    }

    splitRTPPacketPlus(data) {
        var simNo = '', channelNo  = '';
        var isValidSimNo = false, isValidChannel = false;

        try {
            simNo = data.toString('hex', 8, 14);
            channelNo = data.toString('hex', 14, 15);
            isValidSimNo = simNo && /^[0-9]*$/.test(simNo);
            isValidChannel = parseInt(channelNo) !== 0 && !isNaN(parseInt(channelNo));
        } catch (e) {
            Logger.error('SimNo or ChannelNo decode failed. The origin data is ', data && data.toString('hex'));
        }

        if (!isValidSimNo) {
            Logger.warning('SimNo is invalid: ', simNo, ', origin data: ', data.toString('hex'));
            return;
        }
        if (!isValidChannel) {
            Logger.warning('ChannelNo is invalid: ', channelNo, ', origin data: ', data.toString('hex'));
            return;
        }

        if (!this.SIMNO) {
            this.SIMNO = simNo;
        }
        if (this.SIMNO !== simNo) {
            Logger.warning('SimNo in packet is different from socket.');
            return;
        }

        var stream_id = simNo + '_' + channelNo;
        var channelSession = null;

        if (context.channels.has(stream_id)) {
            channelSession = context.channels.get(stream_id);
        } else {
            var config = this.config;
            config.simNo = simNo;
            config.channelNo = channelNo;
            config.stream_id = stream_id;
            channelSession = new Node1078Channel(config);
        }

        channelSession.consume(data);
    }

}

module.exports = Node1078Session;
