import { PROTOCOL_VERSION } from './WorldSync.js';

export function socketURL(value, location = globalThis.location) {
    const input = value?.trim();
    if (!input) throw new Error('Nhập địa chỉ server riêng, ví dụ 192.168.1.10:3000.');
    const url = new URL(input.includes('://') ? input : 'http://' + input);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password) throw new Error('Dùng địa chỉ http://IP:3000 hoặc https://ten-mien.');
    url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
    url.pathname = url.pathname.replace(/\/$/, '').replace(/\/ws$/, '') + '/ws';
    url.search = ''; url.hash = '';
    if (location.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('Trang HTTPS cần kết nối server qua HTTPS/WSS.');
    return url.href;
}

export function queryServer({ url, serverPassword = '', signal, timeout = 5000 }) {
    const address = socketURL(url);
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(address), started = Date.now();
        let settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
            socket.close();
            if (error) reject(new Error(error)); else resolve({ ...result, latency: Date.now() - started });
        };
        const abort = () => finish('Đã hủy kiểm tra server.');
        const timer = setTimeout(() => finish('Không liên lạc được server.'), timeout);
        socket.onopen = () => socket.send(JSON.stringify({ type: 'inspect', protocol: PROTOCOL_VERSION, serverPassword }));
        socket.onmessage = event => {
            try {
                const result = JSON.parse(event.data);
                if (result.type === 'serverStatus' && Array.isArray(result.rooms)) finish(null, result);
                else if (result.type === 'error') finish(result.message);
            } catch { finish('Phản hồi của server không hợp lệ.'); }
        };
        socket.onerror = () => finish('Không liên lạc được server.');
        socket.onclose = () => { if (!settled) finish('Server đã đóng kết nối.'); };
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
    });
}

export class NetworkClient {
    constructor() {
        this.queue = [];
        this.peers = new Map();
        this.closed = false;
        this.intentional = false;
        this.latency = 0;
    }

    async connect(options) {
        this.url = socketURL(options.url);
        let room = options.room?.trim().toUpperCase();
        if (options.action === 'join' && !room) {
            this.probeController = new AbortController();
            const status = await queryServer({ url: options.url, serverPassword: options.serverPassword || '', signal: this.probeController.signal });
            room = (status.rooms.find(r => r.ready && !r.locked) || status.rooms.find(r => r.ready))?.code;
            if (this.closed) throw new Error('Đã hủy kết nối.');
        }
        let savedToken;
        try { savedToken = localStorage.getItem(`island.online.token:${this.url}:${room}`); } catch { /* Private browsing. */ }
        return new Promise((resolve, reject) => {
            let settled = false;
            const socket = this.socket = new WebSocket(this.url);
            const fail = message => {
                if (settled) return;
                settled = true; clearTimeout(timeout);
                this.intentional = true; socket.close(); reject(new Error(message));
            };
            const timeout = setTimeout(() => fail('Kết nối quá lâu. Kiểm tra IP, cổng server và tường lửa rồi thử lại.'), 12000);
            socket.onopen = () => this.send({ type: 'hello', protocol: PROTOCOL_VERSION, ...options,
                room, token: savedToken, password: options.password || '', serverPassword: options.serverPassword || '' });
            socket.onmessage = event => {
                let message;
                try { message = JSON.parse(event.data); } catch { return; }
                if (message.type === 'welcome') {
                    settled = true; clearTimeout(timeout);
                    Object.assign(this, { id: message.id, room: message.room, world: message.world,
                        leader: message.leader, welcome: message });
                    this.setPeers(message.players);
                    try {
                        localStorage.setItem(`island.online.token:${this.url}:${this.room}`, message.token);
                        localStorage.setItem('island.online.last', JSON.stringify({ url: options.url || '', room: this.room, name: options.name }));
                    } catch { /* Rejoining still works as a new character. */ }
                    this.heartbeat = setInterval(() => this.send({ type: 'ping', time: Date.now() }), 5000);
                    resolve(message); return;
                }
                if (message.type === 'error' && !settled) { fail(message.message); return; }
                if (message.type === 'pong') { this.latency = Date.now() - message.time; return; }
                if (message.type === 'roster') { this.setPeers(message.players); this.leader = message.leader; return; }
                if (message.type === 'pose') {
                    const peer = this.peers.get(message.id);
                    if (peer) peer.pose = message.pose;
                    return;
                }
                this.queue.push(message);
            };
            socket.onerror = () => { if (!settled) fail('Không kết nối được server. Chạy server và kiểm tra địa chỉ/cổng.'); };
            socket.onclose = () => {
                clearTimeout(timeout); clearInterval(this.heartbeat);
                this.closed = true;
                if (!settled) fail('Server đã đóng kết nối. Hãy kiểm tra lại mật khẩu và địa chỉ.');
                else if (!this.intentional) this.queue.push({ type: 'disconnected' });
            };
        });
    }

    setPeers(players) {
        const ids = new Set(players.map(p => p.id));
        for (const id of this.peers.keys()) if (!ids.has(id)) this.peers.delete(id);
        for (const player of players) if (player.id !== this.id) {
            const previous = this.peers.get(player.id);
            this.peers.set(player.id, { ...previous, ...player, pose: player.pose || previous?.pose });
        }
    }

    send(message) {
        if (this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 8 * 1024 * 1024) return false;
        this.socket.send(JSON.stringify(message)); return true;
    }

    close() {
        this.intentional = true; this.closed = true;
        this.probeController?.abort();
        clearInterval(this.heartbeat); this.socket?.close();
    }
}
