import { STRUCTURE_DEFINITIONS, CAMPAIGN_BALANCE } from '../gameplay/CampaignDatabase.js';
import { ItemContainer, transactCraft } from './ItemContainer.js';
import { SpatialGrid } from './SpatialGrid.js';
import { assertRegistrySnapshot } from './CampaignSnapshotSchema.js';

const quarter = Math.PI / 2;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export class StructureRegistry {
    constructor(options = {}) {
        this.structures = new Map();
        this.index = new SpatialGrid(8);
        this.terrain = options.terrain || { getHeight: () => 1 };
        this.level = options.level || (() => 1);
        this.obstacles = options.obstacles || (() => []);
        this.protectedAreas = options.protectedAreas || [];
        this.events = options.events || null;
        this.nextId = 1;
        this.respawnBedId = null;
    }

    bounds(record) {
        const size = STRUCTURE_DEFINITIONS[record.type].size;
        const rotated = Math.abs(Math.sin(record.yaw)) > 0.5;
        const center = [...record.position];
        center[1] += size[1] / 2;
        if (record.type === 'door') {
            center[0] += Math.cos(record.yaw) * 0.5;
            center[2] -= Math.sin(record.yaw) * 0.5;
        }
        const dimensions = rotated ? [size[2], size[1], size[0]] : size;
        return { min: center.map((v, axis) => v - dimensions[axis] / 2),
            max: center.map((v, axis) => v + dimensions[axis] / 2) };
    }

    preview(type, position, yaw = 0, parentId = null) {
        const definition = STRUCTURE_DEFINITIONS[type];
        if (!definition || !Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(yaw)) {
            return { valid: false, reason: 'Công trình hoặc vị trí không hợp lệ.' };
        }
        yaw = Math.round(yaw / quarter) * quarter;
        const record = { type, position: [...position], yaw, parentId };
        if (type === 'foundation') {
            record.position[0] = Math.round(position[0] / 2) * 2;
            record.position[2] = Math.round(position[2] / 2) * 2;
        }
        const parent = this.structures.get(parentId);
        if (definition.parent) {
            if (!parent || parent.type !== definition.parent) return { valid: false, reason: 'Cần gắn vào ' + STRUCTURE_DEFINITIONS[definition.parent].name + '.' };
            record.position = [...parent.position];
            if (definition.edge) {
                record.position[0] += Math.sin(yaw);
                record.position[2] += Math.cos(yaw);
                record.position[1] += 0.2;
            } else if (type === 'roof') record.position[1] += 2.6;
            else if (type === 'floor') record.position[1] += 0.2;
            else if (type === 'door') {
                record.yaw = parent.yaw;
                record.position[0] -= Math.cos(parent.yaw) * 0.5;
                record.position[2] += Math.sin(parent.yaw) * 0.5;
            }
        } else {
            record.parentId = null;
            const support = [...this.structures.values()].find(structure => structure.type === 'foundation'
                && Math.abs(structure.position[0] - record.position[0]) <= 0.8
                && Math.abs(structure.position[2] - record.position[2]) <= 0.8);
            if (support && !definition.structural && !definition.waterOnly) {
                record.parentId = support.id;
                record.position[1] = support.position[1] + 0.4;
            } else record.position[1] = definition.waterOnly ? -0.2
                : this.terrain.getHeight(record.position[0], record.position[2]);
        }
        return this._validate(record);
    }

    _validate(record) {
        const definition = STRUCTURE_DEFINITIONS[record.type];
        const fail = reason => ({ valid: false, reason, record });
        if (definition.tier > this.level()) return fail(`Cần công nghệ cấp ${definition.tier}.`);
        const sameKind = [...this.structures.values()].filter(structure =>
            STRUCTURE_DEFINITIONS[structure.type].structural === definition.structural).length;
        if (sameKind >= (definition.structural ? CAMPAIGN_BALANCE.maximumParts : CAMPAIGN_BALANCE.maximumStructures)) {
            return fail('Đã đạt giới hạn công trình của thế giới.');
        }
        const bounds = this.bounds(record);
        if (!definition.parent && !record.parentId) {
            const heights = [[bounds.min[0], bounds.min[2]], [bounds.max[0], bounds.min[2]],
                [bounds.min[0], bounds.max[2]], [bounds.max[0], bounds.max[2]]]
                .map(([x, z]) => this.terrain.getHeight(x, z));
            if (definition.waterOnly) {
                if (Math.max(...heights) >= 0.15 || Math.min(...heights) < -2.5) return fail('Đặt bẫy tại vùng nước nông.');
            } else {
                if (Math.min(...heights) < 0.15) return fail('Không thể xây trong nước.');
                if (Math.max(...heights) - Math.min(...heights) > CAMPAIGN_BALANCE.maximumSlope) return fail('Mặt đất quá dốc.');
                record.position[1] = Math.max(...heights);
            }
        }
        if (this.protectedAreas.some(area => distance(area.position, record.position)
            < area.radius + Math.max(definition.size[0], definition.size[2]) / 2)) return fail('Khu vực này dành cho khám phá và nhiệm vụ.');
        const adjusted = this.bounds(record);
        const intersects = other => adjusted.min.every((low, axis) =>
            low < other.max[axis] - 0.01 && adjusted.max[axis] > other.min[axis] + 0.01);
        for (const other of this.index.query(adjusted)) {
            if (other.id === record.parentId) continue;
            if (intersects(this.bounds(other))) return fail('Vị trí đang bị công trình khác chiếm.');
        }
        if (this.obstacles(adjusted).some(obstacle => intersects(obstacle))) return fail('Vị trí vướng đá hoặc vật thể.');
        return { valid: true, reason: '', record };
    }

    place(type, position, yaw, inventory, options = {}) {
        const preview = this.preview(type, position, yaw, options.parentId);
        if (!preview.valid) return { ok: false, error: preview.reason };
        const definition = STRUCTURE_DEFINITIONS[type];
        const ingredients = options.fromItem ? { [type]: 1 } : definition.ingredients;
        if (!transactCraft([inventory], ingredients, [])) return { ok: false, error: 'Không đủ vật liệu để xây.' };
        const record = { ...preview.record, id: `structure-${this.nextId++}`, fuelSeconds: 0,
            waterStored: 0, rainProgress: 0, allowCrafting: false, open: false, jobs: [] };
        if (definition.capacity) record.container = new ItemContainer(definition.capacity);
        this.structures.set(record.id, record);
        this.index.insert(record.id, this.bounds(record), record);
        this.events?.emit('structurePlaced', { type, id: record.id, position: record.position });
        return { ok: true, structure: record };
    }

    dismantle(id, inventory) {
        const record = this.structures.get(id);
        if (!record) return { ok: false, error: 'Công trình không còn tồn tại.' };
        if ([...this.structures.values()].some(other => other.parentId === id)) return { ok: false, error: 'Tháo các bộ phận gắn vào trước.' };
        if (record.container?.getUsedSlots() || record.jobs.length || record.crop) return { ok: false, error: 'Lấy hết đồ và dừng hoạt động trước khi tháo.' };
        const refund = Object.entries(STRUCTURE_DEFINITIONS[record.type].ingredients)
            .map(([id, count]) => ({ id, count: Math.floor(count * 0.75) })).filter(item => item.count);
        if (!transactCraft([inventory], {}, refund)) return { ok: false, error: 'Túi không đủ chỗ nhận vật liệu.' };
        this.structures.delete(id);
        this.index.remove(id);
        if (this.respawnBedId === id) this.respawnBedId = null;
        this.events?.emit('structureRemoved', { type: record.type, id });
        return { ok: true };
    }

    sheltered(position) {
        return [...this.structures.values()].some(record => {
            const definition = STRUCTURE_DEFINITIONS[record.type];
            if (record.type !== 'roof' && !definition.shelter) return false;
            const bounds = this.bounds(record);
            const roofY = record.type === 'roof' ? record.position[1] : bounds.max[1];
            return position[0] >= bounds.min[0] && position[0] <= bounds.max[0]
                && position[2] >= bounds.min[2] && position[2] <= bounds.max[2]
                && position[1] <= roofY && position[1] > roofY - 3;
        });
    }

    nearby(position, radius = 3) {
        return this.index.queryRadius(position, radius).filter(record => distance(position, record.position) <= radius)
            .sort((a, b) => distance(a.position, position) - distance(b.position, position));
    }

    craftingSources(position, inventory) {
        return [inventory, ...this.nearby(position, CAMPAIGN_BALANCE.craftingRadius)
            .filter(record => ['chest', 'large_chest'].includes(record.type) && record.allowCrafting).map(record => record.container)];
    }

    snapshot() {
        return { nextId: this.nextId, respawnBedId: this.respawnBedId,
            structures: [...this.structures.values()].map(record => ({ ...record,
                position: [...record.position], container: undefined, slots: record.container?.snapshot() || null })) };
    }

    restore(snapshot) {
        assertRegistrySnapshot(snapshot);
        if (!snapshot || !Array.isArray(snapshot.structures)) throw new Error('Dữ liệu công trình không hợp lệ.');
        const records = new Map();
        for (const saved of snapshot.structures) {
            const definition = STRUCTURE_DEFINITIONS[saved.type];
            if (!definition || typeof saved.id !== 'string' || records.has(saved.id)
                || !Array.isArray(saved.position) || saved.position.length !== 3
                || !saved.position.every(Number.isFinite) || !Number.isFinite(saved.yaw)) throw new Error('Công trình bị hỏng trong bản lưu.');
            const record = { ...structuredClone(saved), jobs: saved.jobs || [] };
            if (definition.capacity) {
                record.container = new ItemContainer(definition.capacity);
                if (!record.container.restore(saved.slots)) throw new Error('Kho công trình bị hỏng trong bản lưu.');
            }
            records.set(record.id, record);
        }
        for (const record of records.values()) if (record.parentId && !records.has(record.parentId)) throw new Error('Mất công trình nền trong bản lưu.');
        this.structures = records;
        this.index.clear();
        for (const record of records.values()) this.index.insert(record.id, this.bounds(record), record);
        this.nextId = Math.max(Number(snapshot.nextId) || 1, 1 + Math.max(0, ...[...records.keys()].map(id => Number(id.replace('structure-', '')) || 0)));
        this.respawnBedId = records.get(snapshot.respawnBedId)?.type === 'bed' ? snapshot.respawnBedId : null;
    }
}
