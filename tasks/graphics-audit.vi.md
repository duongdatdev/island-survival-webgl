# Đánh giá đồ họa Island Survival — 18/10/2026

Đề xuất giữ phong cách **low-poly nhiệt đới**, ưu tiên sửa pipeline màu và khử răng cưa, bổ sung bóng đổ và chi tiết mặt đất. Các ảnh đã kiểm tra cho thấy ánh sáng, độ gắn kết giữa vật thể với nền và cách phân bố chi tiết đang hạn chế hình ảnh nhiều hơn số lượng model.

Đây là báo cáo kiểm tra; chưa thay đổi mã nguồn game.

## Phạm vi và bằng chứng

- Đọc renderer, shader, asset loader, world generation, thiết lập chất lượng và animation.
- Chạy bản development bằng Chrome headless, WebGL 2 / ANGLE D3D11 trên AMD Radeon Graphics, cửa sổ và render buffer 1600 × 900, preset High.
- Dùng browser context mới, seed `biome-wildlife-qa`, cố định camera và giờ; chụp 11 ảnh gồm bờ biển, ba biome, toàn cảnh savanna, hoàng hôn, đêm, trại, thác và động vật. Camera chụp được đặt trực tiếp; đây không phải một lượt chơi tự nhiên hay benchmark FPS.
- Không ghi nhận `pageerror`; các lần đọc `gl.getError()` trong mẫu đều bằng 0.
- World mẫu có 2.400 environment entities và 180 terrain chunks. Không đo FPS mới trong lần audit này.

Ảnh và dữ liệu lưu cục bộ trong [thư mục audit](../.cache/graphics-audit-2026-10-18/). Thư mục `.cache` bị Git bỏ qua.

| Bằng chứng | Nhận xét từ ảnh |
| --- | --- |
| [Bờ biển](../.cache/graphics-audit-2026-10-18/ocean-shore.png) | Cát là mảng màu rộng, vật nhặt có nhiều khối hộp, chân cây thiếu bóng; bọt bờ thành một dải sáng khá đều. |
| [Savanna](../.cache/graphics-audit-2026-10-18/savanna-wide.png) | Có cây acacia nhận diện được biome, nhưng nền vàng trống và cây/bụi rải rời nhau. |
| [Jungle](../.cache/graphics-audit-2026-10-18/jungle.png) | Lá và mặt đất có chênh lệch màu mạnh; sườn đồi gần camera ít chi tiết. |
| [Mangrove](../.cache/graphics-audit-2026-10-18/mangrove.png) | Bộ rễ có hình dáng riêng, nhưng nền khô và cây lặp lại khiến cảm giác đầm lầy chưa rõ. |
| [Hoàng hôn](../.cache/graphics-audit-2026-10-18/beach-dusk.png), [đêm](../.cache/graphics-audit-2026-10-18/jungle-night.png) | Bầu trời thay đổi rõ, nhiều chi tiết nền gần trở nên khó đọc. |
| [Trại](../.cache/graphics-audit-2026-10-18/abandoned-camp.png), [thác](../.cache/graphics-audit-2026-10-18/waterfall.png) | Landmark đã hiện diện nhưng còn ít chi tiết chuyển tiếp giữa model và địa hình. |
| [Động vật](../.cache/graphics-audit-2026-10-18/wildlife.png) | Silhouette dễ nhận biết; bóng tiếp xúc sẽ giúp chúng đứng vững trên nền. Chuyển động được đánh giá thêm từ code, không từ ảnh tĩnh. |

## Danh sách ưu tiên

P0 là lỗi nền tảng nên sửa trước khi chỉnh mỹ thuật; P1 là thay đổi hình ảnh chính; P2 là bước hoàn thiện tiếp theo. Mức công sức là tương đối, chưa phải cam kết thời gian.

