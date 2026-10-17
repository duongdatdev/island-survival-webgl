# Kết quả nâng cấp đồ họa — 18/10/2026

Triển khai bằng ba agent GPT-6 Luna chạy song song; agent chính tích hợp, rà soát mã nguồn, xem ảnh và chạy kiểm tra cuối. Các commit dùng dạng Conventional Commits giống lịch sử gần đây của dự án, tách renderer, model, terrain, chất lượng và tích hợp thành các thay đổi riêng.

## Đã triển khai

| Hạng mục từ audit | Kết quả |
| --- | --- |
| Tone mapping và màu | Đường cong ACES tăng đơn điệu; palette/texture màu được chuyển sang linear cho ánh sáng; base/emissive dùng sRGB, normal/AO/metallic-roughness dùng linear. Texture không phải lũy thừa hai vẫn có mipmap và repeat trong WebGL 2. |
| Khử răng cưa và hậu kỳ | FXAA lấy mẫu màu sau tone mapping; depth texture cho sương dưới nước và bóng tiếp xúc màn hình; HDR có fallback RGBA8. |
| Bóng và nguồn sáng | Shadow map quanh camera, PCF 3×3, bóng tiếp xúc mềm trên terrain; một nguồn sáng chính cùng tối đa ba nguồn lửa bổ sung. |
| Vật liệu | glTF truyền roughness, metallic, normal, AO, emissive và packed metallic-roughness vào shader chung; các cờ/material state được khôi phục sau mỗi model. |
| Địa hình | Shader bổ sung biến thiên màu theo vị trí, độ dốc, khoảng cách và dải cát ẩm; terrain có frustum culling và LOD hysteresis. |
| Mật độ và bố cục | Cỏ, bụi thấp, sỏi, lá rụng theo cụm, xác định từ seed; cache giới hạn và phạm vi theo camera/preset; tránh vị trí tương tác, lối đi, nước và dốc quá lớn. |
| Landmark và mangrove | Thêm đá, dương xỉ, gỗ trang trí ở ngoại vi landmark và các mảng bùn ướt trong mangrove, theo địa hình thực tế. |
| Nước | Foam theo độ sâu địa hình, vỡ không đều; phản chiếu trời procedural theo màu hiện tại; caustics nhẹ ở nước nông; fog được nối vào gameplay và chuyển màu đúng. |
| Vật nhặt | Thay fallback cube bằng các silhouette low-poly cho đá, quặng, sợi, thảo mộc, cá, thịt và vật phẩm thường gặp. Model riêng hiện có vẫn được sử dụng khi có. |
| Chuyển động | Tán lá xanh có gió; deer/goat/monitor có biến dạng cục bộ theo gait và chuyển động idle, giữ vị trí gốc của entity. |
| Hiệu năng | Standing environment và shadow caster được instancing; đếm draw calls/tam giác từ lệnh GPU thực tế; hạn chế ground-cover cache và số bóng tiếp xúc. |
| Thiết lập | Điều khiển AA, shadows, AO, foliage, water detail và pixel ratio; Low/Medium/High/Ultra có budget riêng; render buffer giới hạn 4 triệu pixel. |

Các lớp trang trí chỉ tồn tại ở renderer. Không đổi generator version, cao độ terrain, collision, navigation hay schema save. Khi regenerate, các renderer phụ được xây dựng lại; cây đang đổ được tách khỏi nhóm static và xóa khỏi nhóm khi hoàn tất.

Tay góc nhìn thứ nhất dùng vùng depth gần để giữ lại depth của cảnh phía ngoài silhouette tay/vũ khí cho hậu kỳ.

## Kiểm tra cuối

- `npm test`: **280/280**.
- `node --test tests/graphics-*.test.js`: **13/13** sau các sửa cuối.
- Hồi quy Chrome/GPU native: **46/46**.
- Chạy lại smoke test đồ họa sau chỉnh bóng tiếp xúc cuối: **1/1**, kiểm tra 11 cảnh và bốn preset, không có lỗi WebGL/runtime.
- `npm run build`: thành công.
- Mã nguồn được kiểm tra: `7f2eb5a`.

Lệnh hồi quy trình duyệt dùng Chrome và GPU native:

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
$env:PLAYWRIGHT_GPU='native'
npx playwright test --grep-invert "chapters one to five connect"
```

Bài end-to-end xuyên suốt năm chương chờ nung quặng theo thời gian thật được loại khỏi vòng đồ họa cuối. Các bài production/repair/progression trong Node và các luồng save, xây dựng, chế tạo, lặn, combat, wildlife, audio, ending và giao diện còn lại vẫn được kiểm tra.

## Hình ảnh và số liệu

- [Bãi biển trước nâng cấp](../docs/images/graphics-before-beach.png), [sau nâng cấp](../docs/images/graphics-after-beach.png).
- [Mangrove sau nâng cấp](../docs/images/graphics-after-mangrove.png).
- [Bờ biển nhìn ra đại dương](../docs/images/graphics-after-ocean.png).
- [Cảnh dưới nước](../docs/images/graphics-after-underwater.png).
- [Dữ liệu đo và camera](graphics-verification.json); toàn bộ ảnh local ở `.cache/graphics-after/`.

| Preset | Render buffer | FPS trung bình | p95 frame time | Draw calls | Shadow draws |
| --- | --- | --- | --- | --- | --- |
| low | 1120×630 | 120.0 | 8.4 ms | 224 | 0 |
| medium | 1360×765 | 119.6 | 8.4 ms | 366 | 114 |
| high | 1600×900 | 118.8 | 8.4 ms | 439 | 149 |
| ultra | 1600×900 | 119.2 | 8.4 ms | 570 | 193 |

Mẫu FPS bản development dài 2,5 giây/preset tại spawn, simulation vẫn chạy, viewport 1600×900, Chrome/ANGLE D3D11 trên AMD Radeon Graphics. Đây là smoke sample ngắn trên một GPU; chưa phải nghiệm thu stress tại căn cứ tối đa hay đo 1080p/1440p trên nhiều máy. Số draw calls bao gồm shadow pass, submesh, instancing và các pass toàn màn hình.

## Phạm vi kỹ thuật

AO hiện là hiệu ứng tiếp xúc theo depth với tám mẫu, không phải SSAO đầy đủ dựa trên normal. Phản chiếu nước và caustics là procedural; chưa có planar reflections hay SSR. Chuyển động wildlife là biến dạng vertex trên mesh hiện có, chưa thêm skeleton/animation clips. Shader vật liệu dùng các tham số glTF trong ánh sáng stylized, chưa phải một renderer PBR đầy đủ.

Texture có UV set khác với base-color UV được bỏ qua và ghi vào `drawable.unsupportedTextureCoordinates`, để tránh lấy mẫu sai. Các mức chất lượng cao cần được tiếp tục đo trên phần cứng mục tiêu khi tăng số công trình hoặc asset.

Build vẫn có cảnh báo bundle JavaScript lớn hơn 500 kB; build hoàn tất thành công.
