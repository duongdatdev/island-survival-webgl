import http from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { validateSnapshot } from '../src/systems/SnapshotCodec.js';
import { PROTOCOL_VERSION, sharedFromSnapshot, personalFromSnapshot, snapshotFromState,
    applyChanges, same, safeRecordKey, validTransportRecords } from '../src/network/WorldSync.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 4 * 1024 * 1024;
const token = () => randomBytes(24).toString('hex');
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const passwordHash = (password, salt) => scryptSync(password, salt, 32).toString('hex');
const send = (socket, message) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_BYTES * 2) return socket.terminate();
    socket.send(JSON.stringify(message));
};

export async function createGameServer(options = {}) {
    const dataDir = resolve(options.dataDir || process.env.DATA_DIR || resolve(ROOT, 'server-data'));
    const accessPassword = options.accessPassword ?? process.env.SERVER_PASSWORD ?? '';
    const maxPlayers = Math.max(2, Math.min(16, Number(options.maxPlayers || process.env.MAX_PLAYERS) || 8));
    const maxRooms = Math.max(1, Math.min(64, Number(options.maxRooms || process.env.MAX_ROOMS) || 16));
    const rooms = new Map();
    await mkdir(dataDir, { recursive: true });
    let dirty = false, saveQueue = Promise.resolve();
    const broadcast = (room, message, except) => {
        for (const member of room.members.values()) if (member.socket !== except) send(member.socket, message);
    };
    const roster = room => [...room.members.values()].map(m => ({ id: m.id, name: m.name, pose: m.pose || null }));
    const leaderId = room => [...room.members.values()].find(m => !m.pose?.paused && !m.pose?.dead)?.id || room.members.keys().next().value || null;
    const presence = room => {
        room.leader = leaderId(room);
        broadcast(room, { type: 'roster', players: roster(room), leader: room.leader });
    };
    function persist() {
        if (!dirty) return saveQueue;
        dirty = false;
        const contents = JSON.stringify({ version: PROTOCOL_VERSION, rooms: [...rooms.values()].filter(r => r.template).map(r => ({
            code: r.code, world: r.world, salt: r.salt, password: r.password, locked: r.locked,
            template: r.template, shared: r.shared, revision: r.revision, players: [...r.players.entries()],
        })) });
        saveQueue = saveQueue.catch(() => {}).then(async () => {
            const path = resolve(dataDir, 'worlds.json');
            await writeFile(path + '.tmp', contents, { mode: 0o600 });
            await rename(path + '.tmp', path);
        }).catch(error => { dirty = true; console.error('Không lưu được server:', error.message); throw error; });
        return saveQueue;
    }
    try {
        const saved = JSON.parse(await readFile(resolve(dataDir, 'worlds.json'), 'utf8'));
        if (saved.version !== PROTOCOL_VERSION || !Array.isArray(saved.rooms)) throw new Error('Unsupported server save');
        for (const room of saved.rooms) {
            if (!/^[A-Z2-9]{6}$/.test(room.code) || !validateSnapshot(room.template)
                || !validTransportRecords(room.shared) || !Array.isArray(room.players)) throw new Error('Invalid server save');
            rooms.set(room.code, { ...room, locked: room.locked ?? room.password !== passwordHash('', room.salt), players: new Map(room.players), members: new Map() });
            for (const [key, value] of Object.entries(room.shared)) if (key.startsWith('debris:')) { value.hooked = false; value.owner = null; }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') throw new Error(`Không đọc được server-data/worlds.json: ${error.message}. Giữ file để khôi phục.`);
    }
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/api/health') {
            response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.size, maxPlayers }));
            return;
        }
        if (url.pathname === '/') {
            response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ service: 'Island Survival Dedicated Server', protocol: PROTOCOL_VERSION,
                message: 'Server multiplayer đang chạy. Mở bản game riêng, chọn Nhiều người chơi và nhập địa chỉ server này.', websocket: '/ws' }));
            return;
        }
        response.writeHead(404); response.end();
    });
    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_BYTES, perMessageDeflate: false });
    wss.on('connection', socket => {
        let room, member, messages = 0, started = Date.now();
        socket.alive = true;
        socket.on('pong', () => { socket.alive = true; });
        socket.on('error', () => {});
        const helloTimer = setTimeout(() => { if (!member) socket.close(1008, 'Handshake timeout'); }, 15000);
        socket.on('message', (raw, binary) => {
            const reject = message => send(socket, { type: 'error', message });
            try {
                if (binary) throw new Error('Chỉ chấp nhận JSON.');
                if (Date.now() - started >= 1000) { started = Date.now(); messages = 0; }
                if (++messages > 80) { socket.close(1008, 'Rate limit'); return; }
                const message = JSON.parse(raw.toString());
                if (!message || typeof message !== 'object') throw new Error('Gói tin không hợp lệ.');
                if (!member) {
                    if (message.type === 'inspect') {
                        if (message.protocol !== PROTOCOL_VERSION) throw new Error('Phiên bản game không khớp. Hãy tải lại trang.');
                        if (message.serverPassword !== accessPassword) throw new Error('Sai mật khẩu server.');
                        send(socket, { type: 'serverStatus', protocol: PROTOCOL_VERSION, maxPlayers,
                            rooms: [...rooms.values()].map(r => ({ code: r.code, name: r.world.name, mode: r.world.mode,
                                players: r.members.size, ready: !!r.template, locked: !!r.locked })) });
                        socket.close(1000); return;
                    }
                    if (message.type !== 'hello' || message.protocol !== PROTOCOL_VERSION) throw new Error('Phiên bản game không khớp. Hãy tải lại trang.');
                    if (typeof message.serverPassword !== 'string' || message.serverPassword.length > 128 || message.serverPassword !== accessPassword) throw new Error('Sai mật khẩu server.');
                    const name = clean(message.name, 24);
                    if (!name) throw new Error('Hãy nhập tên người chơi.');
                    if (typeof message.password !== 'string' || message.password.length > 128) throw new Error('Mật khẩu phòng không hợp lệ.');
                    const requestedRoom = clean(message.room, 6).toUpperCase();
                    if (message.action === 'create' || message.action === 'join' && !requestedRoom && rooms.size === 0) {
                        if (rooms.size >= maxRooms) throw new Error('Server đã đủ số phòng. Hãy tham gia phòng có sẵn.');
                        let code;
                        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                        do { code = Array.from(randomBytes(6), b => alphabet[b % alphabet.length]).join(''); } while (rooms.has(code));
                        const salt = token();
                        const world = { id: 'online-' + code, name: clean(message.world?.name, 48) || 'Đảo sinh tồn',
                            seed: clean(message.world?.seed, 64) || randomBytes(4).readUInt32LE().toString(),
                            mode: message.world?.mode === 'classic' ? 'classic' : 'campaign', generatorVersion: message.world?.mode === 'classic' ? 1 : 3 };
                        room = { code, world, salt, password: passwordHash(message.password, salt), locked: !!message.password, shared: null,
                            template: null, revision: 0, members: new Map(), players: new Map() };
                        rooms.set(code, room);
                    } else if (message.action === 'join') {
                        room = requestedRoom ? rooms.get(requestedRoom)
                            : [...rooms.values()].find(r => r.template && !r.locked) || [...rooms.values()].find(r => r.template);
                        if (!room || !timingSafeEqual(Buffer.from(room.password, 'hex'), Buffer.from(passwordHash(message.password, room.salt), 'hex'))) throw new Error('Không tìm thấy phòng hoặc sai mật khẩu phòng.');
                        if (!room.template) throw new Error('Đảo đang được chuẩn bị. Thử lại sau vài giây.');
                    } else throw new Error('Thao tác kết nối không hợp lệ.');
                    if (room.members.size >= maxPlayers) throw new Error(`Phòng đã đủ ${maxPlayers} người.`);
                    const resumeToken = typeof message.token === 'string' && room.players.has(message.token) ? message.token : token();
                    const saved = room.players.get(resumeToken);
                    if (saved && [...room.members.values()].some(m => m.id === saved.id)) throw new Error('Nhân vật này đang chơi ở tab khác.');
                    if (!saved && room.players.size >= 128) throw new Error('Phòng đã đủ nhân vật đã lưu.');
                    const id = saved?.id || randomBytes(8).toString('hex');
                    const personal = saved?.personal || (room.template ? personalFromSnapshot(room.template) : null);
                    member = { id, name, socket, token: resumeToken, personal, pose: null };
                    room.members.set(id, member);
                    room.players.set(resumeToken, { id, name, personal }); dirty = true;
                    clearTimeout(helloTimer);
                    send(socket, { type: 'welcome', id, token: resumeToken, room: room.code, world: room.world,
                        leader: leaderId(room), revision: room.revision, shared: room.shared,
                        snapshot: room.template ? snapshotFromState(room.template, room.shared, personal) : null, players: roster(room), maxPlayers });
                    presence(room);
                    return;
                }
                if (message.type === 'ping') { send(socket, { type: 'pong', time: message.time }); return; }
                if (message.type === 'pose') {
                    const pose = message.pose;
                    if (!pose || !Array.isArray(pose.position) || pose.position.length !== 3 || !pose.position.every(v => Number.isFinite(v) && Math.abs(v) < 10000)
                        || !Number.isFinite(pose.yaw)) throw new Error('Vị trí không hợp lệ.');
                    member.pose = { position: pose.position, yaw: pose.yaw, paused: !!pose.paused, dead: !!pose.dead };
                    if (room.leader !== leaderId(room)) presence(room);
                    broadcast(room, { type: 'pose', id: member.id, pose: member.pose }, socket); return;
                }
                if (message.type === 'initialize') {
                    if (room.template || room.members.keys().next().value !== member.id) throw new Error('Đảo đã được khởi tạo.');
                    if (!validateSnapshot(message.snapshot) || message.snapshot.worldSeed !== room.world.seed || message.snapshot.mode !== room.world.mode
                        || message.snapshot.generatorVersion !== room.world.generatorVersion) throw new Error('Dữ liệu đảo không hợp lệ.');
                    if (message.animals && (!Object.keys(message.animals).every(key => key.startsWith('animal:')))) throw new Error('Dữ liệu động vật không hợp lệ.');
                    const shared = { ...sharedFromSnapshot(message.snapshot), ...(message.animals || {}) };
                    if (!validTransportRecords(shared)) throw new Error('Dữ liệu động vật không hợp lệ.');
                    room.template = message.snapshot; room.shared = shared;
                    member.personal = personalFromSnapshot(message.snapshot);
                    room.players.get(member.token).personal = member.personal;
                    dirty = true;
                    send(socket, { type: 'initialized', shared: room.shared, revision: 0 }); return;
                }
                if (message.type === 'commit') {
                    if (!room.template || !Array.isArray(message.changes) || message.changes.length > 16000 || !Number.isSafeInteger(message.seq)) throw new Error('Giao dịch không hợp lệ.');
                    const keys = new Set();
                    for (const change of message.changes) {
                        if (!change || !safeRecordKey(change.key) || keys.has(change.key)) throw new Error('Trường dữ liệu không hợp lệ.');
                        keys.add(change.key);
                    }
                    const conflict = message.changes.some(c => !same(room.shared[c.key] ?? null, c.before)
                        || c.key === 'clock' && leaderId(room) !== member.id);
                    const next = conflict ? room.shared : applyChanges(room.shared, message.changes);
                    let valid = false;
                    try {
                        const personal = message.personal;
                        const personalFields = ['player', 'inventory', 'vitals', 'exposure', 'stats', 'survivalSeconds', 'playSeconds', 'campaign'];
                        const validPersonal = personal && typeof personal === 'object' && !Array.isArray(personal)
                            && Object.keys(personal).every(key => personalFields.includes(key))
                            && personal.player && personal.inventory && personal.vitals && Number.isFinite(personal.survivalSeconds);
                        valid = !conflict && validPersonal && validTransportRecords(next)
                            && validateSnapshot(snapshotFromState(room.template, next, personal));
                    } catch { /* Reject the entire transaction. */ }
                    if (!valid) {
                        send(socket, { type: 'rejected', seq: message.seq, shared: room.shared, personal: member.personal,
                            revision: room.revision, message: conflict ? 'Một người khác vừa thay đổi vật này. Đồ đã được hoàn lại; hãy thử lại.' : 'Giao dịch không hợp lệ. Đã khôi phục trạng thái server.' }); return;
                    }
                    room.shared = next; room.revision++;
                    room.world.completedRoutes = ['raft', 'rescue'].filter(route => room.shared['fact:endingCompleted:' + route] > 0);
                    member.personal = message.personal;
                    room.players.get(member.token).personal = member.personal; dirty = true;
                    send(socket, { type: 'accepted', seq: message.seq, changes: message.changes, revision: room.revision });
                    broadcast(room, { type: 'changes', changes: message.changes, revision: room.revision }, socket);
                    return;
                }
                if (message.type === 'save') {
                    persist().then(() => send(socket, { type: 'saved', request: message.request }))
                        .catch(() => reject('Không lưu được dữ liệu trên server. Kiểm tra ổ đĩa.'));
                    return;
                }
                if (message.type === 'checkpoint') {
                    if (!room.template || !['save', 'load'].includes(message.action) || typeof message.request !== 'string' || message.request.length > 64) throw new Error('Checkpoint không hợp lệ.');
                    const player = room.players.get(member.token);
                    if (message.action === 'save') {
                        player.checkpoint = structuredClone(member.personal); dirty = true;
                        persist().then(() => send(socket, { type: 'checkpoint', request: message.request, ok: true }))
                            .catch(() => send(socket, { type: 'checkpoint', request: message.request, ok: false }));
                    } else send(socket, { type: 'checkpoint', request: message.request, ok: !!player.checkpoint,
                        personal: player.checkpoint || null });
                    return;
                }
                throw new Error('Loại gói tin không hợp lệ.');
            } catch (error) { reject(error.message || 'Gói tin không hợp lệ.'); }
        });
        socket.on('close', () => {
            clearTimeout(helloTimer);
            if (!member || !room) return;
            room.members.delete(member.id);
            if (room.shared) {
                const changes = Object.entries(room.shared).filter(([key, value]) => key.startsWith('debris:') && value.owner === member.id)
                    .map(([key, value]) => ({ key, before: value, value: { ...value, hooked: false, owner: null } }));
                if (changes.length) {
                    room.shared = applyChanges(room.shared, changes); room.revision++;
                    broadcast(room, { type: 'changes', changes, revision: room.revision });
                }
            }
            if (!room.template && !room.members.size) rooms.delete(room.code);
            dirty = true; presence(room); persist().catch(() => {});
        });
    });
    const heartbeat = setInterval(() => {
        for (const socket of wss.clients) {
            if (!socket.alive) { socket.terminate(); continue; }
            socket.alive = false; socket.ping();
        }
    }, 15000);
    const autosave = setInterval(() => persist().catch(() => {}), 3000);
    return { server, rooms, persist,
        async listen(port = Number(process.env.PORT) || 3000, host = process.env.HOST || '0.0.0.0') {
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
            return server.address();
        },
        async close() {
            clearInterval(heartbeat); clearInterval(autosave);
            for (const socket of wss.clients) socket.terminate();
            await new Promise(resolve => wss.close(resolve));
            dirty = true; await persist();
            await new Promise(resolve => server.close(resolve));
        },
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const app = await createGameServer();
    const address = await app.listen();
    console.log(`Island Survival Dedicated Server — cổng ${address.port}`);
    console.log(`Trong bản game riêng: Nhiều người chơi → Kết nối trực tiếp → localhost:${address.port}`);
    for (const entries of Object.values(networkInterfaces())) for (const entry of entries || []) {
        if (entry.family === 'IPv4' && !entry.internal) console.log(`Địa chỉ cho bạn bè trong LAN: ${entry.address}:${address.port}`);
    }
    console.log('Tiến trình lưu tại: ' + resolve(process.env.DATA_DIR || resolve(ROOT, 'server-data')));
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
        if (stopping) return; stopping = true;
        await app.close(); process.exit(0);
    });
}