| Ưu tiên | Công việc | Kết quả mong muốn | Công sức |
| --- | --- | --- | --- |
| P0 | Sửa tone mapping, quy định không gian màu | Vùng sáng tăng đúng chiều; màu asset và ánh sáng nhất quán | Vừa |
| P0 | Khử răng cưa trên đường render có post-processing | Cạnh lá, thân cây, dây và công trình mượt hơn | Nhỏ–vừa |
| P0 | Nối fog giữa scene, terrain, vật thể và nước | Cảnh xa có chiều sâu; giảm cảm giác vật thể xuất hiện đột ngột | Nhỏ–vừa |
| P1 | Bóng mặt trời và bóng tiếp xúc | Cây, đá, động vật, công trình gắn với mặt đất | Lớn |
| P1 | Shader mặt đất và lớp trang trí gần camera | Cát, đất, cỏ, đá và đường mòn có chất liệu rõ hơn | Vừa–lớn |
| P1 | Bố trí cây theo cụm và thống nhất palette | Rừng, savanna và mangrove có bố cục, mật độ và màu riêng | Vừa |
| P1 | Thay các resource cube xuất hiện thường xuyên | Vật nhặt hòa hợp hơn với model môi trường hiện có | Vừa |
| P2 | Hoàn thiện bờ nước, phản chiếu trời và hiệu ứng lặn | Biển và vùng ngập nước thuyết phục hơn | Vừa–lớn |
| P2 | Gió trên tán lá và animation động vật | Môi trường có sức sống, chuyển động bớt trượt | Vừa–lớn |
| Xuyên suốt | Đếm draw calls đúng, culling, instancing, quality tiers | Giữ hiệu năng khi tăng mật độ và hiệu ứng | Vừa |

## Những chỗ cần sửa cụ thể

### 1. Pipeline màu và tone mapping

[PostShader.js](../src/shaders/PostShader.js) đang trộn màu gốc với `color / (1 + color)` bằng một hệ số phụ thuộc độ sáng. Phép trộn này **không tăng đơn điệu**: đánh giá công thức trên CPU với màu xám, exposure/tint bằng 1, không vignette, cho kết quả:

| Đầu vào | Đầu ra |
| --- | --- |
| 1,0 | 0,967 |
| 1,2 | 0,999 |
| 1,4 | 0,896 |
| 1,8 | 0,643 |

Đây là kiểm tra công thức, không phải đo độ sáng từ screenshot. Dữ liệu nằm ở [tonemap-samples.json](../.cache/graphics-audit-2026-10-18/tonemap-samples.json). Nên dùng một đường cong tone mapping tăng đơn điệu thống nhất, rồi chỉnh lại exposure và bloom trên cùng các góc chụp.

[Texture.js](../src/renderer/Texture.js) nạp texture bằng RGBA; shader hiện không thể hiện bước chuyển base color từ sRGB sang linear và mã hóa đầu ra tương ứng. Cần quy định rõ màu vertex/palette, base-color texture, dữ liệu vật liệu và output để tránh chỉnh sáng bằng nhiều hệ số bù. Theo [schema glTF chính thức](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.pbrMetallicRoughness.schema.json), RGB của base-color texture dùng sRGB, còn base-color factor là hệ số linear.

### 2. Khử răng cưa khi bật post-processing

[Engine.js](../src/core/Engine.js) yêu cầu `antialias: true`, nhưng [PostProcessing.js](../src/renderer/PostProcessing.js) vẽ scene vào color texture và depth renderbuffer không multisample. Đọc runtime xác nhận `contextAntialias = true` trong khi `sceneSamples = 0`. Chưa có pass FXAA/SMAA trong composite.

Nên thử FXAA làm bước đầu ít thay đổi, hoặc MSAA 2×/4× rồi resolve trước bloom. Với MSAA cần truy vấn sample count được hỗ trợ cho các attachment, đặc biệt đường HDR RGBA16F, và có fallback. [WebGL 2 có API tạo renderbuffer multisample](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/renderbufferStorageMultisample).

`Engine._resize()` cũng dùng CSS viewport × renderScale, chưa tính devicePixelRatio. Nên có lựa chọn độ phân giải có giới hạn cho màn hình DPI cao, đi kèm budget GPU; không tự động nhân DPR không giới hạn.

### 3. Fog và chuyển tiếp khoảng cách

[BasicShader.js](../src/shaders/BasicShader.js) chưa có fog cho terrain và opaque objects. [WaterShader.js](../src/shaders/WaterShader.js) có `uFogColor`, `uFogStart`, `uFogDensity`, nhưng [GameScene.js](../src/scenes/GameScene.js) không truyền chúng; runtime đọc `uFogDensity = 0`. MainMenuScene đã truyền các uniform này.

Nên lấy một bộ fog theo thời gian/thời tiết, dùng thống nhất cho đất, cây, công trình và nước; bổ sung fade theo khoảng cách cho props. Terrain Campaign được giữ tối thiểu 400 m trong khi props ở High chỉ hiện khoảng 130 m. Giữ mountain backdrop là hợp lý, nhưng cần làm mềm vùng chuyển tiếp. LOD terrain hiện đổi cứng ở 80/160 m; chỉ bổ sung blending/hysteresis nếu kiểm tra chuyển động cho thấy popping rõ.

