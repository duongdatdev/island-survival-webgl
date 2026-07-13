# Kiểm tra Game v0.1 → v0.4 — Báo cáo Bug, Logic & Gợi ý

> Rà soát toàn bộ codebase từ MVP (v0.1) đến Dynamic World (v0.4).
> Mỗi mục đã được **đọc & đối chiếu trực tiếp với source code**. Các claim chưa
> chắc chắn được đánh dấu rõ ràng để tránh sửa nhầm.

**Ngày rà soát:** 2026-07-14
**Phạm vi:** `src/` (v0.1 MVP, v0.2 Survival, v0.3 Island Expansion, v0.4 Dynamic World)

---

## 🔴 Mức độ ưu tiên

| # | File | Vấn đề | Mức độ | Trạng thái |
|---|------|--------|--------|------------|
| 1 | VitalsSystem.js | Hằng số drain không khớp ROADMAP/comment | Cao | 🛠️ Đã sửa (30s/20s) |
| 2 | GameScene.js `_placeStructure` | Đặt lại structure đã build → mất item, dời vị trí | Cao | 🛠️ Đã sửa (guard) |
| 3 | Player.js `boundaryLimit=46` | Ranh giới hardcode, đảo lại procedural | Cao | 🛠️ Đã sửa (theo island.radius) |
| 4 | GameScene.js moon sprite | Logic hiển thị mặt trăng chưa đúng | Trung bình | 🛠️ Đã sửa |
| 5 | GameScene.js sun dir | Sprite dùng dir chưa clamp, lệch với ánh sáng | Trung bình | ⚠️ Giữ nguyên (chủ ý — xem ghi chú) |
| 6 | InventoryV2 overflow | Item bị mất im lặng khi túi đầy | Trung bình | 🛠️ Đã sửa (Resource+Debris) |
| 7 | ResourceManager / DriftingDebris | Ngưỡng shore height không nhất quán (0.1 vs 0.15) | Thấp | 🛠️ Đã sửa (SHORE_HEIGHT) |
| 8 | Treasure chest quadrant | Phân loại phần thưởng theo dấu cx/cz mong manh | Thấp | 🛠️ Đã sửa (tag rewardType) |

