const Logger = require('../node_core_logger');
const Net = require('net');
const Node1078Session = require('./node_1078_session');
const NodeCoreUtils = require('../node_core_utils');
const context = require('../node_core_ctx');
const S1078_PORT = 7612;

class Node1078Server {
    constructor(config) {
        config.s1078.port = this.port = config.s1078.port ? config.s1078.port : S1078_PORT;
        this.tcpServer = Net.createServer((socket) => {
            let session = new Node1078Session(config, socket);
            session.run();
        });
    }

    run() {
        this.tcpServer.listen(this.port, () => {
            Logger.log(`Node Media 1078 Server started on port: ${this.port}`);
        });

        this.tcpServer.on('error', (e) => {
            Logger.error(`Node Media 1078 Server ${e}`);
        });

        this.tcpServer.on('close', () => {
            Logger.log('Node Media 1078 Server Close.');
        });
    }

    stop() {
        this.tcpServer.close();
        context.sessions.forEach((session, id) => {
            if (session instanceof Node1078Session) {
                session.socket.destroy();
                context.sessions.delete(id);
            }
        });
    }
}

module.exports = Node1078Server