### 4. Ánh sáng, bóng đổ và vật liệu

BasicShader có directional light, ambient theo hướng normal và một point light; chưa có shadow map hay ambient occlusion. Vì vậy bề mặt vẫn sáng dưới tán cây và vật thể thiếu dấu hiệu tiếp xúc.

Nên bắt đầu với shadow mặt trời quanh camera, soft PCF, giới hạn caster/range theo preset, cộng bóng tiếp xúc đơn giản cho động vật và resource. Chỉ triển khai SSAO sau khi đã có depth texture có thể sample; depth target hiện là renderbuffer. Ngày đêm thay đổi và cây có thể bị chặt nên bóng bake cần phạm vi sử dụng rõ.

[ModelAsset.js](../src/renderer/ModelAsset.js) mới giữ base-color factor/texture và mesh data; chưa đưa roughness, metallic, normal, AO, emissive vào drawable. Shader dùng độ bóng cố định cho mọi bề mặt. Nên thêm thông số vật liệu riêng cho gỗ, đá, lá, kim loại và vùng ướt, ưu tiên asset thường nhìn gần. Không cần tăng độ phức tạp vật liệu cho toàn bộ thư viện cùng lúc.

[CampaignController.lighting()](../src/systems/CampaignController.js) chọn một nguồn sáng theo thứ tự ưu tiên, nên đuốc và lửa gần nhau chưa cùng đóng góp ánh sáng. Có thể hỗ trợ một số ít point lights gần camera. Hiệu chỉnh độ đọc được lúc chạng vạng sau khi sửa màu; giữ đêm có độ tối phù hợp gameplay.

### 5. Mặt đất, cây cỏ và resource

[CampaignWorldGenerator._groundColor()](../src/gameplay/world/CampaignWorldGenerator.js) đã blend màu theo biome, độ dốc, bờ biển và đường mòn, nhưng `_chunkMesh()` chỉ cung cấp vertex colors và không có terrain texture. Bước mesh gần nhất là 1,25 m; các mảng màu lớn vẫn thiếu chi tiết khi nhìn gần.

Nên thêm TerrainShader riêng: phối cát/đất/cỏ/đá theo biome và slope, chi tiết màu ở quy mô nhỏ, độ ướt ở bờ, đá lộ trên dốc, vết đường và lá rụng. Có thể dùng texture nhỏ tile hoặc procedural phù hợp low-poly. Cỏ thấp, sỏi, rễ và lá trang trí nên tập trung trong vùng gần camera.

`_placeEnvironment()` đang lấy điểm ngẫu nhiên trên toàn đảo, giới hạn 2.400 props, dùng chung ô occupied 4 m cho các loại. Cần tách lớp cây lớn, bụi và ground cover; bố trí theo cụm, tạo khoảng trống có chủ ý, cho phép nhiều chi tiết nhỏ trong một vùng. Chỉ tăng tổng số props chưa giải quyết được bố cục.

Nên giảm màu lá quá gắt, hạn chế cây đỏ/cây chết và hoa hồng theo từng biome. Mangrove hiện được thiết kế là nền bãi triều khô; để có cảm giác ngập mặn hơn có thể thêm bùn, vệt ẩm và các vũng nông trang trí. Thay đổi độ cao địa hình/nước thật phải tính đến collision, navigation và world generation version để tránh làm lệch save cũ.

[WorldResource.js](../src/entities/WorldResource.js) có fallback cube, bob và xoay liên tục. Nên thay model trước cho resource thường gặp như đá, sợi, thực phẩm và quặng; wood/chest đã có đường model riêng. Có thể giữ dấu hiệu tương tác nhẹ, đồng thời giảm bob/xoay nếu muốn vật nhặt tự nhiên hơn.

### 6. Nước và chuyển động

Biển đã có displacement sóng, chi tiết normal bằng hàm sóng, Fresnel, glitter và foam. Không cần làm lại toàn bộ.

[Water._sampleSeabed()](../src/entities/Water.js) lấy độ sâu từ terrain nhưng tính hệ số shore theo bán kính tròn; bờ Campaign có vịnh và mũi đất. Trong seed mẫu, chênh lệch bán kính đường bờ cao độ 0 với bán kính dùng cho mask trung bình khoảng 6,8 m, tối đa khoảng 16,6 m. Đây là dấu hiệu mô hình mask không khớp, không phải phép đo sai lệch foam theo pixel. Nên xây shore mask từ đường bờ/độ sâu địa hình thực tế, làm foam vỡ và chuyển động không đều, thêm dải cát ướt. Phản chiếu trời hiện là trộn màu horizon với Fresnel; có thể nâng cấp phản chiếu procedural sky trước khi thử một reflection pass riêng.

