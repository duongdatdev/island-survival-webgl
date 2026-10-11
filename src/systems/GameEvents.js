export class GameEvents {
    constructor() { this.listeners = new Map(); }
    on(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
        return () => {
            const listeners = this.listeners.get(type);
            listeners?.delete(listener);
            if (!listeners?.size) this.listeners.delete(type);
        };
    }
    emit(type, payload = {}) {
        for (const listener of [...(this.listeners.get(type) || [])]) listener(payload);
        for (const listener of [...(this.listeners.get('*') || [])]) listener({ ...payload, eventType: type });
    }
    dispose() { this.listeners.clear(); }
}
