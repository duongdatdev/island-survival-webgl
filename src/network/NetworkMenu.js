import { NetworkClient, queryServer } from './NetworkClient.js';
import { ServerBookmarks } from './ServerBookmarks.js';

export class NetworkMenu {
    constructor(scene) {
        this.scene = scene;
        this.element = document.createElement('div');
        this.element.id = 'network-menu';
        this.element.className = 'overlay panel-overlay hidden';
        this.element.innerHTML = `<section class="network-panel" role="dialog" aria-modal="true" aria-labelledby="network-title">
            <header><div><p class="network-kicker">LAN · SERVER TỰ HOST</p><h2 id="network-title">Nhiều người chơi</h2></div>
            <button type="button" class="panel-close" id="network-close" aria-label="Đóng"><svg class="ui-icon" aria-hidden="true"><use href="#i-close"/></svg></button></header>
            <div id="network-servers-view">
                <p>Chọn server đã lưu hoặc kết nối trực tiếp bằng IP / tên miền.</p>
                <div id="network-server-list" aria-label="Danh sách server"></div>
                <p id="network-list-status" role="status" aria-live="polite"></p>
                <button id="network-join-selected" type="button" class="menu-btn primary">Vào server</button>
                <div class="network-server-actions">
                    <button id="network-direct-connect" type="button">Kết nối trực tiếp</button>
                    <button id="network-add-server" type="button">Thêm server</button>
                    <button id="network-edit-server" type="button">Sửa server</button>
                    <button id="network-remove-server" type="button">Xóa server</button>
                    <button id="network-refresh" type="button">Làm mới</button>
                    <button id="network-host" type="button">Tạo phòng</button>
                </div>
                <p class="network-help">Server cùng mạng: nhập IP của máy chủ và cổng, ví dụ <code>192.168.1.10:3000</code>. Thế giới chơi đơn vẫn nằm riêng trên máy này.</p>
            </div>
            <form id="network-form" hidden>
                <button id="network-back" type="button" class="network-back">← Danh sách server</button>
                <div id="network-bookmark-fields" hidden><label for="network-bookmark-name">Tên server</label><input id="network-bookmark-name" maxlength="48" placeholder="Server của bạn bè"></div>
                <label for="network-name">Tên người chơi</label><input id="network-name" name="name" maxlength="24" required autocomplete="nickname" value="Người sống sót">
                <label for="network-server">Địa chỉ server (IP hoặc tên miền)</label><input id="network-server" name="url" type="text" required spellcheck="false" placeholder="192.168.1.10:3000 hoặc localhost:3000">
                <details><summary>Server có mật khẩu truy cập</summary><label for="network-server-password">Mật khẩu server</label><input id="network-server-password" name="serverPassword" type="password" maxlength="128" autocomplete="off"></details>
                <div class="network-tabs" role="group" aria-label="Chế độ kết nối">
                    <button id="network-create-tab" type="button" aria-pressed="true">Tạo phòng</button>
                    <button id="network-join-tab" type="button" aria-pressed="false">Vào phòng</button>
                </div>
                <div id="network-create-fields">
                    <label for="network-world">Tên đảo</label><input id="network-world" maxlength="48" value="Đảo của chúng ta">
                    <div class="network-row"><div><label for="network-mode">Hành trình</label><select id="network-mode"><option value="campaign">Campaign</option><option value="classic">Classic</option></select></div>
                    <div><label for="network-seed">Seed (tùy chọn)</label><input id="network-seed" maxlength="64" placeholder="Ngẫu nhiên"></div></div>
                </div>
                <div id="network-join-fields" hidden><label for="network-room-choice">Đảo trên server</label><select id="network-room-choice"><option value="">Tự chọn đảo mặc định</option></select>
                <button id="network-find-worlds" class="network-back" type="button">Tải danh sách đảo</button>
                <label for="network-room">Mã phòng (tùy chọn)</label><input id="network-room" maxlength="6" minlength="6" spellcheck="false" autocomplete="off" placeholder="Để trống để vào đảo mặc định"></div>
                <label for="network-password">Mật khẩu phòng (nếu có)</label><input id="network-password" name="password" type="password" maxlength="128" autocomplete="off">
                <p id="network-error" role="alert"></p><p id="network-status" role="status" aria-live="polite"></p>
                <button id="network-save-server" type="button" hidden>Lưu server</button>
                <button id="network-submit" type="submit" class="menu-btn primary">Tạo phòng & lên đảo</button>
                <p class="network-help">Người host chạy gói Dedicated Server riêng. Người chơi mở bản game này và nhập địa chỉ máy host.</p>
            </form>
        </section>`;
        document.body.append(this.element);
        this.form = this.element.querySelector('form');
        this.bookmarks = new ServerBookmarks();
        this.statuses = new Map();
        this.action = 'create';
        this.element.querySelector('#network-close').onclick = () => this.close();
        this.element.querySelector('#network-create-tab').onclick = () => this.select('create');
        this.element.querySelector('#network-join-tab').onclick = () => this.select('join');
        this.form.onsubmit = event => { event.preventDefault(); this.connect(); };
        this.get('back').onclick = () => this.showServers();
        this.get('direct-connect').onclick = () => this.showConnection('join');
        this.get('add-server').onclick = () => {
            this.editingId = null;
            this.get('server').value = ''; this.get('room').value = ''; this.get('bookmark-name').value = '';
            this.showConnection('join', true);
        };
        this.get('edit-server').onclick = () => {
            const server = this.servers.find(s => s.id === this.selectedId);
            if (!server) return;
            this.fillServer(server); this.editingId = server.id; this.showConnection('join', true);
        };
        this.get('remove-server').onclick = () => {
            try { this.bookmarks.remove(this.selectedId); this.selectedId = null; this.showServers(); }
            catch { this.get('list-status').textContent = 'Không lưu được thay đổi trong trình duyệt.'; }
        };
        this.get('save-server').onclick = () => this.saveBookmark();
        this.get('refresh').onclick = () => this.refreshServers();
        this.get('host').onclick = () => this.showConnection('create');
        this.get('join-selected').onclick = () => {
            this.fillServer(this.servers.find(s => s.id === this.selectedId));
            this.showConnection('join'); this.connect();
        };
        this.get('find-worlds').onclick = () => this.findWorlds();
        this.get('room-choice').onchange = () => { this.get('room').value = this.get('room-choice').value; };
        this.get('server').addEventListener('input', () => this.resetWorldChoices());
        this.onKey = event => {
            if (this.element.classList.contains('hidden')) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
            if (event.key === 'Tab') {
                const focusable = [...this.element.querySelectorAll('button,input,select,summary')].filter(e => e.checkVisibility() && !e.disabled);
                const first = focusable[0], last = focusable.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };
        this.element.addEventListener('keydown', this.onKey);
        try {
            const last = JSON.parse(localStorage.getItem('island.online.last'));
            if (last) for (const key of ['name', 'server', 'room']) this.get(key).value = last[key === 'server' ? 'url' : key] || '';
        } catch { /* Optional preferences. */ }
    }

    get(name) { return this.element.querySelector('#network-' + name); }
    open() { this.scene.menuUI?.closeAll(); this.cancelled = false; this.element.classList.remove('hidden'); this.showServers(); this.refreshServers(); }
    close() {
        this.cancelled = true;
        this.client?.close();
        this.probes?.abort();
        this.worldProbe?.abort();
        this.element.classList.add('hidden');
        this.scene._multiplayerBtn?.focus();
    }
    select(action) {
        if (this.busy) return;
        this.action = action;
        for (const kind of ['create', 'join']) {
            this.get(kind + '-fields').hidden = kind !== action;
            this.get(kind + '-tab').setAttribute('aria-pressed', String(kind === action));
        }
        this.get('room').required = false;
        this.get('room').disabled = action !== 'join';
        this.get('submit').textContent = action === 'create' ? 'Tạo phòng & lên đảo' : 'Kết nối & lên đảo';
        this.get('error').textContent = '';
    }

    showServers() {
        if (this.busy) return;
        this.form.hidden = true; this.get('servers-view').hidden = false;
        this.servers = this.bookmarks.list();
        if (!this.servers.some(s => s.id === this.selectedId)) this.selectedId = this.servers[0]?.id || null;
        this.renderServers(); this.get(this.selectedId ? 'join-selected' : 'direct-connect').focus();
    }

    renderServers() {
        const focusedId = document.activeElement?.dataset.serverId;
        const list = this.get('server-list'); list.replaceChildren();
        if (!this.servers.length) {
            const empty = document.createElement('p'); empty.className = 'network-help network-server-empty';
            empty.textContent = 'Chưa có server đã lưu. Thêm địa chỉ của bạn bè hoặc chọn Kết nối trực tiếp. Người host chạy server riêng trên máy tính hoặc VPS.';
            list.append(empty);
        }
        for (const server of this.servers) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'network-server-entry';
            button.dataset.serverId = server.id; button.setAttribute('aria-pressed', String(server.id === this.selectedId));
            const name = document.createElement('strong'), address = document.createElement('span'), status = document.createElement('span');
            name.textContent = server.name; address.textContent = server.url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '') + (server.room ? ' · ' + server.room : '');
            const result = this.statuses.get(server.id);
            status.className = 'network-server-status';
            status.textContent = result?.error || (result ? `Online · ${result.latency} ms · ${result.rooms.length} đảo · ${result.rooms.reduce((n, r) => n + r.players, 0)} người` : 'Chưa kiểm tra');
            status.dataset.state = result ? (result.error ? 'offline' : 'online') : 'unknown';
            button.append(name, address, status);
            button.onclick = () => {
                this.selectedId = server.id; this.fillServer(server);
                for (const entry of list.children) entry.setAttribute('aria-pressed', String(entry === button));
                this.updateServerButtons();
            };
            button.ondblclick = () => this.get('join-selected').click();
            list.append(button);
            if (focusedId === server.id) button.focus();
        }
        this.updateServerButtons();
    }

    updateServerButtons() {
        for (const name of ['edit-server', 'remove-server', 'join-selected']) this.get(name).disabled = !this.selectedId;
    }
    fillServer(server) {
        if (!server) return;
        this.resetWorldChoices();
        this.get('server').value = server.url; this.get('room').value = server.room;
        this.get('bookmark-name').value = server.name;
        this.get('password').value = ''; this.get('server-password').value = '';
    }
    resetWorldChoices() {
        this.get('room-choice').replaceChildren(new Option('Tự chọn đảo mặc định', ''));
    }
    showConnection(action, bookmark = false) {
        if (this.busy) return;
        this.get('servers-view').hidden = true; this.form.hidden = false;
        this.get('bookmark-fields').hidden = !bookmark; this.get('save-server').hidden = !bookmark;
        this.select(action);
        this.get(bookmark ? 'bookmark-name' : 'name').focus();
    }
    saveBookmark() {
        try {
            const saved = this.bookmarks.save({ id: this.editingId, name: this.get('bookmark-name').value,
                url: this.get('server').value, room: this.get('room').value });
            this.selectedId = saved.id; this.editingId = null;
            this.showServers(); this.refreshServers();
        } catch (error) { this.get('error').textContent = error.message || 'Không lưu được server.'; }
    }
    async refreshServers() {
        this.probes?.abort(); const controller = this.probes = new AbortController();
        this.get('list-status').textContent = 'Đang kiểm tra kết nối…';
        await Promise.allSettled(this.servers.map(async server => {
            let result;
            try { result = await queryServer({ url: server.url, signal: controller.signal }); }
            catch (error) { result = { error: error.message }; }
            if (controller.signal.aborted || !this.element.isConnected) return;
            this.statuses.set(server.id, result);
        }));
        if (!controller.signal.aborted && this.element.isConnected) {
            this.renderServers(); this.get('list-status').textContent = 'Đã cập nhật trạng thái server.';
        }
    }
    async findWorlds() {
        this.worldProbe?.abort(); const controller = this.worldProbe = new AbortController();
        this.get('status').textContent = 'Đang tải danh sách đảo…'; this.get('error').textContent = '';
        try {
            const status = await queryServer({ url: this.get('server').value, serverPassword: this.get('server-password').value, signal: controller.signal });
            if (controller.signal.aborted) return;
            const select = this.get('room-choice'); select.replaceChildren(new Option('Tự chọn đảo mặc định', ''));
            for (const room of status.rooms) {
                const option = new Option(`${room.name} · ${room.players}/${status.maxPlayers}${room.locked ? ' · Có mật khẩu' : ''}`, room.code);
                option.disabled = !room.ready; select.add(option);
            }
            select.value = this.get('room').value;
            this.get('status').textContent = status.rooms.length ? 'Chọn đảo để tham gia.' : 'Server chưa có đảo. Kết nối để tạo đảo mặc định.';
        } catch (error) { if (!controller.signal.aborted) { this.get('error').textContent = error.message; this.get('status').textContent = ''; } }
    }

    async connect() {
        if (this.busy) return;
        this.busy = true; this.cancelled = false;
        this.get('submit').disabled = true;
        this.get('error').textContent = ''; this.get('status').textContent = 'Đang kết nối server…';
        const client = this.client = new NetworkClient();
        try {
            const welcome = await client.connect({ action: this.action, url: this.get('server').value,
                name: this.get('name').value, room: this.get('room').value, password: this.get('password').value,
                serverPassword: this.get('server-password').value,
                world: { name: this.get('world').value, seed: this.get('seed').value, mode: this.get('mode').value } });
            if (this.cancelled) return;
            this.get('status').textContent = `Phòng ${welcome.room} · Đang chuẩn bị đảo…`;
            await this.scene._launchNetworkWorld(client);
            this.client = null; // Ownership has moved to GameScene.
        } catch (error) {
            client.close();
            if (!this.cancelled) { this.get('error').textContent = error.message; this.get('status').textContent = ''; }
        } finally { this.busy = false; this.get('submit').disabled = false; }
    }
    dispose() { this.probes?.abort(); this.worldProbe?.abort(); this.element.removeEventListener('keydown', this.onKey); this.element.remove(); }
}