Đường composite hiện chưa có xử lý hình ảnh riêng khi camera ở dưới nước. Có thể thêm hấp thụ màu và sương theo độ sâu, particles ít và caustics nhẹ ở preset phù hợp.

[EnvironmentObject.js](../src/entities/EnvironmentObject.js) và BasicShader chưa có gió cho foliage. Thêm vertex sway có trọng số theo phần tán lá, tránh làm thân và rễ trôi. [BiomeWildlife.js](../src/entities/BiomeWildlife.js) đang lắc toàn thân bằng sine khi di chuyển; animation chân, đầu, đuôi có thể bắt đầu từ part transforms rồi mới cân nhắc skinning. ModelAsset giữ tên animation nhưng chưa có bộ phát skeletal clips.

## Giữ hiệu năng khi nâng đồ họa

Đo trực tiếp một lần gọi `render()` cho mỗi camera bằng cách bọc tạm các hàm draw trong browser context kiểm tra, rồi khôi phục ngay:

| Góc chụp | Tổng draw calls thực tế | `_drawCalls` trên scene | Tam giác gửi để vẽ | Terrain chunks vẽ |
| --- | --- | --- | --- | --- |
| Bờ biển | 238 | 16 | 88.241 | 150 |
| Trại | 498 | 220 | 781.775 | 180 |
| Thác | 423 | 160 | 221.589 | 178 |
| Động vật | 258 | 32 | 90.885 | 154 |

Tổng thực tế gồm drawElements và drawArrays, bao gồm các pass toàn màn hình; số tam giác là số được submit, chưa xét clipping/occlusion. Đây không phải benchmark thời gian CPU/GPU. Dữ liệu ở [detail-inspection.json](../.cache/graphics-audit-2026-10-18/detail-inspection.json).

`GameScene._drawCalls` hiện chỉ đếm một số nhóm entity, bỏ qua nhiều draw của terrain, campaign models và post passes. Nên sửa bộ đếm và đo frame time/GPU time trước khi quyết định budget hiệu ứng. [Terrain.draw()](../src/entities/Terrain.js) mới cull theo khoảng cách, chưa theo frustum; thêm kiểm tra frustum cho chunks. Khi tăng foliage nên dùng instancing theo mesh/material và LOD theo loại cây. Cây bị chặt cần được cập nhật hoặc tách khỏi nhóm static.

Các benchmark cũ trong `tasks/performance-baseline.json` và `tasks/large-base-panning-performance.json` chủ yếu kiểm tra Low/Medium, 1280 × 800, sample ngắn. Chúng chưa chứng minh budget cho High/Ultra ở 1080p/1440p sau khi thêm shadows, AO và ground cover.

Preset nên có riêng AA, shadow distance/resolution, mật độ foliage, LOD và water effects. Low có thể giữ bóng tiếp xúc nhẹ, giảm ground cover và không AO; High/Ultra chỉ bật hiệu ứng nặng sau khi đo.

## Thứ tự triển khai đề xuất

1. Sửa tone mapping và quy định màu; thêm AA; nối fog. Chụp lại các camera đã lưu để so sánh.
2. Làm shadow quanh camera, bóng tiếp xúc và TerrainShader; hoàn thiện bờ biển xuất phát làm mẫu chất lượng.
3. Áp dụng palette, cây theo cụm và ground cover cho từng biome; thay resource cube thường thấy.
4. Hoàn thiện bờ nước, cảnh dưới nước, gió và animation động vật; nâng chi tiết landmark thác/trại.
5. Sau mỗi gói, đo frame time trên GPU tích hợp và GPU rời với preset, độ phân giải, thời tiết và camera chuyển động cố định; kiểm tra save cũ nếu thay world generation.

Tiêu chí nghiệm thu: cạnh lá mượt khi bật post-processing; vật thể có bóng gắn xuống đất; vật thể xa hòa vào trời; tăng độ sáng không làm vùng sáng tối đi; các biome nhận diện được qua đất, cây và bố cục; không mất độ đọc được lúc chạng vạng; frame-time p95 đáp ứng mục tiêu FPS đã chọn trên phần cứng mục tiêu.
