import { socketURL } from './NetworkClient.js';

const KEY = 'island.online.servers.v1';
export class ServerBookmarks {
    constructor(storage = globalThis.localStorage, location = globalThis.location) { this.storage = storage; this.location = location; }
    list() {
        try {
            const saved = JSON.parse(this.storage.getItem(KEY));
            if (!Array.isArray(saved)) return [];
            return saved.filter(s => s && typeof s.id === 'string' && typeof s.name === 'string'
                && typeof s.url === 'string' && typeof s.room === 'string').slice(0, 32);
        } catch { return []; }
    }
    save({ id, name, url, room = '' }) {
        const address = socketURL(url, this.location);
        const servers = this.list();
        const record = { id: id || globalThis.crypto.randomUUID(), name: name.trim().slice(0, 48) || new URL(address).host,
            url: address, room: room.trim().toUpperCase() };
        if (record.room && !/^[A-Z2-9]{6}$/.test(record.room)) throw new Error('Mã phòng gồm 6 chữ cái hoặc chữ số.');
        const index = servers.findIndex(s => s.id === record.id);
        if (index >= 0) servers[index] = record;
        else {
            if (servers.length >= 32) throw new Error('Đã đủ 32 server. Hãy xóa một server trước khi thêm.');
            servers.push(record);
        }
        this.storage.setItem(KEY, JSON.stringify(servers));
        return record;
    }
    remove(id) { this.storage.setItem(KEY, JSON.stringify(this.list().filter(s => s.id !== id))); }
}