> **Cập nhật 2026-07-14:** Đã áp dụng sửa cho #1–4, #6–8. Riêng #5 giữ nguyên
> (mặt trời lặn dưới đường chân trời là chủ ý; chỉ moon visibility ở #4 được sửa).
> Tất cả file đã qua `node --check`.

---

## ❌ Các "bug" bị báo nhầm (ĐÃ KIỂM TRA — KHÔNG sửa)

Ghi lại để tránh sửa nhầm dựa trên báo cáo tự động:

- **TerrainGenerator.js:20 — "waves = [] chạy sau constructor gây crash":**
  SAI. Class field initializer chạy **trước** thân constructor (ở class không kế thừa),
  nên `this.waves` đã tồn tại khi `push()`. Game chạy được là bằng chứng. Tuy vậy nên
  **dời `waves = []` lên đầu class** cho dễ đọc (cải thiện, không phải bug).

- **Camera.js:114 — "deltaTime clamp về min là sai":**
  SAI. `Math.max(deltaTime, 0.0001)` là **chặn dưới** chống chia cho 0 / dt=0, đúng ý đồ.
  Việc chặn **trên** (spiral of death) đã nằm ở `GameLoop`.

- **WeatherSystem — "thunderPending không bao giờ reset → sấm chồng":**
  SAI. `thunderPending` được reset về `false` ở đầu mỗi `update()` (dòng 48) và chỉ set
  `true` đúng frame có strike. `GameScene` đọc sau `weather.update()` cùng frame ⇒ đã là
  rising-edge chuẩn, mỗi tia sét chỉ 1 tiếng sấm.

---

## 1. v0.1 — MVP Core

### VitalsSystem.js — Hằng số không khớp tài liệu ✅
- **Vị trí:** `src/systems/VitalsSystem.js:26-28`
- **Vấn đề:** Comment & ROADMAP ghi *"Hunger drains 1 every 30s, Thirst every 20s"* nhưng code là
  `hungerDrainInterval = 25`, `thirstDrainInterval = 18`.
- **Sửa:** Thống nhất số. Nếu 25/18 là giá trị đã cân bằng lại thì **cập nhật comment + ROADMAP**;
  nếu không, đổi về 30/20.

### VitalsSystem.js — Speed multiplier khi stamina âm
- **Vị trí:** `src/systems/VitalsSystem.js:122-124`
- **Vấn đề:** `getSpeedMultiplier()` dùng `stamina <= 0`. Vì `_setVital` đã clamp về 0 nên
  không âm được ⇒ **không phải bug**, nhưng khi stamina = 0 và bắt đầu hồi lại vẫn giữ 0.5x
  cho tới khi > 0. Chấp nhận được, chỉ cần biết là hành vi cố ý.

### Player.js — Ranh giới hardcode 46.0 ✅
- **Vị trí:** `src/entities/Player.js:83`
- **Vấn đề:** `boundaryLimit = 46.0` cứng, trong khi đảo là **procedural** (bán kính thay đổi theo seed).
  Player có thể đi ra vùng nước/khoảng trống nếu đảo nhỏ hơn 46, hoặc bị chặn sớm nếu đảo lớn hơn.
- **Sửa:** Lấy bán kính từ `this.world.terrainGenerator.island.radius` (+ đệm bãi biển) thay vì hằng số.

### InventoryV2.js — Mất item im lặng khi túi đầy ✅
- **Vị trí:** `src/systems/InventoryV2.js` (`addItem` trả `false`)
- **Vấn đề:** Khi túi đầy, pickup bị bỏ nhưng không có thông báo. Người chơi tưởng đã nhặt.
- **Sửa:** Khi `addItem` thất bại ở `ResourceManager`/`DebrisManager`, gọi
  `_showNotification('❌ Túi đồ đầy!')` và **không xóa** resource khỏi thế giới.

### ResourceManager / DriftingDebris — Ngưỡng shore không nhất quán ✅
- **Vị trí:** `ResourceManager.js` (0.1 vs 0.15), `DriftingDebris.js`
- **Vấn đề:** Vài chỗ coi "đất liền" là `> 0.1`, chỗ khác `> 0.15`. Gây spawn/hành vi trôi dạt lệch.
- **Sửa:** Định nghĩa 1 hằng số chung `SHORE_HEIGHT = 0.15` và dùng thống nhất.

### RaftAssembly — `isComplete()` không tính sail/motor
- **Vị trí:** `src/entities/RaftAssembly.js`
- **Ghi chú:** `isComplete()` = frame+floats+paddle (đúng ý đồ: sail/motor là **nâng cấp tùy chọn**
  của v0.3). Không phải bug — chỉ cần comment rõ để tránh hiểu nhầm.

---

## 2. v0.2 — Survival Systems

### GameScene `_placeStructure` — Đặt lại structure đã build ✅
- **Vị trí:** `src/scenes/GameScene.js:1504-1550`
- **Vấn đề:** Không chặn đặt lại khi `campfire.isBuilt`/`waterCollector.isBuilt` đã true. Nếu người chơi
  craft thêm campfire rồi đặt, structure cũ bị **dời vị trí** (chỉ có 1 instance), item bị tiêu hao.
- **Sửa:** Thêm guard đầu hàm: `if (type === 'campfire' && this.campfire.isBuilt) { thông báo; return; }`
  (tương tự water_collector). Hoặc cho phép nhiều instance thật sự (nâng cấp lớn hơn).

### GameScene — Không consume phím sau khi dùng item (Q)
- **Vị trí:** `src/scenes/GameScene.js:578, _useActiveItem`
- **Vấn đề:** `isKeyPressed('KeyQ')` đã là single-frame nên rủi ro thấp, nhưng để nhất quán với
  cách xử lý `KeyE` (set `keys[...] = false`) nên cân nhắc đồng bộ.
- **Sửa:** Không bắt buộc; chỉ dọn cho nhất quán.

### Đối chiếu recipes — OK
- Đã kiểm chi phí crafting trong `RecipeDatabase` khớp ROADMAP. Không có mismatch.

---

## 3. v0.3 — Island Expansion

### Treasure Chest — Phân loại phần thưởng theo dấu cx/cz ⚠️
- **Vị trí:** `src/scenes/GameScene.js:1716-1750` (`_openTreasureChest`)
- **Vấn đề:** Reward xác định bằng dấu `cx`/`cz` (góc phần tư). Nếu rương nằm sát trục (cx≈0 hoặc cz≈0)
  sẽ rơi vào nhánh `else` mặc định và **mở nhầm blueprint**. Chests được đặt với góc trong
  `[0.15, π/2-0.15]` nên xác suất chạm trục gần như bằng 0 ⇒ rủi ro thấp, nhưng thiết kế mong manh.
- **Sửa (bền hơn):** Lưu `quadrant`/`rewardType` vào object chest lúc spawn (trong `EnvironmentBuilder`)
  thay vì suy ra từ tọa độ khi mở.

### Fishing — Yêu cầu cần câu ở đúng ô hotbar đang chọn
- **Vị trí:** `src/scenes/GameScene.js:784-796`
- **Ghi chú:** Chỉ câu được khi `fishing_rod` nằm ở ô hotbar đang chọn. Có thể là ý đồ (phải trang bị),
  nhưng dễ gây bối rối. **Gợi ý:** hiện hint "Chọn cần câu ở hotbar" khi có cần trong túi mà chưa chọn.

### `_regenerateWorld` — Thứ tự xóa/tạo lại resource
- **Vị trí:** `src/scenes/GameScene.js:1914-2014`
- **Ghi chú:** Gọi `resourceManager.delete()` rồi gán lại `worldResources = []` và spawn tiếp. Cần đảm bảo
  `ResourceManager.delete()` **chỉ giải phóng GL buffer**, không null hóa chính instance. Đọc code cho thấy
  instance vẫn sống ⇒ OK, nhưng nên thêm comment cảnh báo. Chỉ dùng khi bật debug biome nên tác động thấp.

---

## 4. v0.4 — Dynamic World

### GameScene — Logic hiển thị Mặt Trăng ✅
- **Vị trí:** `src/scenes/GameScene.js:924`
- **Vấn đề:** `moonSprite.visible = -sunDirNorm[1] > -0.1 && sunIntensity < 0.8`
  → tương đương `sunDirNorm[1] < 0.1`. Trăng có thể ló ra ban ngày lúc mặt trời gần đường chân trời.
- **Sửa:** Đổi thành `sunDirNorm[1] < -0.1 && sunIntensity < 0.5` (chỉ hiện khi mặt trời **dưới** chân trời).

### GameScene — Hướng mặt trời sprite lệch với ánh sáng ✅
- **Vị trí:** `src/scenes/GameScene.js:897 vs 906-918`
- **Vấn đề:** Ánh sáng dùng `dayNight.getSunDirection()` (đã clamp `Math.max(-0.3, ly)`), còn vị trí sprite
  tính lại `sunDirRaw` **không clamp**. Lúc hoàng hôn, đĩa mặt trời và hướng đổ bóng lệch nhau.
- **Sửa:** Dùng chung một vector (hoặc chấp nhận và comment rõ là cố ý để mặt trời lặn dưới đường chân trời).

### DayNightCycle — Kiểm tra tính liên tục màu ở nửa đêm (⚠️ cần nhìn mắt)
- **Vị trí:** `src/systems/DayNightCycle.js:123-171`
- **Ghi chú:** Nhánh `t≥0.92` nội suy về gần `t=0`. Các giá trị đầu/cuối khá gần (top ~0.02..0.03) nên
  liên tục, nhưng nên **quan sát trực tiếp** lúc chuyển đêm→bình minh để chắc không giật màu.

### AudioManager — `playThunder` tạo node không disconnect (rò rỉ nhẹ)
- **Vị trí:** `src/core/AudioManager.js` (`playThunder`)
- **Vấn đề:** Mỗi tia sét tạo filter+gain nối vào masterGain, dựa vào GC tự dọn sau khi source kết thúc.
  Trên đa số trình duyệt hiện đại là ổn (node tự ngắt khi source `ended`), nhưng bão kéo dài tạo nhiều node.
- **Sửa (tùy chọn):** Gọi `source.onended = () => { gain.disconnect(); filter.disconnect(); }`.

### RainSystem — Kích thước bufferSubData (⚠️ cần kiểm)
- **Vị trí:** `src/systems/RainSystem.js` (~dòng 135)
- **Ghi chú:** Báo cáo tự động nghi ngờ số float ghi vào buffer lệch với số vertex. **Chưa xác nhận** —
  cần đọc kỹ layout (mỗi streak = 2 đỉnh, 3 float/đỉnh). Đánh dấu để kiểm nếu thấy giọt mưa nhấp nháy.

---

## 💡 Gợi ý cải tiến (ngoài bug)

1. **Tập trung hằng số thế giới** — `boundaryLimit`, `SHORE_HEIGHT`, bán kính đảo, ngưỡng spawn nên gom
   vào một `WorldConfig.js` để tránh lệch số rải rác (đang gây ra bug #3, #7).
2. **Cache-busting `?v=6/?v=7`** rải rác trong `GameScene.js` import — dễ lệch phiên bản giữa các file.
   Cân nhắc build step hoặc bỏ query khi không cần.
3. **Save/Load (v1.0)** — Vitals, inventory, tiến độ raft, seed thế giới đều đã ở dạng dữ liệu thuần,
   rất dễ serialize sang `localStorage`. Nền tảng tốt để làm sớm.
4. **DayNight `daySpeed=0.02`** ⇒ 1 ngày ≈ 50s thực. Khá nhanh cho survival; cân nhắc cho chỉnh trong Settings.
5. **Consolidate xử lý phím E** — nhiều nhánh `keys['KeyE']=false` (waterfall/fishing/chest/campfire/raft).
   Gom thành một "interaction priority handler" để tránh double-trigger giữa các POI gần nhau.
6. **Kiểm thử tự động nhẹ** — chưa có test runner. Thêm vài unit test cho `VitalsSystem`, `InventoryV2`,
   `CraftingSystem`, `WeatherSystem` (logic thuần, không cần WebGL) sẽ bắt được bug hằng số/stacking sớm.
7. **Accessibility** — HUD dùng nhiều emoji + màu; cân nhắc text label và tương phản đủ cho v1.0 polish.

---

## Kết luận

Codebase v0.1→v0.4 **chạy ổn định**, kiến trúc tách module tốt. Không có bug chí mạng gây crash
(3 "critical" từ quét tự động đều là false-positive, đã kiểm chứng). Nhóm bug đáng sửa nhất:

1. **VitalsSystem hằng số** (khớp lại tài liệu) — dễ, tác động balance.
2. **`_placeStructure` đặt trùng** — dễ, tránh mất item.
3. **Player boundary hardcode** — vừa, ảnh hưởng mọi seed đảo.
4. **Moon/Sun sprite logic** — vừa, ảnh hưởng chất lượng hình ảnh v0.4.

Còn lại là cải thiện chất lượng & robustness, không chặn tiến độ sang **v0.5 Wildlife & Combat**.
