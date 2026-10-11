import { writeFile } from 'node:fs/promises';
import { getCampaignRecipes, STRUCTURE_DEFINITIONS, CAMPAIGN_BALANCE } from '../src/gameplay/CampaignDatabase.js';
import { getResourceDef } from '../src/systems/ResourceDatabase.js';

// Match CampaignUI/ProductionSystem precedence: Campaign replaces Classic IDs.
const recipes = getCampaignRecipes();
const name = id => getResourceDef(id)?.name || id;
const items = ingredients => Object.entries(ingredients).map(([id, count]) => `${name(id)} ×${count}`).join(', ');
const stationName = id => id ? Object.values(STRUCTURE_DEFINITIONS).find(s => s.station === id)?.name || id : 'Bằng tay';
const cell = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const row = values => '| ' + values.map(cell).join(' | ') + ' |';
const lines = [
    '# Công thức và xây dựng Campaign', '',
    'Tạo lại từ dữ liệu đang dùng bằng `node scripts/document-campaign-recipes.mjs`. Bảng áp dụng cho Campaign; công thức trùng mã của Classic được thay bằng bản Campaign.', '',
    'Cấp 1 có từ đầu. Hoàn thành chương 2 mở cấp 2; hoàn thành chương 4 mở cấp 3. Bản thiết kế là điều kiện bổ sung khi được ghi trong bảng. Công thức không có thời gian được chế tạo ngay.', '',
    'Đứng trong 3 m của trạm cần dùng. Nguyên liệu lấy từ túi và các rương đồng ý chia sẻ trong 5 m. Lò nung/giàn hun khói có tối đa 5 lượt: đặt lượt sẽ giữ nguyên liệu; hết nhiên liệu hoặc đầy kho thành phẩm thì tạm dừng. Hủy lượt chưa hoàn thành trả nguyên liệu nếu túi đủ chỗ.', '',
    `Một gỗ cấp ${CAMPAIGN_BALANCE.woodFuelSeconds} giây nhiên liệu, một than củi cấp ${CAMPAIGN_BALANCE.charcoalFuelSeconds} giây. Lửa không có mái che giảm hiệu quả khi mưa. Thời gian dưới đây là thời gian xử lý khi đủ nhiên liệu và hoạt động hết hiệu quả; không tiến triển khi đóng game.`, '',
    '## Chế tạo', '',
    row(['Mã', 'Công thức', 'Cấp', 'Trạm', 'Giây/lượt', 'Giây nhiên liệu tối thiểu', 'Nguyên liệu', 'Thành phẩm', 'Bản thiết kế']),
    '|---|---|---:|---|---:|---:|---|---|---|',
    ...recipes.map(r => row([r.id, r.name, r.tier || 1, stationName(r.station), r.duration || 0,
        r.fuel?.minimumSeconds || 0, items(r.ingredients), `${name(r.outputId || r.id)} ×${r.yield || 1}`, r.requiresBlueprint || '—'])), '',
    '## Xây dựng', '',
    'Vật dụng có công thức trong bảng trên được đặt bằng chế độ xây dựng. Bộ phận nhà dùng nguyên liệu trực tiếp. Lưới 2 m, xoay 90°. Giới hạn 400 bộ phận nhà và 80 vật dụng chức năng; tháo dỡ hợp lệ trả phần nguyên liệu đã làm tròn xuống ở mức 75%.', '',
    row(['Mã', 'Công trình', 'Cấp', 'Nguyên liệu', 'Phụ thuộc', 'Ô chứa']),
    '|---|---|---:|---|---|---:|',
    ...Object.values(STRUCTURE_DEFINITIONS).map(s => row([s.id, s.name, s.tier || 1, items(s.ingredients), s.parent || '—', s.capacity || 0])), '',
];
await writeFile(new URL('../tasks/recipe-catalogue.vi.md', import.meta.url), lines.join('\n'), 'utf8');
console.log(`Documented ${recipes.length} recipes and ${Object.keys(STRUCTURE_DEFINITIONS).length} structures.`);
